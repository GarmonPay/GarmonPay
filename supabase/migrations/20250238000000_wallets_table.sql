-- =============================================================================
-- Wallets table: one row per user for balance tracking (optional; app also uses public.users.balance).
-- Sync on signup: insert wallet when user is created.
-- =============================================================================

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  balance numeric not null default 0,
  created_at timestamptz default now(),
  unique(user_id)
);

create index if not exists wallets_user_id on public.wallets (user_id);
alter table public.wallets enable row level security;

-- Service role can do anything (admin API / sync-user)
drop policy if exists "Service role full access wallets" on public.wallets;
create policy "Service role full access wallets"
  on public.wallets for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- Users can read own wallet
drop policy if exists "Users can read own wallet" on public.wallets;
create policy "Users can read own wallet"
  on public.wallets for select
  using (auth.uid() = user_id);

comment on table public.wallets is 'Per-user wallet; balance also on public.users for compatibility.';
