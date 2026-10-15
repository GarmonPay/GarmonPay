# Hybrid security assessment — October 11, 2026

## Scope and evidence

This bounded source review inspected the master implementation request, phase report, existing schema-only catalog snapshots, financial libraries, middleware pause, webhook branches and standalone arena settlement source. No production database query, data change, migration application or worker deployment was performed by this review. Historical reports describe completed checks; they do not independently prove current production state. The main implementation task must recheck deployment and production smoke evidence.

The prior two production protection migrations remain in the repository. The unused-DDL proposal remains outside the migration queue and unapplied. This review makes no wallet, reward, payment, launch, trading or paid-game activation claim.

## Newly contained pause escape

**High before financial reactivation; bounded financial-state mutation while paused.** `GET /api/games/budget` calls `getRewardBudget`, which updates `reward_budget.daily_used` on day rollover. `GET /api/admin/gamification` calls `getAndMaybeResetGlobalBudget`, which resets daily/weekly financial budgets. `GET /api/admin/gamification-config` can seed reward configuration. The prior pause allowed these GET requests because they were outside named blocked families. Authentication limits who can call them but does not make them read-only.

A focused source fix now pauses all methods at those three exact paths, with normalization still applied first. Catalog and account-history GETs remain available. Regression checks cover middleware 503 behavior, GET/HEAD/OPTIONS, trailing slashes and encoded spelling. Financial pause suite: **33 tests passed**. This source change is not independently deployed by this reviewer.

Before restoring these views, introduce separate read-only budget snapshots and authorized transactional rollover commands. GET must never reset liability or pricing state. Do not reset real production counters to test this behavior.

Other GET write sites were identified: referral dashboard generates a missing referral code; arena store seeds priced catalog defaults when empty; arena 3D status updates rendering records. These are not direct balance settlements, but should become explicit authenticated commands or controlled migrations. Do not seed commercial prices from ordinary browsing. The admin balance-monitor RPC is SELECT-only in the saved function definition. C-Lo and cron mutations are already gated in the current source.

## Financial-engine blockers

**High, contained by financial pause: budget and payout races.** `src/lib/reward-budget.ts` separates `canGrantFromGlobalBudget`, reward issuance and `consumeGlobalBudget`; consumption uses read/add/update and ignores several database errors. `src/lib/games-rewards-db.ts` similarly checks budget before a separate payout and updates counters later. Concurrent grants can exceed budget or lose increments, and crashes can produce unpaid logs or unlogged payouts. Replace with one database transaction that locks the budget row, validates the period, deduplicates a server-derived eligibility ID, consumes allocation and posts the journal together. Test concurrent requests, crash boundaries, exhausted budget and duplicate activities with synthetic accounts.

**High, contained: cross-ledger partial failures.** `src/app/api/wallet/convert-to-sc/route.ts` debits the USD ledger, separately credits coins, separately logs, and attempts a separately referenced refund on failure. References use `Date.now()`, so retries are new operations. A crash between writes can debit without credit; ambiguous coin results can lead to refund plus credit. Keep conversion disabled. Define an atomic conversion posting with a stable request ID and mutually exclusive final states. Preserve USD/GPC units and historical liabilities; do not reinterpret GPC as SOL.

**High, contained: campaign webhook duplicate credit.** The `ad_deposit` branch in `src/app/api/stripe/webhook/route.ts` reads campaign balances and adds a value before separately recording the payment. It has no branch-local receipt claim before the balance update; uniqueness on a later insert alone cannot undo a duplicate update. Concurrent events can also lose campaign increments. Metadata-derived `amount_dollars` is accepted ahead of the settled charge amount. A signature proves Stripe origin, not commercial consistency. Require a unique verified settlement receipt, server-created purchase quote with amount/currency/campaign ownership, and one atomic credit transaction. Test duplicate event IDs, multiple events for the same session, price mismatch and simultaneous top-ups. This endpoint remains paused.

**High, external deployment unknown: arena settlement.** `server/fight-server.js` still contains legacy read/add/update awards and multi-step tournament settlement, although source early returns currently prevent those functions from touching the database. A website deployment cannot establish a separate worker's effective pause. Identify its host, stop/verify settlement workers, rotate known-default-derived signing credentials if ever used, and inspect a running artifact before any gameplay payout approval. No remote worker was contacted in this review.

**Medium, reconciliation correctness: ambiguous balance ordering and silent errors.** `src/lib/usd-wallet-balance.ts` and wallet helpers select latest `balance_after` using only `created_at`; equal timestamps provide no deterministic journal ordering. Several balance reads return zero on database errors, hiding unavailable evidence as zero assets. Add a monotonically ordered posting sequence in staging and display unavailable status for failed reads. Do not rewrite production balances as a normal test or assume a display correction reconciles liabilities.

**Medium, privileged audit durability.** `walletLedgerEntry` appends `balance_audit_log` after the RPC commits and only logs audit-write failure. The wallet journal still exists, so this is not proof of missing accounting; it means the separate privileged audit can diverge. Put required audit attribution in the same posting transaction and propagate actor/request/approval identity. Admin adjustment and withdrawal workflows require MFA or equivalent step-up acceptance before activation.

## Existing controls that must remain

Saved production function bodies for wallet and GPay journals use balance-row `FOR UPDATE`; do not describe all ledger RPCs as non-atomic. Wallet reference uniqueness appears in repository migrations; current live constraints must still be verified separately. Nullable references and permissive signed event amounts mean trusted callers must enforce deposit/debit direction and stable mandatory references where required. Service-role-only execution narrows access but does not replace domain validation.

The new SOL foundation is unapplied and independent from legacy ledgers. Its synthetic tests are useful evidence, not proof of Auth/PostgREST integration, independent concurrent sessions, on-chain finality or live reserves. Preserve immutable journal protections and populated-history rollback refusal. No legacy-to-SOL migration may alter liabilities without a reconciliation and approval plan.

## Table-by-table privilege proposal

`hybrid-permission-matrix.json` enumerates each of the **134** proposed tables, browser roles, three privileges, saved prior ACL metadata, exact/static source references, and separate catalog/backend/auth/financial impact statements. The matrix is an approval aid. It deliberately marks every entry unapplied and requiring runtime validation. Static references cannot establish actual deployment dependencies, dynamic SQL clients, external workers or installer use.

The pending proposal revokes only TRUNCATE, REFERENCES and TRIGGER from PUBLIC, anon and authenticated. Ordinary read/insert/update/delete paths do not require those privileges. SELECT, service-role ACLs, policies, functions, defaults and rows are unchanged by that proposal. Nevertheless, this review does **not** certify a broad 134-table production change. Some browser-role SQL integrations may use DDL privileges outside REST. The saved ACL snapshot predates later protections and must not be used blindly to restore old grants.

Safe next step: select a small independently reviewed table group, re-read current ACLs and exact external dependencies, generate a focused migration and exact-current-state rollback, run its synthetic role/CRUD/trigger/catalog checks, then ask for explicit production approval naming the tables and privileges. No focused migration was added in this review, and the existing broad proposal was neither applied nor altered. An emergency rollback must not restore revoked financial writes or retired C-Lo access.

## Staging and acceptance

Continue zero-hosting-cost synthetic PGlite tests; add local Supabase Auth/PostgREST staging when Docker is available. Paid resources remain unauthorized. Before financial acceptance, require two independent concurrent database sessions, replay and partial-failure tests, wallet nonce/domain/session tests, service-role and browser permission checks, rollback rehearsal without production rows, finality/reorg reconciliation and external-worker smoke evidence. Legal/commercial/protocol approval is separate from technical validation.

Changed application files in this bounded increment: `src/lib/security/financial-pause.ts` and `src/lib/security/financial-pause.test.ts`. New artifacts: this assessment and `hybrid-permission-matrix.json`. No migrations, balances or production resources changed. Existing financial activation gates remain closed.

## Staging-only settlement evidence implementation

Added `src/lib/solana/settlement-evidence.ts` and its tests. Existing foundation journals require unique idempotency keys but have no chain-evidence decoder or intent matching; a trusted caller can otherwise journal a supplied signature without establishing the intended payment. The new pure validator accepts a server-issued deposit or withdrawal intent and normalized evidence from a future trusted RPC decoder. It requires exact bigint-backed lamports, source signer, destination, network genesis hash, signature, top-level native System Program transfer index, successful finalized status, minimum slot and bounded on-chain block time. It rejects duplicate instruction indexes, partial/missing evidence, failure, wrong network, under/overpayment and conflicting recorded receipts. Receipt reconciliation distinguishes exact repeats from conflicts.

This module is staging-only and is not imported by endpoints or payout workers. It does not fetch RPC data, cryptographically verify an RPC provider, choose custody, authorize withdrawals, simulate an actual network transaction, sign, reserve funds or post balances. TypeScript interfaces are not a trust boundary: the future RPC adapter must obtain and decode authentic complete transaction data on the server, never accept these evidence fields from a browser. A receipt key is a deduplication identifier, not durable deduplication by itself. Production integration must atomically claim both intent ID and receipt key with the journal and reserve transition; two concurrent calls cannot safely rely on a separate read-before-write. Inner transfers, SPL tokens and unrelated transfer aggregation are intentionally outside this bounded native-SOL validator.

No full local Supabase/RPC stack or signing provider is available for integrated settlement; therefore this increment uses the provider-neutral pure validator and existing synthetic foundation harness instead of inventing settlement economic rules or applying a schema change. No migration or rollback artifact was needed for a pure module with no persistent side effects. Database foundation rollback was separately rerun to confirm empty rollback succeeds and populated journals remain protected. These checks do not replace live Auth/PostgREST, two-session concurrency, reserve or on-chain reconciliation acceptance.

Official evidence model references: [Solana getTransaction](https://solana.com/docs/rpc/http/gettransaction) and [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses). Missing transactions and null block times require deferred/manual reconciliation rather than credit. No funds move during validation.

## Advertising rates and residual economics

Source evidence is inconsistent with treating the new commercial targets as already approved production prices. `src/lib/garmon-ad-rates.ts` contains legacy nominal rates: 15 seconds $0.005 viewer / $0.01 advertiser per activity; 30 seconds $0.01 / $0.02; **60 seconds $0.015 / $0.03**; clicks $0.05 / $0.10. Nominal 60-second amounts therefore imply $15 viewer allocation and $30 advertiser spend per 1,000. This is an existing source configuration, not certification of latest live settings or approval to reprice.

Runtime payout calculation further depends on `src/lib/garmon-member-payout.ts`: low-cost campaigns use the DB-backed common view rate, and campaigns above the threshold use half advertiser cost for 30 seconds, half that for 15 seconds, and 1.5 times the 30-second payout for 60 seconds. `src/lib/rates.ts` loads `platform_settings` effective and target values, with defaults of one cent per view and five cents per click. These amounts cannot represent proposed sub-cent payouts faithfully as integer cents. A new crypto accounting schedule needs exact micro-USD quote units and lamports, explicit versioned commercial approval and reserve coverage. No pricing settings were read from production or changed in this review; no 60-second price is replaced.

For the user's preliminary prepaid targets, calculate residual allocation as purchase price minus all 1,000 viewer rewards minus referral commission on the qualifying purchase price:

- 5-second click: $3 price − $0.30 viewer allocation − $0.30 first-purchase referral = **$2.40** residual. Subsequent 5% commission is $0.15, leaving **$2.55**.
- 15-second view: $8 price − $1 viewer allocation − $0.80 first referral = **$6.20** residual. Subsequent commission is $0.40, leaving **$6.60**.
- 30-second view: $15 price − $2 viewer allocation − $1.50 first referral = **$11.50** residual. Subsequent commission is $0.75, leaving **$12.25**.

These are residual allocations before operations, chain/network and protocol costs, fraud losses, refunds/reversals, support, taxes, any creator distributions and reserve requirements; they are not net profit. Apply referrals only to verified eligible prepaid purchases, not signup/recruitment. Refund/reversal policy and a versioned quote must reduce or claw back the matching commission safely. Lower verified-view delivery or unspent budgets must not silently convert reserved liabilities into profit. Rates remain proposals until commercial approval and liability/reserve tests pass.

Staging increment verification: settlement evidence suite **24 tests passed**, financial pause suite **33 passed** (57 total); project TypeScript check passed. Existing synthetic SOL foundation role, reserve, replay and empty/populated rollback checks passed again. No live chain transaction or independent database concurrency test was performed.
