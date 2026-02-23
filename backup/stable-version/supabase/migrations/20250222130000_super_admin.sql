-- Add is_super_admin to users (admin auth: full access; cannot be deleted or role-changed by normal admin)
alter table public.users
  add column if not exists is_super_admin boolean not null default false;

create index if not exists users_is_super_admin on public.users (is_super_admin) where is_super_admin = true;
