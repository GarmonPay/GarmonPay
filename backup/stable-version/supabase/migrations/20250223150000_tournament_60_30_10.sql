-- 60/30/10 tournament profit split: prize_pool (60%), platform_profit (30%), reserve_balance (10%).
-- Payouts only from prize_pool; platform_profit and reserve_balance are locked.

alter table public.tournaments
  add column if not exists platform_profit numeric not null default 0,
  add column if not exists reserve_balance numeric not null default 0;

comment on column public.tournaments.platform_profit is '30% of entry fees; not paid out';
comment on column public.tournaments.reserve_balance is '10% of entry fees; tracked separately';
