-- Unpaid members default to Free — not Starter. Expand allowed values; migrate legacy rows.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_membership_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_membership_check
  CHECK (membership IN ('free', 'starter', 'growth', 'pro', 'elite', 'vip', 'active'));

ALTER TABLE public.users ALTER COLUMN membership SET DEFAULT 'free';

-- Historical bug: default was 'starter' for everyone. Move true non-subscribers to Free.
UPDATE public.users u
SET membership = 'free', updated_at = now()
WHERE u.membership = 'starter'
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = u.id
      AND s.status = 'active'
  );
