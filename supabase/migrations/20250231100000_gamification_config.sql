-- Gamification config: single-row table for admin dashboard.
create table if not exists gamification_config (
  id text primary key default 'default',
  referral_reward numeric default 1,
  spin_reward numeric default 0.5,
  created_at timestamptz default now()
);

insert into gamification_config (id, referral_reward, spin_reward)
values ('default', 1, 0.5)
on conflict (id) do nothing;
