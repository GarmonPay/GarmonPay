# Phase 1 production migration plan — NOT APPLIED

Do not run this plan without a separate explicit approval. It was not applied to production `zfnwypoxggqpairmwnja` or reapplied to staging `bhxheuaoofiklsaurqlu`. Staging already has these objects. Do not run the repository's full database push. Do not enable production wallet authentication or any financial operation as part of applying the schema.

## Before an approved application

1. Read production catalog metadata again and confirm `gp_sol_identities`, `gp_sol_challenges`, `gp_sol_sessions`, `gp_sol_members`, and `gp_sol_member_follows` are still absent. Do not select member rows or call financial functions.
2. Capture a production backup and record the backup identity.
3. Review security advisors. Keep the application wallet flag and every financial flag disabled during provisioning.
4. Apply only these reviewed files, in order, outside the automatic migration queue:
   - `supabase/security/phase1-review/supabase/migrations/20261012221838_phase1_01_wallet_identity.sql`
   - `supabase/security/phase1-review/supabase/migrations/20261012221840_phase1_02_session_rotation.sql`
   - `supabase/security/phase1-review/supabase/migrations/20261012221843_phase1_03_members.sql`
   - `supabase/security/phase1-review/supabase/migrations/20261013001939_phase1_04_staging_security.sql` only after confirming the dashboard event function exists and returns `event_trigger`.
5. Verify table, RLS, and grant metadata. Do not create production test members. Wallet-app and device photo acceptance remain separate gates before authentication is turned on.

## Rollback — NOT APPLIED

Disable application member authentication before holding access. Then `supabase/security/phase1-review/hold-access.sql` revokes the reviewed table and function privileges without dropping objects or deleting rows. `restore-access.sql` restores only those grants and does not turn authentication back on. Never drop a populated member table or delete account data to reverse the release.

## Safe production release shape — not started

https://garmonpay.com/solana/members already shows the paused purple-and-gold Members page. Wallet challenges on that host still return 503. Keep that pause through the release.

When Solflare and physical-device acceptance have passed, a later explicit approval can apply only the reviewed migrations in this plan. Leave `walletAuthentication` and every financial flag false while the schema is applied. A separate later approval is required before wallet sign-in is enabled on garmonpay.com. Do not deploy the current working tree: it contains unrelated uncommitted game and financial edits. Do not copy staging member rows into production.

## Staging state to preserve

Staging already contains the member, referral, follow, and photo rows used for acceptance. Do not drop or truncate those tables. A later production copy must not reuse staging test accounts.
