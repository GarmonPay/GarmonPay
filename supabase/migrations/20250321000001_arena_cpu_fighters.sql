-- Arena: 6 system users and 6 CPU fighters for tap-to-punch (one fighter per user).
-- public.users.id must exist in auth.users (users_auth_id_fkey).
-- Use auth upsert (ON CONFLICT) so existing auth rows are updated instead of failing.

do $arena_cpu$
declare
  cpu_ids uuid[] := array[
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000004'::uuid,
    'a0000000-0000-0000-0000-000000000005'::uuid,
    'a0000000-0000-0000-0000-000000000006'::uuid
  ]::uuid[];
  inst uuid := coalesce((select id from auth.instances limit 1), '00000000-0000-0000-0000-000000000000'::uuid);
  pw text := extensions.crypt('arena-cpu-internal', extensions.gen_salt('bf'));
begin
  perform set_config('row_security', 'off', true);

  delete from public.arena_fighters where user_id = any (cpu_ids);
  delete from public.wallets where user_id = any (cpu_ids);
  delete from public.users where id = any (cpu_ids);

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    ('a0000000-0000-0000-0000-000000000001', inst, 'authenticated', 'authenticated', 'arena-cpu-1@garmonpay.internal', pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('a0000000-0000-0000-0000-000000000002', inst, 'authenticated', 'authenticated', 'arena-cpu-2@garmonpay.internal', pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('a0000000-0000-0000-0000-000000000003', inst, 'authenticated', 'authenticated', 'arena-cpu-3@garmonpay.internal', pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('a0000000-0000-0000-0000-000000000004', inst, 'authenticated', 'authenticated', 'arena-cpu-4@garmonpay.internal', pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('a0000000-0000-0000-0000-000000000005', inst, 'authenticated', 'authenticated', 'arena-cpu-5@garmonpay.internal', pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('a0000000-0000-0000-0000-000000000006', inst, 'authenticated', 'authenticated', 'arena-cpu-6@garmonpay.internal', pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  on conflict (id) do update set
    instance_id = excluded.instance_id,
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at;
end
$arena_cpu$;

insert into public.users (id, email, balance, role, is_super_admin, created_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'arena-cpu-1@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000002', 'arena-cpu-2@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000003', 'arena-cpu-3@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000004', 'arena-cpu-4@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000005', 'arena-cpu-5@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000006', 'arena-cpu-6@garmonpay.internal', 0, 'user', false, now())
on conflict (id) do update set email = excluded.email;

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
