-- Arena: 6 system users and 6 CPU fighters for tap-to-punch (one fighter per user).
-- System users have no auth; used only as owners of CPU arena_fighters.

insert into public.users (id, email, balance, role, is_super_admin, created_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'arena-cpu-1@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000002', 'arena-cpu-2@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000003', 'arena-cpu-3@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000004', 'arena-cpu-4@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000005', 'arena-cpu-5@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000006', 'arena-cpu-6@garmonpay.internal', 0, 'user', false, now())
on conflict (id) do update set email = excluded.email;

-- 6 CPU fighters (Brawler, Boxer, Slugger, Counter Puncher, Swarmer, Technician)
insert into public.arena_fighters (
  user_id, name, style, avatar,
  strength, speed, stamina, defense, chin, special
) values
  ('a0000000-0000-0000-0000-000000000001', 'Brutus', 'Brawler', '🥊', 65, 45, 50, 45, 60, 25),
  ('a0000000-0000-0000-0000-000000000002', 'Shadow', 'Boxer', '🥊', 52, 62, 55, 58, 48, 28),
  ('a0000000-0000-0000-0000-000000000003', 'Tank', 'Slugger', '🥊', 72, 38, 48, 42, 65, 30),
  ('a0000000-0000-0000-0000-000000000004', 'Slick', 'Counter Puncher', '🥊', 48, 58, 52, 68, 50, 32),
  ('a0000000-0000-0000-0000-000000000005', 'Rush', 'Swarmer', '🥊', 55, 68, 58, 44, 48, 26),
  ('a0000000-0000-0000-0000-000000000006', 'Ice', 'Technician', '🥊', 50, 55, 54, 62, 52, 35)
on conflict (user_id) do nothing;
