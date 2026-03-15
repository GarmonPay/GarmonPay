-- Arena Season Pass: $9.99/mo Stripe subscription. Perks: double login coins, extra spin, 10% store discount, VIP access, exclusive title.
create table if not exists public.arena_season_pass (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_subscription_id text unique,
  status text not null default 'active' check (status in ('active','canceled','past_due')),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);
create index if not exists arena_season_pass_user_id on public.arena_season_pass(user_id);
create index if not exists arena_season_pass_stripe_sub on public.arena_season_pass(stripe_subscription_id);
