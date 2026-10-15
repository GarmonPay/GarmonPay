# C-Lo lifecycle repair report — October 5, 2026

## Status

The tested repair and two C-Lo migrations are live at **garmonpay.com**. Hosting reports the release Ready and confirms the production domain alias. **The real production two-account wager lifecycle is not yet verified.** No designated production test accounts or authorized test budget were provided. The game must not be described as fully production-validated until that test succeeds.

## Root cause

The inspected live room had two seated users, but the player had posted no entry. Seating alone does not fund a wager. The player saw a circular waiting-for-banker prompt, while the banker legitimately could not start without a posted entry. Multiple client reads, synthetic clocks and duplicate subscriptions could then disagree about posted entries and round state. The old start/begin paths and large settlement handler made separate financial/state writes instead of one transaction.

Additional accounting defects included banker profit credited both to the wallet and table escrow, bank reductions without wallet refunds, cleanup losing the remaining escrow, and side-bet routes using columns absent from the production schema. Accepted rolls could be stranded by request interruption. Browser realtime connection failures could throw instead of allowing polling recovery.

## Files changed

Only the following paths differ from the recovery snapshot for this task. All earlier changes were preserved.

- `supabase/migrations/20261005010000_celo_atomic_lifecycle.sql`
- `supabase/migrations/20261005020000_celo_recovery_schedule.sql`
- `scripts/celo/lifecycle-fixture.mjs`
- `scripts/celo/local-lifecycle-server.mjs`
- `scripts/celo/browser-lifecycle.mjs`
- `scripts/celo/schema-fixture.json`
- `scripts/celo/validate-lifecycle-db.mjs`
- `src/app/design-system.css`
- `src/app/dashboard/games/celo/[roomId]/page.tsx`
- `src/app/api/celo/room/pause/route.ts`
- `src/app/api/celo/room/join/route.ts`
- `src/app/api/celo/room/delete/route.ts`
- `src/app/api/celo/room/resume/route.ts`
- `src/app/api/celo/room/pause-vote/route.ts`
- `src/app/api/celo/room/pause-vote/reset/route.ts`
- `src/app/api/celo/room/lower-bank/route.ts`
- `src/app/api/celo/room/state/route.ts`
- `src/app/api/celo/room/update-rules/route.ts`
- `src/app/api/celo/room/create/route.ts`
- `src/app/api/celo/room/new-banker-setup/route.ts`
- `src/app/api/celo/room/leave/route.ts`
- `src/app/api/celo/bank/add/route.ts`
- `src/app/api/celo/banker-takeover/route.ts`
- `src/app/api/celo/sidebet/accept/route.ts`
- `src/app/api/celo/sidebet/create/route.ts`
- `src/app/api/celo/post-entry/route.ts`
- `src/app/api/celo/rooms/cleanup-abandoned/route.ts`
- `src/app/api/celo/round/roll/route.ts`
- `src/app/api/celo/round/start/route.ts`
- `src/app/api/celo/round/begin-rolls/route.ts`
- `src/app/api/celo/cron/player-timeouts/route.ts`
- `src/components/celo/RollNameDisplay.tsx`
- `src/components/celo/street/CeloDiceScene.tsx`
- `src/components/celo/street/CeloFeltDice.tsx`
- `src/hooks/useCoins.ts`
- `src/lib/celo-room-dice.ts`
- `src/lib/celo-api-fetch.test.ts`
- `src/lib/celo-api-fetch.ts`
- `src/lib/celo-sidebet-settlement.ts`
- `src/lib/celo-actions.ts`
- `src/lib/celo-engine.test.ts`
- `src/lib/celo-room-dice.test.ts`
- `src/lib/celo-player-timeout.ts`
- `src/lib/celo-pause-cleanup.ts`
- `src/lib/celo-roll-action.ts`
- `src/lib/celo/celoStateMerge.test.ts`
- `src/lib/celo/celoStateMerge.ts`
- `scripts/celo/README.md`
- `docs/design/celo-lifecycle-repair-report.md`

## Database changes

Applied only `20261005010000_celo_atomic_lifecycle.sql` and `20261005020000_celo_recovery_schedule.sql`, and recorded these versions in the migration journal. Both are additive, were applied twice in the local fixture, and compiled against production inside a rolled-back transaction before application. No unrelated pending migration was applied.

Added accepted-roll claims, roll sequences, historical entry/settlement snapshots, side-bet debit references and a service-only action receipt table. Financial operations are transactional service-only functions. Ordinary `anon`/`authenticated` roles cannot write the five C-Lo financial tables or execute privileged financial functions. Public read helpers needed for existing RLS remain available.

Added one named database recovery job, `garmonpay-celo-lifecycle-recovery`, every 10 seconds. It completes already accepted dice, enforces existing overdue-player forfeits and existing pause/abandonment cleanup. It never generates new dice or calls external services. This avoids the hosting plan's daily-only web-job cadence. [Supabase Cron documentation](https://supabase.com/docs/guides/cron/quickstart).

Read-only before/after validation: wallet total **1,249,704 GPC**, ledger **426 entries**, **14 rooms**, **42 rounds**, and the existing live table bank **26,173 GPC** were unchanged. The new worker has successful production executions.

## Game state fix

One authenticated room snapshot provides room, seats, entries, bank, prize, round, player rolls, pause votes and the viewer's own balance. Posting entry immediately enables the banker's start control through server-confirmed state. Start and begin now share one database operation. Entries lock for an active round; completion resets all entries atomically. Original banker/winner identity is preserved in settlement history even when bank bust transfers the role.

Create, join, fund, entry, start, roll, setup, lower-bank, votes, pause/resume, leave, close and takeover use verified identity and database checks. Logical retries reuse request IDs, including lost-response retries. Closing preserves history and returns escrow; active-round leave/close/pause is rejected. Existing odds, minimums, fees and rule evaluator remain intact.

## Realtime fix

One subscription invalidates the authenticated canonical snapshot. A polling fallback and reconnect/visibility refresh rehydrate state without manual reload. Full snapshots replace stale synthetic clocks. Removed a second dice subscription and competing result reads. Refresh does not replay an old throw or modify accounting. A minimal shared wallet-hook error catch prevents refused sockets from crashing the game; it changes no wallet calculation.

## C-Lo rule test results

112 automated tests passed across 14 files. The existing TypeScript evaluator was checked across all 216 dice combinations and permutations: 27 instant wins, 21 instant losses, 60 points and 108 no-count outcomes. Coverage includes 4-5-6, 1-2-3, triples, Head Crack, Dick, point comparison and reroll behavior. SQL fixture tests exercised actual settlement functions using deterministic outcomes.

## Accounting/payout test results

102 actual SQL lifecycle/accounting checks passed in an isolated PostgreSQL fixture, with fictitious wallets only. Covered minimum/insufficient balance, unauthorized banker actions, repeated entry/funding/start/roll, sequence/claim validation, settlement replay, injected ledger failure rollback, bank win/loss, player win/loss/push, ledger/fee conservation, bank bust, setup, lower-bank refund, leave/close refund, side-bet debit/accept/refund/payout, pause expiry, overdue-player forfeit and accepted-roll crash recovery. Protected writes/RPCs reject inappropriate roles.

Banker winnings stay in table escrow and return through existing cashout/close, preventing the former double credit. No historical balances were recalculated or repaired.

## Two-player test results

Two independent authenticated browser contexts used real Next endpoints and the actual migration functions against a local fixture. No game-action requests were intercepted. Banker and player saw confirmed entries, the same round and server dice, correct next-round controls, and successful reload. Concurrent/repeated controls and anonymous header impersonation were rejected appropriately.

Chromium passed 32 checks; Safari/WebKit passed 29 checks (random authoritative rolls vary the loop count). No browser errors or early result-name reveals were recorded. External requests were blocked. Local service workers were disabled because the isolated HTTPS certificate is self-signed; this is a QA harness limitation, not an application change.

## Mobile test results

Passed 390×844, 430×932 and tablet 768×1024. No horizontal overflow; visible essential betting controls and mobile banker start button fit within the viewport. Chat is collapsed behind a drawer and opens/closes correctly. Compact bank/prize/roster/status preserve space for the enlarged felt table and bottom navigation. Funding/setup uses a scrollable overlay.

## Desktop test results

Passed 1440×900 and 1920×1080. Large table uses the main area, with chat on the right at desktop sizes. Dice are existing true Three.js rounded 3D meshes, now charcoal with gold pips and ground shadows. No fake idle or random client result faces. Result labels and settlement overlays wait until the visual throw settles. Screenshots are saved with the recovery evidence.

## Build result

Frontend TypeScript and production build passed. The initial sandboxed build could not download existing Google Fonts; the network-enabled build passed. Existing lint warnings remain; no build errors. No real charges, paid API generation or production test wagers were performed.

## Deployment result

**Ready; garmonpay.com alias confirmed.** Deployment ID: `dpl_2nHefJ1AcZdHSZUD9c3sCigmLrPY`. Release: https://garmon-own46944z-garmonpays-projects.vercel.app

## Production URL

https://garmonpay.com

## Production smoke test

Migration/grant/balance/worker checks passed. All nine new privileged functions deny execution to ordinary users and permit the service role. **15 live production checks passed:** homepage, login and C-Lo page load; nine financial/action endpoints reject anonymous callers with spoofed user/admin headers; room-state and both cron endpoints reject unauthenticated requests. These calls made no financial changes. **Create → fund → second-player join → entry → start → roll → settlement → next round on real production accounts is pending designated accounts and an authorized GPC test budget.** Existing customers are not used as test subjects, and service credentials are not used to impersonate them.

## Remaining issues and compatibility risks

- Required real production two-player financial smoke test remains outstanding. Provide designated banker/player accounts and maximum GPC test budget.
- Old open browser clients need a refresh because actions now require logical request IDs and financial writes must use authenticated endpoints.
- Side bets can only be created/accepted before the active round's first accepted roll, preventing outcome-informed wagering; existing bet amounts, odds metadata and payout formulas are preserved.
- Optional 4-5-6 banker takeover is offered between completed rounds, with a fresh 30-second window; it cannot change ownership mid-settlement. Automatic bank-bust ownership still follows the existing rule.
- Visual physics tests and screenshots verify local browser behavior, but real iPhone hardware/performance has not been tested.
- No historical financial anomaly is retroactively adjusted.

## Production requirements

Existing Supabase URL/anonymous key/service-role key and authenticated sessions must be configured. Keep `CRON_SECRET` configured for protected web cron routes. The database recovery job is active and does not depend on browser sessions. No new paid service credentials or hosting upgrade is required.

## Rollback plan

Private recovery archive and test evidence: `/Users/bishop/.codex/visualizations/2026/10/03/01a1028b-bcb6-7920-860f-989392c27925/celo-lifecycle-recovery/`. The source archive has restricted permissions and contains the original environment files; never publish it.

For an incident, first stop new C-Lo actions through a controlled maintenance release. Unschedule only `garmonpay-celo-lifecycle-recovery` if recovery is the cause. Do not drop the entire cron extension, since that would remove other jobs. Preserve additive columns, financial receipts, ledger and historical snapshots. Previous frontend deployment is `dpl_7y9MNmUv47Q4ehZbgTo9bQyqg1sp`; its old financial handlers should not be restored blindly alongside new accounting. A compatible rollback must keep the transactional backend/restrictions or temporarily disable affected C-Lo writes. Never restore wallet balances from the source/schema backup or undo settled customer ledger entries.
