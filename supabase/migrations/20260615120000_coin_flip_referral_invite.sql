-- Refer-a-friend Coin Flip: invite-only flips (50 GPC stake, joiner picks side).

BEGIN;

ALTER TABLE public.coin_flip_games
  ADD COLUMN IF NOT EXISTS is_referral_flip boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coin_flip_games.is_referral_flip IS
  'Invite-only referral flip: 50 GPC stake, joiner picks side, excluded from public lobby.';

ALTER TABLE public.coin_flip_games
  ALTER COLUMN creator_side DROP NOT NULL;

ALTER TABLE public.coin_flip_games
  DROP CONSTRAINT IF EXISTS coin_flip_games_creator_side_check;

ALTER TABLE public.coin_flip_games
  ADD CONSTRAINT coin_flip_games_creator_side_check
  CHECK (
    creator_side IS NULL
    OR creator_side IN ('heads', 'tails')
  );

ALTER TABLE public.coin_flip_games
  DROP CONSTRAINT IF EXISTS coin_flip_referral_flip_creator_side_waiting;

ALTER TABLE public.coin_flip_games
  ADD CONSTRAINT coin_flip_referral_flip_creator_side_waiting
  CHECK (
    NOT is_referral_flip
    OR status <> 'waiting'
    OR creator_side IS NULL
  );

CREATE INDEX IF NOT EXISTS coin_flip_games_referral_waiting_idx
  ON public.coin_flip_games (id)
  WHERE is_referral_flip AND status = 'waiting';

COMMIT;
