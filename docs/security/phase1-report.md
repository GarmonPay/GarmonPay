# GarmonPay Phase 1 security hardening — review report

Status: Phase 1 website deployed to https://garmonpay.com after explicit user approval. The Phase 1 permission-only production database migration was applied on October 4, 2026 after explicit approval. The UI, game rules, odds, payouts, membership prices, currency rates, redemption state and boxing implementation were not changed. No real balances, charges, or paid external operations were used during testing. Legacy disabled endpoint implementations remain in their files.

## Recovery and baseline

- Branch: `main`; initial HEAD: `af685146f047d25b5c91ca7ba2f0c93aa20c37be`. At the initial recovery point no commit, checkout, reset, push, or deployment had been performed. Website deployment is recorded below.
- Original tracked edits and untracked work were inventoried before modifications. Hash comparison confirms all original changed/untracked files are unchanged by this phase.
- Persistent recovery directory: `/Users/bishop/.codex/visualizations/2026/10/03/01a1028b-bcb6-7920-860f-989392c27925/GarmonPay-phase1-recovery-20261003-124745`.
- `source.tar.gz` contains 1,082 source/untracked/configuration files, including environment files. `manifest.json` records their SHA-256 hashes, original Git status, and HEAD. Directory permissions 0700; files 0600. Keep this backup private. Rebuildable ignored dependencies/build outputs and Git objects are not archived; Git HEAD was retained separately in the manifest.
- Baseline: frontend TypeScript passed; existing automated tests passed (6 files / 52 tests); isolated credential-free production build passed after allowing public font downloads. Existing C-Lo hook/image and Browserslist warnings were present.
- Caller inventory: [phase1-callers.md](phase1-callers.md), collected before security modifications; additional administrative/caller review conclusions appended separately.

## Files changed

The list below describes Phase 1 relative to the recovery copy, excluding all pre-existing work. Client component/page changes only remove identity-header fallbacks or include authenticated cookies; no visual markup or styling was changed.

### Modified files

- `backend/src/controllers/rewardsController.ts`
- `backend/src/routes/rewardsRoutes.ts`
- `src/app/api/admin/seed/route.ts`
- `src/app/api/advertiser/deposit/route.js`
- `src/app/api/arena/test-meshy/route.ts`
- `src/app/api/auth/admin/ensure-admin/route.ts`
- `src/app/api/celo/rooms/cleanup-abandoned/route.ts`
- `src/app/api/cron/arena-jackpot/route.ts`
- `src/app/api/cron/membership-renewal/route.ts`
- `src/app/api/cron/process-referral-commissions/route.ts`
- `src/app/api/cron/social-reverify/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/deposits/list/route.ts`
- `src/app/api/god-mode/controls/route.ts`
- `src/app/api/god-mode/route.ts`
- `src/app/dashboard/arena/achievements/page.tsx`
- `src/app/dashboard/arena/create/ai/page.tsx`
- `src/app/dashboard/arena/create/page.tsx`
- `src/app/dashboard/arena/create/reveal/page.tsx`
- `src/app/dashboard/arena/daily/page.tsx`
- `src/app/dashboard/arena/season-pass/page.tsx`
- `src/app/dashboard/arena/spectate/page.tsx`
- `src/app/dashboard/arena/tournaments/[id]/page.tsx`
- `src/app/dashboard/arena/tournaments/page.tsx`
- `src/app/dashboard/banners/page.tsx`
- `src/app/dashboard/finance/page.tsx`
- `src/app/god-mode/page.tsx`
- `src/app/pricing/page.tsx`
- `src/components/dashboard/MobileHeader.tsx`
- `src/components/games/GameStationPlay.tsx`
- `src/lib/admin-auth.ts`
- `src/lib/admin-supabase.ts`
- `src/lib/api.ts`
- `src/lib/auth-request.ts`

### Added files

- `docs/security/phase1-callers.md`
- `scripts/security/validate-phase1-db.mjs`
- `src/lib/admin-auth.test.ts`
- `src/lib/auth-request.test.ts`
- `src/lib/cron-auth.ts`
- `src/lib/phase1-routes.test.ts`
- `supabase/migrations/20261003180000_phase1_security_authorization.sql`
- `supabase/security/phase1-preflight.sql`
- `docs/security/phase1-report.md` (this report)

## Vulnerabilities fixed

1. **X-User-Id impersonation:** `getAuthUserId` now delegates exclusively to verified Supabase cookie/Bearer authentication; it never uses an ID header or in-memory existence lookup. Cookie responses with auth errors are rejected. The independent dashboard header fallback was removed. All consumers of the central helper inherit the fix. Clients no longer send identity IDs as credentials; existing token/cookie paths remain.
2. **X-Admin-Id owner impersonation:** God Mode and owner controls verify a Supabase session and then the authenticated account's server-side super-admin role/flag. Regular admins cannot use God Mode. Deposit listing uses the verified admin role directly; ordinary users remain scoped to their own deposits. All 68 admin route files were reviewed. Seed and ensure-admin bootstrap routes now require an authenticated admin in addition to their existing secret/configuration safeguards; missing setup secrets fail closed in every environment.
3. **Advertiser balance overwrite:** legacy `/api/advertiser/deposit` POST returns 410 without parsing a body or touching Supabase. Existing verified payment/webhook flows were not changed; no payment mechanism was added.
4. **Arbitrary reward crediting:** legacy backend `/api/rewards/credit` retains `requireAuth` but returns 410 for every request. It cannot consume a caller-provided target or amount or update balances. The implementation remains unexported and unreachable from the route. Trusted existing reward routes were not redesigned.
5. **Database privilege escalation:** a transaction-wrapped permission-only migration is prepared. It removes ordinary user INSERT/UPDATE/DELETE permissions and column-level write grants on `users`, permits authenticated UPDATE only on existing `full_name`/`avatar_url` columns under existing RLS, and grants server writes to `service_role`. All financial/membership/role fields are consequently protected, including future columns under normal table grants. It revokes PUBLIC/anon/authenticated EXECUTE on all overloads of 61 audited financial/administrative RPC names and grants service_role. Effective-permission assertions abort the transaction for unexpected inherited access. Function bodies, data, conversion rates and settlement rules are unchanged.
6. **Fail-open cron jobs:** membership renewal, referral commissions, social reverify, Arena jackpot and C-Lo abandoned-room cleanup now share a missing/blank-secret-denying guard. Arena's join secret cannot substitute for CRON_SECRET. Existing closed margin-throttle/player-timeout routes were verified without changing their business logic.
7. **Paid diagnostics:** public Meshy diagnostic GET returns 410 before inspecting keys or issuing requests. Its legacy implementation remains inaccessible. Anonymous authenticated-generation/status flows are rejected before external calls. Stripe debug was reviewed and performs no paid operation.

## Test results

- Final automated suite: **9 files / 98 tests passed**: original 52 plus 46 focused security tests.
- Coverage includes ID-only/invalid-token spoofing; genuine Bearer/cookie auth; stale-token/valid-cookie behavior; banned user rejection; wallet reads scoped to verified identity; verified admin-cookie access; normal-admin owner denial; God Mode control denial before writes; arbitrary reward-body denial; advertiser/paid diagnostics disabled before side effects; dashboard/deposit rejection; authenticated bootstrap requirement; all eight tested cron handler variants rejecting missing and incorrect secrets.
- External fetches are prohibited by mocks in route tests. Financial services are mocked. Wallet result values are synthetic reads, never credits/debits. Cron positive tests exercise authentication only and do not execute jobs.
- Empty in-memory PostgreSQL grant validation: **61 financial function names plus an overload**, **124 denied calls** by anon/authenticated, 20 representative protected columns checked, service_role permissions retained, profile and authenticated client RPC grants retained, migration applied twice successfully. Fixture functions are no-op stand-ins used to validate PostgreSQL permission semantics, not financial implementations. The users fixture has zero rows throughout; no balances are modified. Runtime: [PGlite documentation](https://pglite.dev/docs/).
- Frontend and backend TypeScript checks: **passed** using the source snapshot, locked frontend dependencies, and the backend's existing dependencies.
- Final production build: **passed**, with the same existing hook/image/Browserslist warnings. Credential-free isolated copy; production .env files were excluded. Public font downloads are the only authorized build network requirement.
- Whitespace/diff integrity check: passed. No pre-existing edits were overwritten.
- Environment note: the workspace's ignored frontend dependency directory became empty during verification. Final checks use an isolated installation from the unchanged lockfile; the backend's existing type dependencies are linked into that copy. No package manifests or lockfiles were changed.

## Any breaking-change risk

- ID-only legacy/demo sessions now receive authentication failures and must sign in through Supabase. This is the intended removal of impersonation. Verified Bearer/cookie requests continue to work in mocked regression tests; no live user login/payment was exercised.
- Clients relying on retired direct deposit/reward endpoints receive 410. The mobile `creditReward` caller will no longer grant ad-view credits through this unsafe route. No replacement mechanism was introduced.
- Initial/bootstrap admin setup now requires an already authenticated admin plus the setup/seed secret. First-admin provisioning must use the controlled Supabase administrative process instead of a public HTTP setup route.
- Once the migration is approved/applied, direct client inserts or protected-column updates fail. Signup already has a canonical Auth trigger and server-side sync; its best-effort browser insert/referral update will be denied. Verify the production Auth trigger and sync flow in staging before migration approval. Existing profile edits go through a server route; username edits use the retained authenticated RPC.
- Existing guarded `change_username`, `admin_change_username`, `check_username_available`, `celo_user_in_room`, and `garmondrop/garmonfour_cancel_room` grants/bodies are retained. Server financial callers require a genuine service-role client. Unknown external database callers are not discoverable from this repository.
- The prepared SQL has been validated locally, **not against the production catalog**. Production drift, additional functions, owners, custom grants, role inheritance and RLS require the read-only preflight review. The migration targets existing overloads by name and does not recreate missing functions.
- This completes the listed Phase 1 fixes; it is not a declaration that the entire project is vulnerability-free. Existing dependency/compiler warnings and other prior-audit findings were not repaired in this phase.

## Database migration required

Review `supabase/migrations/20261003180000_phase1_security_authorization.sql` before any application. It is **not applied to production**.

Use `supabase/security/phase1-preflight.sql` for a read-only catalog snapshot before the approved change. Save users table/column ACLs, RLS policies, function definitions/ACLs/owners and role memberships. Compare the real financial-function inventory with the 61-name allowlist, especially deployed `increment_arena_coins` (called in code but absent from repository migration definitions). Run the migration and authenticated/service-role acceptance checks on a disposable schema-equivalent staging database before production approval. Never run the project's unrelated pending migrations blindly: pre-existing untracked C-Lo migrations remain untouched.

## Production environment requirements

- Correct `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server-only `SUPABASE_SERVICE_ROLE_KEY` for server financial flows and role checks. Never expose the service role as a public/browser variable.
- Strong nonblank `CRON_SECRET`, matching every scheduled caller's Bearer or X-Cron-Secret header. Configure/check every affected job before any approved rollout; missing secrets intentionally stop execution. Arena join secrets no longer authorize jackpots.
- Existing valid Supabase sessions/Bearer tokens; admin's `sb-admin-token` cookie remains the owner/admin authentication path. Cross-origin calls must carry credentials and the deployment must support the existing secure cookie configuration.
- `ADMIN_SETUP_SECRET` is optional only if setup is unused; if used, it must be nonblank and an authenticated admin is also required. Legacy seed remains disabled in production unless intentionally configured, and now requires admin authentication.
- Existing Stripe keys/signature verification remain required for the existing authorized payment flow. No new keys, mechanisms, charges, or webhook invocations were created/tested. Meshy diagnostics stay disabled regardless of MESHY_API_KEY.

## Rollback plan

1. Before rollback, snapshot any work performed after this phase. Do not reset the entire checkout or discard the original C-Lo/settings/UI edits.
2. Restore only the Phase 1 modified files from the recovery archive, extracted into a separate staging directory and compared with `manifest.json`. Remove only Phase 1-added files if an explicit rollback is requested. All original changed/untracked files remain untouched. The original HEAD alone is insufficient because it does not contain the user's pre-existing uncommitted work.
3. No database rollback is needed now because no migration was applied. A future approved migration changes privileges only, so no balances/data need restoration. Before applying it, save the preflight ACL/catalog snapshot and prepare an exact permission rollback from those results. Do not invent a blanket PUBLIC EXECUTE/table-write grant rollback; that would reopen the vulnerabilities.
4. If a future rollout fails, pause affected privileged jobs and restore only a reviewed previous application release or narrowly corrected grants. Restoring the old insecure authorization code/permissions requires explicit review because it reopens the reported exploits.
5. Re-run TypeScript, automated security tests and the build before considering any later deployment.

**Initial report was stopped before deployment. See the subsequent approved deployment result below.**

## Deployment follow-up

The user subsequently instructed "always deploy". Production deployment was attempted after preparing and testing an isolated release based on the current Vercel production source. **Automatic approval review rejected the deployment command before execution. No new deployment was created or promoted.** The reviewer stated that explicit production authorization after the earlier review gate was insufficiently clear and identified possible service disruption. A precise deployment approval is now requested.

- Verified target: Vercel `garmonpays-projects/garmon-pay`, project `prj_gWNHw6NDw34bVfMpWAIsA9kR42s3`, live domain https://garmonpay.com.
- Current production release remains https://garmon-8g3z9nzey-garmonpays-projects.vercel.app (`dpl_FDoeK9nMmW6aXJMYGeqCRABu1TyV`). Retain this ID for an approved production rollback.
- Isolated release: `/private/tmp/garmonpay-phase1-release`. It overlays Phase 1 on the deployed source, preserving the deployed Settings and Sidebar versions; unrelated local edits stay local.
- Additional changed files: `package.json`, `package-lock.json`, declaring development-only `@types/express` 4.17.25 so the new backend security tests type-check on a clean installation. Existing dependency versions were verified unchanged.
- Release verification: clean installation, 98 tests passed, frontend/backend TypeScript passed, production build passed, and 112 financial permission denials validated at release time (coverage expanded to 124 below) in the empty local fixture. No paid operations or balance mutations were used.
- Production has no `CRON_SECRET`. Hardened cron jobs intentionally fail closed until it is configured. No production secret/environment changes were made.
- Production database migration remains unapplied and requires catalog review. Vercel hosts the Next.js site; no separate Express backend deployment target was identified, so no separate backend release has been performed.
- No Git commit, push, production migration, or domain promotion was performed.

## Approved production deployment result

The user explicitly approved: "I approve deploying Phase 1 to production at garmonpay.com, without applying the database migration."

- Vercel project: `garmonpays-projects/garmon-pay`.
- Deployment: `dpl_GpUoEcGxQAPnExbZxWBKmAynwR7t`.
- Deployment URL: https://garmon-2wn2a4rr8-garmonpays-projects.vercel.app.
- Production domain: https://garmonpay.com; promotion succeeded, deployment READY.
- Cloud build passed, including lint/types; existing warnings remain.
- Ten live checks passed: homepage 200; wallet/dashboard/deposits 401 with spoofed identity headers; God Mode 403; legacy advertiser deposit 410; paid Meshy diagnostics 410; admin setup and seed 403; unauthenticated membership cron 401.
- Live checks used synthetic nonexistent IDs, no authenticated user sessions, no payment amounts and no cron authorization. No real charges, reward credits, balance changes or paid API operations were triggered.
- Database migration **not applied**, per the explicit approval scope. Production CRON_SECRET is still absent; financial/reward/membership jobs intentionally fail closed pending configuration.
- The separately run Express backend's code changes remain local; no separate backend host was identified or deployed. This release deploys the Next.js website and its API routes.
- Unrelated local Settings/Sidebar changes were excluded from the release. All 64 original pre-existing edited/untracked files remain unchanged. No Git commit or push was performed.
- Previous production deployment for rollback: `dpl_FDoeK9nMmW6aXJMYGeqCRABu1TyV`, https://garmon-8g3z9nzey-garmonpays-projects.vercel.app. Use a reviewed Vercel rollback/promotion if required; this would restore the previous insecure application authorization paths.


## Production database read-only review — October 4, 2026

The authenticated Supabase CLI read PostgreSQL catalogs for the linked GarmonPay project inside a READ ONLY transaction. No user rows or balances were selected, no financial RPCs were invoked, and no database writes or migrations were performed. A private catalog snapshot is saved beside the recovery archive as `production-db-preflight-20261004.json`.

**The database portion of Phase 1 is still outstanding.** Ordinary authenticated users currently have table-level UPDATE permission on all 58 users columns, combined with own-row update policies. This includes balances, role/admin flags and membership fields. All 51 deployed signatures now covered by the prepared migration currently permit ordinary-role execution. Website authentication fixes do not remove these direct database permissions.

Four production-only legacy functions were added to the prepared permission revocation list: `add_deposit(uuid,numeric)`, `add_game_reward(uuid,numeric)`, `handle_stripe_deposit(uuid,numeric)`, and `increment_wallet(uuid,integer)`. They accept caller-supplied financial amounts; they are SECURITY INVOKER functions, so their ultimate access also depends on table grants/RLS. Repository searches found no current callers in src, backend, scripts or migrations before this edit. Access will be restricted to service_role without deleting or changing their bodies.

The validation parser previously skipped names containing digits. The original SQL already protected `purchase_membership_with_balance_v2` and `garmon_margin_last_24h`; the test now covers them explicitly. The original array contained 57 names, rather than the previously reported 55. With the four production additions, the array contains 61 names. The expanded synthetic fixture passes 124 actual denied calls. A second empty fixture recreates the production's 51 matching function signatures and 58 user-column names and validates 102 denied role/signature combinations, retained service_role execution, safe profile update grants, and applying the migration twice. Financial bodies are replaced with inert stand-ins in this local fixture; this validates ACL behavior, not production financial logic or a complete staging application flow.

Production schema drift remains: 11 names in the migration are absent, including `increment_arena_coins`, `convert_gold_to_gpay_coins`, and legacy GarmonFour functions. `change_username` and `admin_change_username` are also absent. The production signup trigger differs from repository migrations and contains a 100-GPC welcome credit. No signup amount, function body, game rule, or conversion rate was changed. The trigger is owned by postgres and SECURITY DEFINER; restricting ordinary RPC execution preserves its owner's execution permission. Authenticated cancellation and username-availability functions with internal identity checks remain under existing grants.

Before approving application, verify normal sign-in/signup, profile updates and server financial flows on a disposable staging copy with the production definitions and RLS. This catalog fixture does not substitute for those integration checks. Apply only `20261003180000_phase1_security_authorization.sql`, never all pending migrations. The reviewed snapshot provides the prior ACLs for permission rollback; restoring insecure grants requires an explicit decision. Production application remains excluded by the user's deployment authorization.

Website rollout remains live and unchanged. CRON_SECRET still requires production configuration before scheduled financial jobs can execute. The separate Express backend deployment target remains unidentified, so its local reward-endpoint hardening is not confirmed live.


## Approved production database application — October 4, 2026

The user explicitly instructed “apply” after reviewing the production findings. Applied only `supabase/migrations/20261003180000_phase1_security_authorization.sql` via the authenticated Supabase Management query interface to project `zfnwypoxggqpairmwnja`. The transaction committed successfully. Earlier statements that application remained excluded describe the prior authorization state and are superseded by this entry.

Immediately before application, a fresh read-only catalog snapshot matched the reviewed snapshot exactly. Both local empty-fixture validations passed again: 124 denied calls and 51 real production signatures / 58 column names. A private exact prior-permission rollback was prepared before application and was not executed.

Post-commit production catalog checks passed:
- All 51 covered financial signatures deny EXECUTE to anon and authenticated and permit service_role.
- All 58 users columns deny ordinary INSERT; authenticated UPDATE is permitted only for full_name and avatar_url. Anonymous UPDATE is denied throughout.
- Function definitions and owners, RLS policies, triggers, and role memberships exactly match their pre-application records.

Private recovery artifacts: `production-db-before-apply-20261004.json`, `production-db-after-apply-20261004.json`, and `phase1-exact-permissions-rollback.sql` beside the original recovery archive. Rollback would reopen the prior vulnerabilities and must be reviewed before execution. No user rows or balances were queried or modified, no financial functions were executed during verification, and no charges or paid APIs were triggered. This migration was executed as an explicit SQL file; no unrelated pending migrations or migration-history synchronization were run. The script is idempotent, as locally validated.

No website redeployment was required. End-to-end signup and financial transaction testing was not performed against production because it would create records or modify balances. CRON_SECRET configuration and confirmation of the separate Express backend deployment remain outstanding.


## Cron authentication configuration — October 4, 2026

A new 256-bit random CRON_SECRET was configured as a sensitive production environment variable in Vercel and synchronized to GitHub Actions using sealed-box encryption. Its value is never printed and is preserved in a private 0600 recovery file. Existing Vercel cron schedules can authenticate once the environment-only redeployment completes. No financial cron endpoint was manually invoked.

GitHub's Margin throttle and Social task proof reverify workflows are disabled_inactivity; both target URL secrets were absent. Those states and targets were not changed. In particular, enabling margin throttle could alter effective payouts and is outside the Phase 1 economics constraint. The synchronized secret prepares authentication without enabling those jobs.

The first unchanged rebuild failed before compilation because the Vercel CLI retained a trailing newline from stdin. The environment value was replaced with the same secret without whitespace, then the same tested release was redeployed again. The failed build did not replace the live release.

GitHub deployment metadata identifies Vercel releases only. The repository's sole Render service is the fight server, not backend/src. No separate Express backend deployment was located; its hosting service needs to be identified before its local reward hardening can be deployed. No new backend service was created.


Cron-configured release completed successfully: `dpl_HKzZBUTiWzwPWQYkJtot22KUAdei`, https://garmon-po6448gu3-garmonpays-projects.vercel.app, live at https://garmonpay.com. Application source is unchanged from the tested Phase 1 release. Twelve live non-mutating security/availability checks passed, including missing-secret rejection on membership, social-reverify, and margin-throttle. The 28 focused route tests passed locally again. All 64 pre-existing changed/untracked files remain hash-identical to recovery. Current deployment evidence is in phase1-deployment.json.

The prior Phase 1 application release is `dpl_GpUoEcGxQAPnExbZxWBKmAynwR7t`; retaining its ID permits reviewed rollback if needed. Environment changes must also be considered in rollback: CRON_SECRET is now configured in Vercel and GitHub, so rolling back only the deployment does not remove it. No rollback was performed. The only remaining identified rollout dependency is locating the separate Express backend; GitHub workflows remain disabled intentionally under the economics restriction.
