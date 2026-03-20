-- Gamification config: single-row table for admin dashboard.
create table if not exists gamification_config (
  id text primary key default 'default',
  referral_reward numeric default 1,
  spin_reward numeric default 0.5,
  created_at timestamptz default now()
);

-- Legacy DBs may already have gamification_config with a different shape; align columns.
alter table public.gamification_config add column if not exists referral_reward numeric default 1;
alter table public.gamification_config add column if not exists spin_reward numeric default 0.5;
alter table public.gamification_config add column if not exists created_at timestamptz default now();

update public.gamification_config
set
  referral_reward = coalesce(referral_reward, 1),
  spin_reward = coalesce(spin_reward, 0.5);

-- Text PK (this migration): seed 'default'. UUID PK (legacy create_gamification_config): skip.
do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'gamification_config'
      and c.column_name = 'id'
      and c.data_type = 'text'
  ) then
    insert into public.gamification_config (id, referral_reward, spin_reward)
    values ('default', 1, 0.5)
    on conflict (id) do nothing;
  end if;
end $$;
