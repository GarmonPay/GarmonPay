-- Single-row gamification config for admin dashboard.
-- Run in Supabase SQL Editor or: supabase db execute -f supabase/gamification.sql

create table if not exists gamification_config (
  id text primary key default 'default',
  referral_reward numeric default 1,
  spin_reward numeric default 0.5,
  created_at timestamptz default now()
);

insert into gamification_config (id, referral_reward, spin_reward)
values ('default', 1, 0.5)
on conflict (id) do nothing;
