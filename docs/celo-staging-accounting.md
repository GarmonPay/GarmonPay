# C-Lo staging — accounting verification

Use this checklist in **staging** with the **admin UI** and server logs. No automated script mutates data.

## Operator setup

1. **Admin** → **C-Lo audit** (`/admin/celo-audit`): enter `roomId` (and optional `roundId`), run audit. Inspect JSON:
   - `traces[].trace` — per-round ledger categories, payout refs, platform fees, player rolls.
   - `traces[].consistency` — `issues` / `warnings` / `checks`.
   - `room_bank` — `current_bank_sc`, last completed round, `flags`.
2. **Server logs**: set `CELO_ACCOUNTING_AUDIT_LOG=1` (or run in development) to emit `[C-Lo accounting audit]` lines for:
   - settlement finalize skipped (already complete / idempotent)
   - join / sidebet refunds
   - `credit_gpay_idempotent_duplicate_ok`
   - `platform_earnings_insert_duplicate_ignored`

Existing `[C-Lo accounting]` dev logs are unchanged (`NODE_ENV=development`).

## Scenarios to exercise

| Scenario | Expected |
|----------|----------|
| Join once | One `celo_join_<roomId>_<userId>` debit; balance −entry |
| Double-tap join | Second request: idempotent seated or duplicate debit treated as seated; **audit** logs `join_debit_duplicate_treated_seated` when applicable |
| Banker instant win | One `celo_round_banker_win_<roundId>` credit; `platform_earnings` with `celo_pf_<roundId>_banker_table`; room bank +bankerWins in API path |
| Banker instant loss | One `celo_round_players_win_<roundId>_<userId>` per paid player; finalize once |
| Point path / last player | Player credits with `celo_player_win_` or `celo_player_point_`; round `completed`; single player-phase finalize |
| Sidebet create / accept duplicate | Idempotent debit refs; refund logs if DB update fails after debit |
| Refresh during settlement | At most one winning finalize; audit may show `settlement_finalize_skipped_already_complete` |

After each scenario, run **C-Lo audit** for the room and confirm:

- `consistency.ok === true` (or only expected warnings).
- `payout_references_observed` matches the scenario.
- No `duplicate_payout_reference_rows`.
- For last banker instant win, `room_bank.flags` empty and trace `bank_context.bank_credit_matches_instant_win` true.

## Suspicious signals (report-only)

- `issues`: active status + `completed_at`, duplicate payout refs, multiple win credits per user per round, banker credit ≠ prize − fee on instant win.
- `warnings`: missing banker win row when round says instant_win completed.
- `room_bank.flags`: last completed instant win vs ledger mismatch.
