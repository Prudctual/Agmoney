# 🎯 Agmoney Project Context (Part 1)

## Project Vision
Agmoney is a **Financial Firewall** and **Smart Proxy Gateway** for autonomous AI agents. Its primary mission is to prevent "runaway costs" by enforcing hard budget caps in real-time.

## Problem Statement
Autonomous agents (AutoGPT, BabyAGI, etc.) often have direct access to a user's master OpenAI API key. If a loop is buggy or an agent goes rogue, it can burn through hundreds of dollars in minutes. LLM providers lack the granular, per-agent budget controls needed for safe autonomy.

## The Solution: Agmoney
Agmoney generates "Guardian Keys" (`ag_sk_...`) for each agent. These keys are used in place of the master provider key. The Agmoney Proxy intercepts every request to perform the following:
1. **Authentication**: Validates the Guardian Key.
2. **Budget Check**: Verified if the specific agent has exceeded its USD budget.
3. **Decryption**: Ephemerally decrypts the user's master OpenAI key from a secure "Vault".
4. **Injection**: Forwards the request to OpenAI with the master key.
5. **Accounting**: Calculates the cost of the response asynchronously and updates the agent's spend.

## Technical Architecture
- **Proxy Engine**: Cloudflare Workers (Hono) for global low-latency.
- **Management Dashboard**: React (Vite) with a Vercel-inspired glassmorphism UI.
- **Database & Identity**: Supabase (PostgreSQL with RLS).
- **Security Strategy**: AES-256-GCM encryption using the Web Crypto API, with PBKDF2 key derivation.

## Codebase Status
- [x] Database Schema & RLS Policies implemented.
- [x] Secure "Vault" encryption/decryption loop implemented.
- [x] High-performance Proxy with async cost accounting implemented.
- [x] Real-time Dashboard with spend monitoring implemented.
- [x] Production deployment documentation ready.
