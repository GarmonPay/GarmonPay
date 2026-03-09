/* Ban/suspend users. Admin can set banned = true; auth and API reject banned users. */
alter table public.users add column if not exists banned boolean not null default false;
alter table public.users add column if not exists banned_reason text;
create index if not exists users_banned on public.users (banned) where banned = true;
comment on column public.users.banned is 'If true, user cannot login or use API.';
comment on column public.users.banned_reason is 'Optional reason (admin note).';
