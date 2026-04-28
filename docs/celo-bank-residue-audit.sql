-- C-Lo residue audit (read-only): find completed rounds where room bank still has residue.
-- Do NOT auto-sweep. Review totals first.

-- Summary total residue across completed rounds.
WITH completed AS (
  SELECT
    r.id AS round_id,
    r.room_id,
    r.round_number,
    r.completed_at,
    rm.current_bank_sc,
    COALESCE(r.platform_fee_sc, 0) AS platform_fee_sc,
    COALESCE(r.banker_winnings_sc, 0) AS banker_winnings_sc
  FROM public.celo_rounds r
  JOIN public.celo_rooms rm ON rm.id = r.room_id
  WHERE r.status = 'completed'
)
SELECT
  COUNT(*) FILTER (WHERE current_bank_sc > 0) AS rounds_with_residue,
  COALESCE(SUM(current_bank_sc) FILTER (WHERE current_bank_sc > 0), 0) AS total_residue_sc
FROM completed;

-- Per-round breakdown (latest first).
SELECT
  r.id AS round_id,
  r.room_id,
  r.round_number,
  r.completed_at,
  rm.current_bank_sc AS residue_sc,
  r.banker_dice_result,
  r.push,
  COALESCE(r.banker_winnings_sc, 0) AS banker_winnings_sc,
  COALESCE(r.platform_fee_sc, 0) AS platform_fee_sc
FROM public.celo_rounds r
JOIN public.celo_rooms rm ON rm.id = r.room_id
WHERE r.status = 'completed'
  AND rm.current_bank_sc > 0
ORDER BY r.completed_at DESC NULLS LAST;
