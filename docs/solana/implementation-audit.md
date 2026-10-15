# GarmonPay SOL transition — implementation audit

Audit date: October 11, 2026. This is an incremental foundation release; the full master build is not complete.

## Repository and recovery

Inspected `/Users/bishop/Desktop/GarmonPay`, GitHub remote `GarmonPay/GarmonPay`, Next.js App Router, Supabase, Stripe, separate Express backend, game servers, API authorization, cron configuration, migrations, and previous hardening records. More than 100 files had pre-existing changes. Preserved a source snapshot and hash manifest in `/private/tmp/garmonpay-solana-baseline` before editing; environment files were excluded. Do not reset this checkout.

Verified active Vercel project `garmon-pay`, project ID `prj_gWNHw6NDw34bVfMpWAIsA9kR42s3`. At audit start, production was deployment `dpl_2nHefJ1AcZdHSZUD9c3sCigmLrPY`, created October 5, 2026, with the `garmonpay.com` alias. Reconstructed its 1,172-file source in `/private/tmp/garmonpay-solana-release`; only this task's changes are eligible for release. Local unrelated changes are excluded.

## Existing capability and reuse

- Purple/gold design tokens, wordmark, responsive shell and game artwork are reusable.
- Authenticated legacy Supabase cookie/Bearer APIs and server-verified admin roles are present. Wallet-only login is absent from the original application.
- Connect Four, boxing assets, pinball engines, teams and tournament code remain available for evaluation. Financial gameplay requires a separate legal/operational decision.
- Existing campaign/video handling and review UX can be reused, but its reward/accounting implementation uses GPC and USD and cannot be relabeled SOL.
- Existing SQL migrations, immutable history patterns and server-only database clients provide useful foundations. No production data has been converted.

## Historical security status

The previous security report has superseded entries: its final October 4 entry records the permission-only migration as applied, and the deployment record reports CRON_SECRET configured. Earlier 'not applied' and missing-secret statements describe older states. The current production deployment is newer than that record. A schema-only REST check confirms the production users table exists (HTTP 200); the new SOL identity table is absent (HTTP 404). No user rows were retrieved. The Vercel production variable inventory confirms CRON_SECRET is present. Current PostgreSQL ACLs and database scheduler state still require fresh catalog/operational verification; prior records are evidence, not a present-day guarantee.

Legacy spoofable identity-header access and arbitrary reward/deposit endpoints were hardened in previous work and are covered by regression tests. The separate Express backend deployment target remains unverified. New SOL wallet identities never inherit a legacy user's balances or administrator role.

## Findings and remediation

- Next.js 14.2.18 is obsolete and vulnerable. Updated to supported 15.5.27 with its async request/page compatibility changes; image processing and test tooling also need security updates. Dependency scans are recorded separately. Raydium SDK dependency findings must be resolved before connecting its adapter to production runtime.
- C-Lo was publicly playable, advertised in the game catalog, and had Vercel cron entries. Removed catalog/navigation exposure, denied public gameplay and matchmaking paths with HTTP 410, and removed its Vercel schedules. Historical code, tables, accounting and privileged admin audit routes are retained. Database-native schedules and open-game liability cleanup require separate verified administration; never blindly apply the C-Lo recovery migrations.
- Legacy banned-account checks could fail open when the service client or policy query was unavailable. The final follow-up denies access on lookup errors or missing/unverified profiles; valid unbanned profiles retain access. Focused regression tests cover the failure paths.
- No Solana authentication or campaign custody engine existed. Added domain-bound challenge signing, a browser-bound nonce, atomic one-attempt consumption, hashed revocable one-hour sessions, durable per-wallet/per-IP challenge limits, banned-wallet checks and same-origin mutation checks. Authentication remains disabled until the additive migration and trusted-edge rate-key configuration are verified.
- Session cookies are httpOnly and SameSite=Strict; credentials are never logged. Phantom/Solflare injected providers support extensions and wallet browsers. External Android MWA/iOS universal-link flows are not implemented or claimed verified.
- The new token review validates bounded plain-text metadata and public HTTPS links, without fetching arbitrary URLs. It does not persist drafts, accept uploads or create tokens. Upload scanning, moderation and persistent metadata hosting are outstanding.
- No verified token indexer or fraud dataset exists. Spotlight shows honest empty/loading/error states, never invented rankings, prices or earnings. Sponsor placement is distinct from organic ranking.
- New SOL accounting uses BigInt lamports, complete-allocation validation, conservative price rounding, and fee-cap calculations. The migration creates isolated campaign, earnings-liability, withdrawal, referral and immutable paired debit/credit journal records. These are a schema/calculation foundation, not a live settlement engine. Reserve reconciliation, withdrawal reservation, signing custody and crash-safe payout workers remain outstanding.

## Required redesign/removal

Retire new Stripe purchases, membership subscriptions and GPC reward accrual through an orderly separately tested transition. Preserve webhook reconciliation, outstanding liabilities, historical records and existing users' redemption access until an approved migration/settlement plan exists. This release does not claim the entire legacy product is SOL-only. Public navigation introduces the SOL product; legacy accounts remain accessible.

Rebuild campaign funding against verified on-chain receipts, atomic reserve reservation and approved allocations. Rebuild rewards with server-authoritative engagement, duplicate protection and factual quiz verification. Replace recruitment/subscription commissions with approved service-revenue referrals. Do not build Buy & Earn.

## Database and infrastructure requirements

New additive migration: `supabase/migrations/20261011010000_sol_foundation.sql`. It changes no legacy balance or row. All new tables have RLS enabled and deny ordinary browser roles; privileged mutation is server-only. Synthetic PostgreSQL verification covers grants, one-time consumption, browser binding, rate limits, bans, immutable journals, idempotency constraints, reserve coverage and self-referral rejection.

Before production application, obtain a catalog/backup, test on a disposable production-equivalent Supabase project, review default/custom role grants, and save exact rollback information. Do not run `supabase db push` across the unrelated pending migrations. Rolling back after live records exist must preserve journal and liability data; do not drop tables containing financial history.

Requirements: trusted Solana RPC/indexer; GarmonPay-owned Raydium platform config; verified SOL global curve config and CPMM configuration; metadata storage/scanning; rate-limit secret and trusted edge IP; custody/provider selection; SOL price oracle and freshness policy; segregated reserves; reconciliation workers; fraud/moderation operations; admin MFA and financial dual controls.

## Protocol and economic blockers

See `raydium-verification.md`. External mint keypairs are supported, but no vanity private key has been generated or stored. The exact gpay suffix remains a target. Platform registration and on-chain initialized-mint provenance must be verified before launches.

The target 1% total fee, 0.60% platform and 0.40% creator must not be silently replaced with a 1.25% or other actual fee. Protocol charges and post-graduation mechanisms require explicit verified configuration. No permanent external-DEX split is promised.

## Legal and business decisions blocking activation

Custody and redeemable balances require counsel/provider review of federal and Florida money transmission, AML/KYC, sanctions and consumer protection. FinCEN's CVC guidance describes fact-specific acceptance/transmission obligations; Florida OFR licenses money transmitters. These sources do not determine GarmonPay's legal status. Sponsored compensated reviews require truthful disclosure and rewards independent of positive sentiment. Live Learn & Earn token distributions and paid gaming/tournaments require separate legal review.

Sources: https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models ; https://flofr.gov/divisions-offices/division-of-consumer-finance/money-transmitters

Advertising allocation percentages and proposed referral rates require approval. Withdrawal terms remain proposals. Required authorizations cover live custody, treasury signing, token launches/trading and payouts; this request explicitly excludes automatic activation of those operations.

## Implementation sequence

1. Deploy the independently safe interface, retirement gate and dependency fixes after verification.
2. Verify/apply the isolated authentication schema in staging; enable wallet-only sessions after acceptance tests.
3. Resolve Raydium configuration, dependency findings, full fee quotes and mint-provenance verification; then implement transaction preparation and devnet testing.
4. Add funded campaign settlement, authoritative Watch/Learn verification and indexer-based Spotlight fraud controls.
5. Implement reconciliation and custody/provider workflows after legal review and approved allocations.
6. Activate financial operations only after the required explicit authorizations. Retire legacy acquisition/earn flows with liability preservation and regression testing.

## Rollback

Restore the previous verified Vercel deployment using its deployment ID if the safe release fails. Preserve the new source and apply only scoped corrections. No production SQL is applied in this increment, so no database rollback is required. A future rollback must never restore spoofable auth or discard financial records. `supabase/security/sol-foundation-preflight.sql` provides read-only catalog checks; the empty-only rollback script refuses to drop any populated foundation table. Preserve the private source/hash snapshot outside temporary storage for long-term retention.

## Integration access

A Supabase integration is available but not installed/connected in this session. Staging schema application and fresh catalog verification need an authorized Supabase connection and a designated disposable staging project. No access tokens should be pasted into chat.
