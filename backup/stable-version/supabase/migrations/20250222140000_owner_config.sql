-- Owner / god-mode flags: pause ads, pause withdrawals, maintenance mode.
create table if not exists public.owner_config (
  id text primary key default 'default',
  pause_ads boolean not null default false,
  pause_withdrawals boolean not null default false,
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.owner_config (id) values ('default') on conflict (id) do nothing;

alter table public.owner_config enable row level security;
create policy "Service role owner_config"
  on public.owner_config for all
  using (auth.jwt() ->> 'role' = 'service_role');
