# Agmoney

Agmoney is a budget proxy between AI agents and OpenAI. Each agent uses an `ag_sk_...` key instead of your master API key. The proxy checks that agent's budget before forwarding the request, then records spend.

Written by Jasim Kareem.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

| Feature | Description |
|---------|-------------|
| Vault encryption | AES-256-GCM (PBKDF2) for the OpenAI master key; encryption happens in the browser before storage |
| Budget proxy | Cloudflare Worker (Hono) that validates the agent key, checks budget, and supports streaming |
| Dashboard | React + Vite UI with live spend tracking via Supabase Realtime |
| Hard budget caps | Requests are blocked with HTTP 402 when `current_spend` reaches `budget_limit` |
| Async accounting | Cost is calculated after the response using `ctx.waitUntil()` and `increment_agent_spend` |
| Kill switch | Deleting an agent in the dashboard removes its key; later requests get 401 |
| Live spend indicator | Dashboard highlights an agent when Realtime reports a spend update |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   AI Agent  │────▶│  Budget Proxy    │────▶│   OpenAI    │
│  (ag_sk_*)  │     │  (Cloudflare)    │     │   (gpt-4o)  │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │   Supabase   │
                    │  (Vault/RLS) │
                    └──────────────┘
```

**Stack**

- Dashboard: React, Vite, TypeScript, Tailwind CSS, shadcn/ui
- Proxy: Cloudflare Workers, Hono
- Database: Supabase (PostgreSQL with RLS)
- Encryption: Web Crypto API (PBKDF2 + AES-256-GCM)

## Project structure

```
Agmoney/
├── dashboard/          # React dashboard (Vite)
│   ├── src/
│   │   ├── App.tsx     # Main application
│   │   └── lib/
│   │       ├── crypto.ts   # Encryption utilities
│   │       └── supabase.ts # Supabase client
├── proxy/              # Cloudflare Worker
│   └── src/
│       └── index.ts    # Proxy logic with streaming
├── supabase/           # Database migrations
│   └── migrations/
├── DEPLOYMENT.md       # Production deployment guide
└── README.md
```

## Quick start

### Prerequisites

- Node.js v18+
- A Supabase project
- A Cloudflare account (needed to deploy the Worker; local proxy uses Wrangler)

### 1. Clone and install

```bash
git clone https://github.com/Prudctual/Agmoney.git
cd Agmoney

# Dashboard
cd dashboard && npm install

# Proxy
cd ../proxy && npm install
```

### 2. Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/20260131_init.sql` in the SQL editor.
3. Enable Realtime for the `agents` table (Database → Replication).
4. Auth → Providers → enable Email. For local development you can turn off email confirmation.

### 3. Environment variables

These names match the dashboard and Worker source. `VITE_VAULT_SECRET` and `MASTER_KEY_SECRET` must be the same string. The Worker uses that value as the PBKDF2 salt when decrypting the vault key.

**Dashboard** (`dashboard/.env`):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VAULT_SECRET=your-random-secret-string
```

**Proxy** (`proxy/.dev.vars`):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
MASTER_KEY_SECRET=your-random-secret-string
```

### 4. Run locally

```bash
# Terminal 1: Dashboard → http://localhost:5173
cd dashboard && npm run dev

# Terminal 2: Proxy → http://localhost:8787
cd proxy && npm run dev
```

### 5. First login

1. Open http://localhost:5173
2. Sign up with email and password
3. Store an OpenAI key in the vault
4. Create an agent and copy the `ag_sk_...` key

## Agent integration

Point the OpenAI client at the proxy and use the agent key:

```python
from openai import OpenAI

client = OpenAI(
    api_key="ag_sk_your_agent_key",       # from the dashboard
    base_url="http://localhost:8787/v1"   # local proxy
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Streaming

The Worker forwards SSE chunks as they arrive. For streams it sets `stream_options.include_usage` so it can update spend after the last chunk.

```python
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Write a short poem."}],
    stream=True,
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

Spend on the dashboard updates when the Worker writes to `agents` and Realtime pushes the change.

## Security

| Layer | Behavior |
|-------|----------|
| Encryption | AES-256-GCM with PBKDF2 key derivation |
| Storage | Master key is encrypted in the browser before it is sent to Supabase |
| Transit | TLS; the Worker decrypts the key in memory for the upstream request |
| Access | Supabase RLS so each user only sees their own vault and agents |
| Fail-closed | HTTP 503 if the auth lookup against Supabase fails |
| Budget | HTTP 402 when the agent is at or over its limit |
| Inactive key | HTTP 403 if the agent `status` is not `active`; HTTP 401 if the key is unknown |

## Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) — production deploy (Supabase, Cloudflare Worker, dashboard host)
- [Supabase migrations](./supabase/migrations/) — schema, RLS, and `increment_agent_spend`

## License

MIT License. Jasim Kareem.
