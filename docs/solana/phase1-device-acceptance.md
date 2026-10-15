# Phase 1 real-device acceptance — pending

HTTPS handoff: https://handed-teens-shortcuts-kent.trycloudflare.com/solana/members. Open this URL inside the actual Phantom or Solflare mobile wallet browser. Desktop extensions can use the same HTTPS URL. As of October 12, 2026 this temporary Members-only site is backed by staging Supabase `bhxheuaoofiklsaurqlu`, not the earlier local test store and not production. Automated Supabase HTTP acceptance already passed. Generated `qa_` profiles are automated test accounts. Financial/admin/fixture routes are blocked. Availability depends on this computer and the staging processes remaining on.

Desktop handoff: http://127.0.0.1:4326/solana/members on this computer only. It runs the Members interface and signature routes against disposable local PostgreSQL-compatible data, with no production credentials and every financial operation paused. Data lasts only while this test process runs. It is not Supabase HTTP acceptance or mobile-device verification. Do not use the fixture-login route for real-wallet acceptance.

Use two test wallets. Never provide a seed phrase, private key, raw signature, session cookie or credentials in a report. Report device, OS/browser, wallet name/version and pass/fail only.

1. Select Phantom; connect and approve only the sign-in message. Confirm the message names the local origin, identifies the wallet, has a nonce and expiry, and does not request a transfer. Reject a prompt once and confirm no profile is created from the rejection.
2. Sign in successfully. Save a unique username, biography and chosen PNG/JPEG/WebP photo. Reload: username, biography and photo should persist. Sign out and sign in with the same wallet: the same account and referral link should remain.
3. Repeat with Solflare and the second wallet. Confirm a separate account, reject a duplicate username, and verify that neither wallet can edit the other profile. Switch wallets with an unsaved profile open in a second tab: saving the stale tab must be rejected.
4. Hide the first account's wallet. From the second account and signed-out directory, confirm the public profile hides the address. Test search, follow, repeated follow, unfollow and profile links.
5. Use the first wallet's referral link for a new second-wallet signup. Only first verified signup should increment attribution; repeat login should not increment it. On the HTTPS handoff, use a wallet that has never signed in to staging. The local desktop handoff can instead use a fresh disposable database.
6. Replace and remove the photo; reload after each save. Check portrait display, label readability, error feedback and controls at desktop and narrow widths. Try an invalid file and confirm the existing profile remains intact.
7. Repeat these steps at the HTTPS handoff in supported wallet in-app browsers on actual Android/iOS hardware. Responsive browser emulation is recorded separately and does not count as this acceptance. Record physical-device results separately from the completed generated-wallet Supabase HTTP acceptance.

## Current infrastructure boundary

Staging Supabase `bhxheuaoofiklsaurqlu` is the only database behind the HTTPS handoff. Production schema remains explicitly held unchanged. Do not substitute the production database, publish the disposable fixture publicly, or enable production authentication. Supabase HTTP acceptance for generated wallets, profiles, photos, referrals, and security checks has passed. Physical wallet-app and device photo-selection acceptance are still required before any production activation.

## Retest after callback/session repair

Use https://handed-teens-shortcuts-kent.trycloudflare.com/solana/members. Refresh before testing the rebuilt app. On iPhone, approve Phantom connection and the separate sign-in message if requested. Confirm the member editor appears, then reload and confirm the same username/profile persists. If approval returns without a profile, report only the displayed error and whether a separate sign-message approval appeared; never send keys, signatures or cookies. A connection approval alone does not authenticate an account. Staging is now backed by Supabase, and automated persistence/security checks pass; physical-device wallet and photo chooser acceptance remain unverified.

## October 13 Safari / Phantom build

Refresh the staging Members page in Safari. Connect should now request Phantom connection approval followed by a separate signed-message approval, returning to the original HTTPS Members URL. Confirm the member editor appears and persists after reload. Test directly in Phantom's browser separately. Safari and Phantom's built-in browser have separate cookies and browser storage; no session is copied between them. If iOS returns to another browser, the RETURN_CONTEXT diagnostic is expected rather than silent failure. Record the displayed error/code and which browser received each return. Never send signed payloads, private keys, callback URLs with encrypted query parameters, or cookies. Previous failed physical iPhone result remains failed until this retest passes.

## Live network-selection and mobile profile retest

The release is live at https://garmonpay.com/solana/members. If Phantom is in Testnet Mode, choose Devnet in Wallet network; if Testnet Mode is off, choose Mainnet. This changes the authentication message only, not financial activation. Test desktop extension and physical iPhone separately. After sign-in, save HolyGhost as Display name with an optional handle and verify biography/photo reload persistence. Test Copy Referral Link, native Share and the five-item connected-wallet sheet. Existing wallet-address choices are preserved; newly created members now default private following the user's explicit default-only migration approval.
