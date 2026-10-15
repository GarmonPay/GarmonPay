# Phase 1 database review bundle — NOT APPLIED TO PRODUCTION

This isolated folder contains CLI-generated canonical migrations, copied byte-for-byte from the tested synthetic SQL scripts. It is outside the application's automatic migration queue. Do not run the main project's database push: unrelated pending migrations are not authorized.

Scope: create five new private tables (`gp_sol_identities`, `gp_sol_challenges`, `gp_sol_sessions`, `gp_sol_members`, `gp_sol_member_follows`) plus their indexes and server-only functions. All tables have RLS; browser roles have no raw-table or function access. Public profile reads go through the server's privacy-filtered RPC. No financial tables, legacy accounts, balances or existing grants are modified.

Production metadata was read safely on October 12, 2026: all five table names are currently absent. Production schema/privilege application still requires the user's separate explicit approval. Keep authentication and all financial flags disabled throughout provisioning; this bundle does not activate either.

Order: wallet identity, session rotation, member community. Before applying an approved bundle: recheck object-name conflicts and function signatures, capture a backup, review security advisors and apply only these three migrations. After application, verify table/RLS/grant metadata without creating production test members. Actual wallet and picture-selection acceptance is a separate staging step.

Rollback: disable application member authentication first and preserve all permanent account/profile rows. Revoke access to these new server-only objects to hold the release if needed; never drop a populated member table or delete account data as a rollback.

## Tested access rollback

`hold-access.sql` revokes access to exactly the five new tables and ten reviewed function signatures, without dropping objects or changing account/profile rows. `restore-access.sql` reapplies only the reviewed grants; it does not enable wallet authentication. Both are explicit operations outside the migration queue and require separate approval before any production execution. Disable application authentication before holding access; leave it disabled throughout recovery.

Native disposable PostgreSQL acceptance now starts with Supabase-style broad default table grants. It verifies the migration removes server-role member DELETE permission, concurrent identity/username/follow behavior, denied server reads and RPC while held, identical member/identity/follow rows after restore, and denied browser access after restore. Evidence: `docs/solana/phase1-member-concurrency.json`. No production objects were changed.

## Verified staging application, October 12, 2026

The user explicitly designated `bhxheuaoofiklsaurqlu` as staging and `zfnwypoxggqpairmwnja` as production. Project metadata verified the new staging instance in the GarmonPay Free organization; its initial public schema and GarmonPay function namespace were empty. Applied the three canonical migrations only to staging, then CLI-generated `20261013001939_phase1_04_staging_security.sql` to add the session-wallet index and revoke browser execution of the dashboard-created automatic-RLS event function. Production remains untouched. The fourth migration is conditional on that event function existing and returning event_trigger.

Real staging tests verified member uniqueness, privacy, follows, first-signup referral immutability, revoked-session denial, challenge binding/replay/rate limits, actual publishable REST/RPC denial and 10 restricted-role reads. Catalog checks show no allowed browser CRUD grants across 40 privilege combinations. The full CRUD execution matrix was cancelled and is not counted as passed. The hold/restore operations preserved all five tables' data checksums and exact privilege matrix. Security advisors have no warnings; five INFO notices describe intentional private-table default-deny RLS.

On October 12, 2026 the existing staging default secret was saved only in the private Members staging environment. The isolated HTTPS app was switched to this database. Generated-wallet HTTPS acceptance, including photo persistence, referrals, security checks, restart persistence, and anonymous REST/RPC denial, passed. Evidence: `docs/solana/phase1-supabase-https-acceptance.json`. Physical-device acceptance remains pending. Production was not modified.

## New-member wallet privacy default

Review `supabase/migrations/20261014021340_members_private_by_default.sql`: only ALTER COLUMN wallet_public SET DEFAULT false. Existing member choices, records, balances, permissions and functions are unchanged. Rollback: `members-private-default-rollback.sql`. Staging acceptance only is authorized; production application requires separate explicit approval.

Production default-only migration was explicitly approved and applied on October 13, 2026. Verified column default false, unchanged existing member record count/checksum, and no member-table security advisor warnings. This approval covers only the default change, not other production migrations.
