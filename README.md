# 🛡️ Agmoney: The Financial Guardian for AI

<div align="center">

**Agmoney** is a "Financial Firewall" and smart proxy gateway designed to sit between autonomous AI agents and LLM providers like OpenAI. It prevents "runaway costs" by enforcing hard budget caps in real-time.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **The Vault** | AES-256-GCM encryption for your OpenAI Master Keys |
| ⚡ **Guardian Proxy** | Low-latency Cloudflare Worker with streaming support |
| 📊 **Real-Time Dashboard** | Vercel-inspired UI with live spend tracking |
| 🚫 **Hard Budget Caps** | Strict enforcement that blocks requests instantly |
| ⚛️ **Atomic Accounting** | Async cost calculation using `ctx.waitUntil()` |
| 🔴 **Kill Switch** | Instantly invalidate any agent key with one click |
| 💓 **Live Heartbeat** | Pulsing indicator when agents are actively spending |

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   AI Agent  │────▶│  Guardian Proxy  │────▶│   OpenAI    │
│  (ag_sk_*)  │     │  (Budget Check)  │     │   (gpt-4o)  │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │   Supabase   │
                    │  (Vault/RLS) │
                    └──────────────┘
```

**Tech Stack:**
- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Proxy**: Cloudflare Workers + Hono
- **Database**: Supabase (PostgreSQL with RLS)
- **Encryption**: Web Crypto API (PBKDF2 + AES-GCM-256)

---

## 📁 Project Structure

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
└── README.md           # You are here
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- Supabase account
- Cloudflare account (for deployment)

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/agmoney.git
cd agmoney

# Install Dashboard dependencies
cd dashboard && npm install

# Install Proxy dependencies
cd ../proxy && npm install
```

### 2. Supabase Setup

1. Create a new Supabase project
2. Run the migration in `supabase/migrations/20260131_init.sql`
3. Enable **Realtime** for the `agents` table
4. Configure Auth → Providers → Enable **Email** (disable confirmation for dev)

### 3. Environment Variables

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

> ⚠️ **Important**: `VITE_VAULT_SECRET` and `MASTER_KEY_SECRET` must be identical!

### 4. Run Locally

```bash
# Terminal 1: Dashboard
cd dashboard && npm run dev
# → http://localhost:5173

# Terminal 2: Proxy
cd proxy && npm run dev
# → http://localhost:8787
```

### 5. Test Login

1. Navigate to http://localhost:5173
2. Sign up with any email/password
3. Set up your Vault with an OpenAI key
4. Create your first Guardian Agent!

---

## 🔧 Agent Integration

Update your AI agent to use the Agmoney proxy:

```python
from openai import OpenAI

client = OpenAI(
    api_key="ag_sk_your_agent_key",      # From Agmoney Dashboard
    base_url="http://localhost:8787/v1"   # Agmoney Proxy
)

# Standard request
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Streaming Support

Agmoney fully supports **real-time streaming** with zero buffering:

```python
# Enable streaming to test Agmoney's real-time piping
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Write a long poem about AI economy."}],
    stream=True  # Agmoney pipes chunks instantly!
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

> 💡 **Pro Tip**: Watch your dashboard while streaming - the spend progress bar updates in real-time!

---

## 🛡️ Security Model

| Layer | Protection |
|-------|------------|
| **Encryption** | AES-256-GCM with PBKDF2 key derivation |
| **Storage** | Keys encrypted before leaving browser |
| **Transit** | TLS + ephemeral decryption in Worker memory |
| **Access** | Supabase RLS policies per user |
| **Fail-Safe** | 503 if auth service unreachable (fail-closed) |

---

## 📖 Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment guide
- [Supabase Migrations](./supabase/migrations/) - Database schema

---

## 📜 License

[MIT License](LICENSE) - Built with ❤️ by Jasim Karim
