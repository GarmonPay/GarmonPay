# Wallet authentication and standalone worker acceptance

Reviewed 2026-10-11. This document records source and isolated-test evidence, not financial activation approval or proof of the separately hosted worker's production state.

## Wallet boundary

`SOLANA_POLICY.walletAuthentication` remains hardcoded false. An environment variable cannot activate it. The client wallet control now shows a disabled “Wallet sign-in paused” state and does not start session requests, provider subscriptions, connection, or signing while disabled.

Inactive server implementation already provides:

- Exact configured-origin checks on challenge, verification, and logout requests.
- A cryptographic nonce and separate browser binding; only the binding digest is stored.
- Five-minute challenges, atomically consumed once before signature verification by a trusted database routine.
- Ed25519 ownership verification over a server-issued message that includes the wallet, configured domain/URI, chain, nonce, and expiration.
- Random session tokens stored only as hashes, one-hour expiry, revocation filters, and a separate banned-wallet identity lookup.
- Logout revokes the stored token before clearing browser cookies, preserving a retry path if revocation fails.

Verification now rejects malformed UUIDs and malformed 43-character base64url binding cookies before database access. Existing tests cover cross-origin challenge rejection, disabled authentication, expired/consumed challenge responses, invalid signatures, real Ed25519 signatures and altered messages, isolated session hashes, and oversized requests. New tests cover malformed bindings/IDs, session query revocation and expiry filters, banned or missing identities, disabled session reads, storage failures, and logout revocation ordering and retry behavior. Four focused suites pass, totaling 40 tests. These mock-backed route tests complement existing synthetic database nonce/permission tests; they do not prove production database wiring.

## Wallet acceptance gates before any activation

Mobile Wallet Adapter, Wallet Standard discovery, and a standardized SIWS adapter are not implemented. The current inactive client uses injected Phantom/Solflare providers and a custom server-issued sign-in message. Do not describe this as completed mobile wallet or standardized SIWS support.

Required future validation: deployed authentication RPCs and role permissions; production trusted-edge IP/rate-limit configuration; real concurrent replay and expired nonce integration tests; session rotation on renewed authentication; wallet account changes and disconnect/revocation tests; cookie security on the actual deployment; mobile and hardware-wallet signing behavior; and explicit owner authorization. Authentication must remain independent of legacy balances/admin roles. No session grants permission to move funds.

## Standalone fight worker

`server/fight-server.js` runs an independent HTTP/Socket.IO service, not a Next.js/Vercel route. Its source hardcodes `FINANCIAL_OPERATIONS_PAUSED = true`; settlement, betting closure, and tournament advancement return before database mutations. Source also rejects missing, short, or known default join secrets and verifies HMACs with a timing-safe comparison. These source properties do not establish what a separately deployed host currently runs.

The repository contains example `garmonpay-fight-server.onrender.com` URLs in `.env.example`, while production setup documentation suggests `wss://garmonpay.com`. The parent audit also found the Render hostname in the local public boxing URL configuration and a conflicting `wss://garmonpay.com` arena value in production configuration. These non-secret URL values strengthen the candidate-host inference but do not establish the currently running worker or its revision. A read-only GET to the example `/health` URL could not resolve DNS in the restricted execution environment (HTTP 000). A subsequent approved network-enabled read-only GET timed out after 15 seconds with zero response bytes and HTTP 000. No health payload or deployment identity was obtained. These results do not prove the host is absent; a sleeping service, upstream delay, or connectivity issue remains possible. No WebSocket action was sent, no worker was started or deployed, and no secret environment value was read.

The current health response reports only service identity, time, and `alive`; it does not report build identity or the financial pause flag. Before production sign-off, obtain the authoritative worker host and deployment identity, compare its revision with the audited source, verify TLS/allowed origins and secret configuration through non-secret metadata, and inspect a read-only health response. Add a non-secret revision/pause status to a future worker release and retain the financial pause. Do not infer worker safety from a Vercel website deployment.

## Worker dependency reproducibility

`server/package.json` declares Node `>=18`, `express ^4.21.0`, `cors ^2.8.5`, `socket.io ^4.7.5`, and `@supabase/supabase-js ^2.45.0`. There is no `server/package-lock.json` in the repository. These are declared ranges, not evidence of installed production versions or specific vulnerabilities. The worker is independently installed by its start script and therefore is not covered by the website's isolated runtime dependency audit. Before any worker deployment, pin a supported Node release, generate/review a lockfile in isolated staging, audit resolved production dependencies, and validate compatibility with the actual worker environment. No packages were installed or changed during this review.
