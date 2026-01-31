-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Table: users_vault
-- Stores the encrypted OpenAI Master Key for each user.
create table public.users_vault (
  user_id uuid references auth.users(id) not null primary key,
  encrypted_provider_key text not null,
  encryption_iv text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Table: agents
-- Stores the budget and spending details for each agent.
create table public.agents (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  name text not null,
  api_key_hash text not null,
  budget_limit decimal(10, 4) not null default 0.0000,
  current_spend decimal(10, 4) not null default 0.0000,
  status text check (status in ('active', 'paused', 'frozen')) default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for fast lookup of agents by API key hash
create index idx_agents_api_key_hash on public.agents(api_key_hash);
create index idx_agents_user_id on public.agents(user_id);

-- Enable Row Level Security (RLS)
alter table public.users_vault enable row level security;
alter table public.agents enable row level security;

-- RLS Policies for users_vault
-- Users can only view and edit their own vault entry.
create policy "Users can view their own vault"
  on public.users_vault for select
  using (auth.uid() = user_id);

create policy "Users can insert their own vault"
  on public.users_vault for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own vault"
  on public.users_vault for update
  using (auth.uid() = user_id);

-- RLS Policies for agents
-- Users can only view and manage their own agents.
create policy "Users can view their own agents"
  on public.agents for select
  using (auth.uid() = user_id);

create policy "Users can insert their own agents"
  on public.agents for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own agents"
  on public.agents for update
  using (auth.uid() = user_id);

create policy "Users can delete their own agents"
  on public.agents for delete
  using (auth.uid() = user_id);

-- Function: increment_agent_spend
-- Atomically increases the agent's current spend.
create or replace function public.increment_agent_spend(agent_id uuid, amount decimal(10, 4))
returns void as $$
begin
  update public.agents
  set current_spend = current_spend + amount,
      updated_at = now()
  where id = agent_id;
end;
$$ language plpgsql security definer;

