-- Tournament types: daily (coins), weekly $5, monthly $20, VIP $50.
alter table public.arena_tournaments add column if not exists tournament_type text default 'weekly' check (tournament_type in ('daily','weekly','monthly','vip'));
alter table public.arena_tournaments add column if not exists entry_coin_fee int default 0;
comment on column public.arena_tournaments.entry_coin_fee is 'For daily free roll: entry cost in arena coins. 0 = use entry_fee (real money).';
