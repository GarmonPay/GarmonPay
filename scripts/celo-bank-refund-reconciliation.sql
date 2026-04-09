-- C-Lo banker bank reconciliation (run in Supabase SQL editor or psql).
-- Pairs: create debit reference `celo_bank_deposit_<room_uuid>` (game_play, amount < 0)
--        refund credit `celo_bank_refund_<room_uuid>` (game_win, amount > 0)
-- Expect at most one non-null reference row each per room id extracted from the reference.

-- 1) Duplicate banker refund references (should be empty)
SELECT reference, COUNT(*) AS n
FROM wallet_ledger
WHERE reference LIKE 'celo_bank_refund_%'
GROUP BY reference
HAVING COUNT(*) > 1;

-- 2) Legacy timestamped close/delete refund refs (multiple rows per room possible — historical bug pattern)
SELECT
  reference,
  COUNT(*) AS n
FROM wallet_ledger
WHERE reference LIKE 'celo_room_close_bank_refund_%'
   OR reference LIKE 'celo_room_delete_refund_%'
GROUP BY reference
HAVING COUNT(*) > 1;

-- 3) Per-room deposit vs canonical refund (stable ref). Replace :banker_user_id with the banker’s profiles.id if needed.
-- Deposit row(s) and refund row(s) for rooms where refund cents exceed deposit magnitude (data issue).
WITH deposit AS (
  SELECT
    SUBSTRING(reference FROM '^celo_bank_deposit_(.+)$') AS room_id,
    user_id,
    SUM(amount) AS deposit_sum
  FROM wallet_ledger
  WHERE reference ~ '^celo_bank_deposit_[0-9a-f-]{36}$'
    AND type = 'game_play'
  GROUP BY 1, 2
),
refund AS (
  SELECT
    SUBSTRING(reference FROM '^celo_bank_refund_(.+)$') AS room_id,
    user_id,
    SUM(amount) AS refund_sum
  FROM wallet_ledger
  WHERE reference ~ '^celo_bank_refund_[0-9a-f-]{36}$'
    AND type = 'game_win'
  GROUP BY 1, 2
)
SELECT
  COALESCE(d.room_id, r.room_id) AS room_id,
  d.user_id AS deposit_user_id,
  d.deposit_sum AS deposit_cents,
  r.refund_sum AS refund_cents
FROM deposit d
FULL OUTER JOIN refund r ON d.room_id = r.room_id AND d.user_id = r.user_id
WHERE ABS(COALESCE(r.refund_sum, 0)) > ABS(COALESCE(d.deposit_sum, 0))
   OR (d.room_id IS NULL AND r.room_id IS NOT NULL)
   OR (d.room_id IS NOT NULL AND r.room_id IS NULL);

-- 4) Rooms with more than one canonical banker refund row (should be empty)
SELECT
  SUBSTRING(reference FROM '^celo_bank_refund_(.+)$') AS room_id,
  user_id,
  COUNT(*) AS refund_rows,
  SUM(amount) AS total_refund_cents
FROM wallet_ledger
WHERE reference ~ '^celo_bank_refund_[0-9a-f-]{36}$'
  AND type = 'game_win'
GROUP BY 1, 2
HAVING COUNT(*) > 1;
