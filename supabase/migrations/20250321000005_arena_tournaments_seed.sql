-- Seed one open tournament per type for testing. Admin can create more via dashboard.
insert into public.arena_tournaments (name, tournament_type, entry_fee, entry_coin_fee, prize_pool, max_fighters, status) values
  ('Daily Free Roll', 'daily', 0, 100, 0, 8, 'open'),
  ('Weekly $5', 'weekly', 5, 0, 0, 8, 'open'),
  ('Monthly $20', 'monthly', 20, 0, 0, 8, 'open'),
  ('VIP $50', 'vip', 50, 0, 0, 8, 'open')
;
