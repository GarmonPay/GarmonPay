# Phase 1 Members handoff — October 12, 2026

Staging Supabase: `bhxheuaoofiklsaurqlu`. Production Supabase: `zfnwypoxggqpairmwnja`, not modified. Financial operations remain paused. https://handed-teens-shortcuts-kent.trycloudflare.com/solana/members is a temporary tunnel on this computer, not permanent hosting.

The live server is the Next standalone process on `127.0.0.1:4327`, started with `scripts/staging/start-member-standalone.mjs`. It binds loopback only and no longer prints the `next start` standalone warning. The proxy and cloudflared process were left running. Do not run `npm install` in `/private/tmp/garmonpay-member-mobile-stage`.

## Verified

- Standalone launch was proved on port 4328 while the old server kept serving, then the live port was switched once.
- All 6 member profiles, 1 stored photo, 3 referral links, 1 follow, 6 identities, and 11 sessions have the same checksum before and after that restart. Evidence: `docs/solana/phase1-restart-persistence.json`.
- The recovered public profile still hides its wallet. Unsigned profile reads return 401. A financial write returns 503. The stylesheet returns 200.
- Unit tests: 413 passed. Route/SQL integration tests: 23 passed, 1 optional local-validator test skipped. Staging client guard tests: 2 passed. Isolation check passed.
- Emulated layout has no horizontal overflow at 390, 360, and 1280 pixels, or on the public profile at 390. This is not a physical phone test.
- Earlier the same evening: generated Ed25519 sign-in, photo replace/remove, search, follows, privacy, referrals, and sign-out recovery. Evidence: `docs/solana/phase1-live-acceptance.json`.

## Re-checked on the same server, October 12, 2026, 10:00 PM

The port 4327 process was left running. Port 4328 stayed stopped. No second tunnel was created.

- Generated-wallet live acceptance passed again: permanent account, normalized photo save/replace/remove/reload, corrupt upload rejected, hidden wallet, search, follow/unfollow, one-time referral, and sign-out recovery. Evidence: `docs/solana/phase1-live-acceptance.json`. The new accounts raised the member count from 6 to 8. All 6 earlier member ids are still present. One stored photo and the earlier referral links remain.
- Publishable-key REST checks made 30 attempts against the five private tables and ten server functions. None were allowed: 20 returned 401 and 10 returned 404. Isolation check passed.
- Unit tests covering members, wallet messages, sessions, and the financial pause: 102 passed. Local route/SQL integration: 23 passed, 1 optional validator test skipped.
- In a browser without a wallet extension, choosing Phantom and choosing Solflare each showed the install-or-open-wallet-browser message. No profile form or file picker appeared, and no account was created. Username search returned only the requested staging profile. The hidden-wallet public profile still showed its biography. Emulated layout had no horizontal overflow at 360, 390, and 1280. The page still uses the dark purple field and gold button. This is not a phone test.
- Production `https://garmonpay.com` still returns 503 for a wallet challenge and for a wallet fund request. Production wallet authentication and financial operations were not enabled. The working tree was not deployed: it contains unrelated uncommitted game and financial edits, and real wallet approval is still outstanding.

## Prepared and not performed

- Phantom 26.32.0 in desktop Chrome approved one staging sign-in at 10:05 PM. It created permanent member `m_2f87a07eef904ebe89ad`. The stored challenge named the staging host, showed an address, had a nonce and a five-minute expiry, and said it does not authorize a transaction or transfer. That session is still active. No rejection, profile save, photo, disconnect, reconnect, second account, or referral was recorded for it. Evidence: `docs/solana/phase1-phantom-manual.json`. Solflare is not installed.
- A physical iPhone opened the browse build inside Phantom and tapping Connect & sign in did nothing. That tap assigned Phantom's browse link again from inside Phantom, and iOS dropped the navigation, so `connect()` never ran. The replacement announces Wallet Standard `wallet-standard:app-ready`, calls `window.phantom.solana.connect()` from the tap when the provider is present, and shows an error instead of opening another browse link when the page is already inside the wallet. Mobile acceptance stays failed until a physical iPhone completes sign-in.
- Production migration and rollback: `docs/solana/phase1-production-migration-plan.md`. Neither script was applied. Staging was not migrated again.

## Do not repeat

Do not recreate the staging secret, drop staging member rows, point the tunnel at production, or treat this tunnel as the production host. Production activation still needs the manual wallet and device checks plus a separate approval.
