# 🚀 Agmoney Production Deployment Guide

Follow these steps to transition Agmoney from local development to a live production environment.

## 1. Supabase (Database & Auth)
- **Migrations**: Ensure all migrations in `/Agmoney/supabase/migrations` are applied to your production Supabase project.
- **Realtime**: Enable "Realtime" for the `agents` table in the Supabase Dashboard (Database -> Replication -> Source: `public` -> Select `agents`).
- **RLS**: Double-check that Row Level Security (RLS) is enabled for both `users_vault` and `agents` tables.

## 2. Guardian Proxy (Cloudflare Workers)
- **Secrets**: Set the following secrets in your Cloudflare project using `wrangler secret put`:
  - `SUPABASE_URL`: Your production Supabase URL.
  - `SUPABASE_ANON_KEY`: Your production Supabase Anon key.
- **Deploy**: Run the deployment command from the `/proxy` directory:
  ```bash
  npm run deploy
  ```

## 3. Dashboard (React)
- **Environment Variables**: Configure your host (Vercel/Netlify) with:
  - `VITE_SUPABASE_URL`: Production Supabase URL.
  - `VITE_SUPABASE_ANON_KEY`: Production Supabase Anon key.
- **Build & Deploy**: The host should use `npm run build` and target the `dist` directory.

## 4. Final Launch Checklist
- [ ] Test the "Vault" encryption/decryption loop with a real OpenAI key.
- [ ] Verify that deleting an agent in the dashboard immediately blocks requests in the proxy.
- [ ] Ensure the "Monthly Spend" resets correctly (or implement a monthly cron job for spend reset).
- [ ] Add a custom domain to the Cloudflare Worker (e.g., `api.agmoney.dev`).

---

**Security Note**: Never share your `encryption-salt` used in `lib/crypto.ts`. For production, consider moving the salt to a dynamic user-specific property or a server-side secret if possible.
