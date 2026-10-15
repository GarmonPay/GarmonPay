# Phase 1 member release — acceptance boundaries

## Current status — October 12, 2026

Supabase-backed Members HTTPS acceptance passed against staging `bhxheuaoofiklsaurqlu`. The private staging server secret is configured, and the isolated app at https://handed-teens-shortcuts-kent.trycloudflare.com/solana/members now uses that database instead of the local test store. Evidence: `docs/solana/phase1-supabase-https-acceptance.json`. Production Supabase, production secrets, financial operations, and production deployment were not changed. Real Phantom/Solflare prompts and physical-device photo selection are still outstanding.

The scope is wallet identity and member community only. No financial features were added or enabled.

Live: https://garmonpay.com/solana/members — responsive purple-and-gold landing page, Members navigation and explicit pause notice. Desktop (1280 px) and mobile (390 px) verified in production without horizontal overflow. Public directory returns `status: paused`; unsigned private profile reads return 401; profile/follow writes and wallet challenges return 503 at the production pause gate.

Staging implementation: permanent account per verified wallet; automatic profile creation; unique usernames; biography and resized raster pictures persisted in the member table; wallet visibility defaulting to public; search/public profiles; follows/unfollows; unique referral links and immutable first verified signup attribution. The server and database resolve the actor from a valid hashed session. Browser roles cannot read raw member rows or execute privileged functions. Public projections omit hidden addresses, private referral fields and bearer credentials.

Verification uses synthetic data only: two independent real Ed25519 wallets through actual challenge/verify/session routes, three isolated member accounts, actual profile/search/follow route handlers against SQL, replay/expiry/revocation/ban/CSRF checks, privacy projection, referral attribution, raster limits, and provider response shapes. Twelve independent native PostgreSQL clients verify permanent account creation, username races and duplicate follows. TypeScript and both scoped/public and local production builds are checked separately. Public release smoke checks confirm financial protections remain in effect.

Synthetic browser acceptance also passed automatic profile creation, username/biography save and reload, duplicate username rejection, hidden-wallet public profiles, search, follow/unfollow, sign-out, permanent-account recovery, first-signup referrals and noninflating repeat logins. The authenticated 390 px form fits inside its panel after a grid-sizing fix. This uses a disposable local SQL adapter and synthetic signer harness, not production Supabase HTTP or actual wallet applications.

Not yet accepted: actual Phantom/Solflare extensions and mobile wallet browsers, including user approval/cancellation and account switching. Picture-selection UI testing is blocked by the Chrome extension’s disabled local file access; server validation/persistence passed. Provider response unit tests do not establish real-device compatibility. Phase 1 is not complete or ready to activate.

## Database review bundle

Apply nothing automatically. The user's existing restriction requires separate explicit authorization for production schema/privilege changes. Review these three additive scripts in order:

1. `supabase/security/staging/phase1-wallet-identity.sql` — identities, hashed sessions and single-use challenges only. Does not create financial tables or modify legacy users/balances.
2. `supabase/security/staging/phase3-session-rotation.sql` — atomic session rotation.
3. `supabase/security/staging/phase1-members.sql` — private member/follow tables and narrowly scoped server RPCs.

CLI-generated canonical review migrations are in `supabase/security/phase1-review/supabase/migrations/`, outside the automatic migration queue. Their contents match the tested staging scripts. Before any authorized production application, generate canonical migrations with the Supabase CLI, check schema conflicts/version/advisors, capture a backup and review grants. Prefer application rollback/keeping the tables; never discard member data to reverse a release.

Production wallet authentication remains hard-disabled. The root staging middleware now admits only reviewed wallet/member writes when wallet authentication is explicitly enabled in isolated staging; all financial writes stay paused. This middleware change, active auth verification route, wallet adapter hardening and database setup were excluded from the public deployment. Production activation requires successful real-device acceptance, security approval and separate authorization.

## Final isolation and signature hardening

The synthetic browser confirmed that a stale tab cannot save under a newer wallet session: profile and follow handlers bind the submitted actor ID to the current hashed session before invoking the SQL mutation. The newer account remained unchanged. Session polling preserved an unsaved biography draft.

A local adversarial test reproduced native verifier acceptance of a trivial small-order Ed25519 signature. Wallet authentication now requires a canonical, nonzero prime-order public key, canonical base64 and strict signature verification using the pinned existing library version `@noble/curves` 1.9.7. Both genuine Node-generated wallet signatures and the actual challenge/verify routes passed; the forgery produces no member or session. The general base58 address validator remains unchanged for program addresses and blockhashes. Maintainer reference: https://github.com/paulmillr/noble-curves/tree/1.9.7

The user explicitly chose **keep production database unchanged**. No Phase 1 schema or privilege changes have been applied. Do not treat the earlier migration approval question, elapsed time or continued implementation as authorization. Real wallet-app and picture-selection acceptance remain outstanding; production authentication and finances remain disabled.

## Continuing acceptance: image decoding and reversible permissions

The server now decodes uploaded raster pixels with Sharp before saving, normalizes portraits to 64×64 JPEG, removes EXIF/ICC metadata, rejects corrupt pixel streams and excessive dimensions, and preserves the previous profile on a rejected upload. Actual route + SQL integration verifies the normalized picture is persisted and a corrupt upload cannot replace it or change the biography. This remains synthetic local acceptance; desktop/mobile file selection and real Supabase HTTP persistence are still outstanding. Pictures are stored in the private member row, not a public Storage bucket.

The isolated review migrations now explicitly remove inherited service-role grants before assigning the required privileges. Native PostgreSQL tests begin with broad Supabase-style default grants, assert RLS and browser denial on all five tables, assert no server DELETE on permanent members, and verify the executable access hold/restore returns exactly the reviewed privileges while preserving all identity/member/follow rows. Both scripts are in `supabase/security/phase1-review/`; neither has run in production.

Production database remains unchanged under the user's prior decision. No real device acceptance is claimed. The optional local-validator transaction test is intentionally skipped for this wallet-signature-only release; it is not evidence of wallet compatibility or financial acceptance.

## HTTPS acceptance staging is now available

Temporary Members-only HTTPS: https://handed-teens-shortcuts-kent.trycloudflare.com/solana/members. Automated requests using generated test keys passed account/profile/photo/referral/privacy/security flows, including an actual application restart with unchanged member IDs and valid sessions. That first run used local PostgreSQL-compatible test data. Financial/admin/fixture-login routes are blocked. The narrow-width page renders at 390px without horizontal overflow. No physical-device or real wallet-app result is claimed. Checklist: `docs/solana/phase1-device-acceptance.md`. Earlier transport evidence: `docs/solana/phase1-https-staging-acceptance.json`.

## Supabase HTTP acceptance passed

The same HTTPS origin now uses staging `bhxheuaoofiklsaurqlu`. A later generated-wallet run passed the same account, photo, privacy, follow, referral, replay, forgery, origin, and financial-block checks, plus restart persistence and a live Supabase read of the created member IDs, photo, and privacy. Anonymous table and RPC access stayed denied. Evidence: `docs/solana/phase1-supabase-https-acceptance.json`. Desktop loopback `127.0.0.1:4326` is still the separate local disposable handoff. Production activation is still blocked on real wallet-app and device photo-selection acceptance.
