/**
 * Web Crypto API wrapper for AES-256-GCM encryption/decryption.
 */

export async function encryptKey(plainText: string, userNamespace: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  
  // Use a combination of user-specific salt and a derivation function for a production-grade implementation.
  // For MVP, we'll focus on the raw encryption flow.
  const password = encoder.encode(userNamespace);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    password,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Use env secret for salt to prevent rainbow table attacks if DB leaks
  const vaultSecret = import.meta.env.VITE_VAULT_SECRET || 'agmoney-fallback-salt';
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(vaultSecret),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}
