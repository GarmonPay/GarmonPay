-- Shared static "felt" dice before the banker commits a real roll (Option B).
-- Generated once per round at insert; all clients read the same JSON triplet via realtime.

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS idle_preview_dice jsonb;

COMMENT ON COLUMN public.celo_rounds.idle_preview_dice IS
  'Optional [d1,d2,d3] with each 1–6, set when round is created (banker_rolling). Shown static until banker_roll completes and banker_dice is written.';
