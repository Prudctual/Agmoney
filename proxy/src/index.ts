import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  MASTER_KEY_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

async function decryptKey(encryptedB64: string, ivB64: string, userNamespace: string, secretSalt: string) {
  const encoder = new TextEncoder();
  const encrypted = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const password = encoder.encode(userNamespace);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    password,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(secretSalt || 'agmoney-fallback-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}

app.post('/v1/chat/completions', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ag_sk_')) {
    return c.json({ error: 'Invalid Agmoney key format' }, 401);
  }

  const agKey = authHeader.replace('Bearer ', '');
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);

  let agent: any;
  
  // 1. Fail-Closed Auth & Lookup
  try {
    const { data, error } = await supabase
      .from('agents')
      .select('*, users_vault(encrypted_provider_key, encryption_iv)')
      .eq('api_key_hash', agKey)
      .maybeSingle();

    if (error) {
      console.error('Supabase Error:', error);
      return c.json({ error: 'Authorization Service Unavailable' }, 503);
    }

    if (!data) {
      return c.json({ error: 'Invalid Agmoney key' }, 401);
    }
    
    agent = data;
  } catch (err) {
    console.error('Unexpected Auth Error:', err);
    return c.json({ error: 'Authorization Service Unavailable' }, 503);
  }

  if (agent.status !== 'active') {
    return c.json({ error: `Agent is ${agent.status}` }, 403);
  }

  // 2. Budget Guard
  if (Number(agent.current_spend) >= Number(agent.budget_limit)) {
    return c.json({ 
      error: 'Budget exceeded', 
      current_spend: agent.current_spend, 
      limit: agent.budget_limit 
    }, 402);
  }

  // 3. Decrypt Master Key
  const vault = (agent as any).users_vault;
  if (!vault || !vault.encrypted_provider_key) {
    return c.json({ error: 'Master OpenAI key not found in vault' }, 500);
  }

  let masterKey: string;
  try {
    masterKey = await decryptKey(
      vault.encrypted_provider_key,
      vault.encryption_iv,
      agent.user_id,
      c.env.MASTER_KEY_SECRET || 'agmoney-fallback-salt'
    );
  } catch (err) {
    console.error('Decryption failed', err);
    return c.json({ error: 'Failed to decrypt master key' }, 500);
  }

  // 4. Prepare Request
  const body = await c.req.json();
  const isStreaming = body.stream === true;

  if (isStreaming) {
    // Ensure we get usage stats for streaming
    if (!body.stream_options) {
      body.stream_options = {};
    }
    body.stream_options.include_usage = true;
  }

  const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${masterKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!openAiResponse.ok) {
    const errorData = await openAiResponse.json();
    return c.json(errorData, openAiResponse.status as any);
  }

  // 5. Handle Response (Streaming vs Non-Streaming)
  if (isStreaming) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = openAiResponse.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    if (!reader) {
      return c.json({ error: 'Failed to read upstream stream' }, 500);
    }

    // Process the stream asynchronously
    c.executionCtx.waitUntil((async () => {
      let accumulatedUsage: any = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Forward chunk immediately
          await writer.write(value);

          // Snoop for usage in the chunk
          const chunkStr = decoder.decode(value, { stream: true });
          const lines = chunkStr.split('\n');
          
          for (const line of lines) {
            if (line.trim() === 'data: [DONE]') continue;
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.usage) {
                  accumulatedUsage = data.usage;
                }
              } catch (e) {
                // Ignore parse errors for partial chunks
              }
            }
          }
        }
      } catch (e) {
        console.error('Stream processing error:', e);
      } finally {
        await writer.close();
        
        // Update Spend if we found usage
        if (accumulatedUsage) {
          const cost = (accumulatedUsage.prompt_tokens * 0.000005) + (accumulatedUsage.completion_tokens * 0.000015);
          const { error } = await supabase.rpc('increment_agent_spend', { 
            agent_id: agent.id, 
            amount: cost 
          });
          if (error) console.error('Stream spend update error:', error.message);
        }
      }
    })());

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } else {
    // Non-streaming handling (Legacy/Standard)
    const result: any = await openAiResponse.json();
    
    if (result.usage) {
      const cost = (result.usage.prompt_tokens * 0.000005) + (result.usage.completion_tokens * 0.000015);
      c.executionCtx.waitUntil((async () => {
        const { error } = await supabase.rpc('increment_agent_spend', { 
          agent_id: agent.id, 
          amount: cost 
        });
        if (error) console.error('Spend update error:', error.message);
      })());
    }

    return c.json(result);
  }
});

export default app;
