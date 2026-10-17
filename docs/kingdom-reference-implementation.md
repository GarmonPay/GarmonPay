# Premium kingdom UI release candidate — 2026-10-16

Branch: garmonpay-kingdom-reference. Baseline: 0230fa2c7da1ac552b5ed711d876b43ebda6eea0.

## Changes
- src/app/kingdom-site.css: slim non-overlapping header, fixed desktop sidebar, five cards below the intact hero, portrait mobile crop, compact feature rows and safe-area bottom navigation.
- src/components/Navbar.tsx: left mobile menu and shared deduplicated destinations.
- src/components/kingdom/home.tsx: mobile branding, image loading priority, truthful ledger availability and verified Devnet volume display.
- src/config/kingdom-navigation.ts: shared menu with member tools, wallet, leaderboards and clearly marked legacy contests.
- src/config/kingdom-navigation.test.ts: destination coverage and uniqueness regression check.

No artwork, animation layer markup, wallet authentication, database, deployment configuration or financial controls changed. Hero artwork, crown component, financial pause and Solana policy match the saved baseline hashes. No dependencies installed.

## Validation
TypeScript passed. Production build passed including lint/type checks. Fifty navigation and financial-pause tests passed across five suites. git diff --check passed.

Built application inspected at 1440px and 390px. Desktop routes: /member, /member/referrals, /member/paper, /solana/launchpad, /solana/trade, /solana/advertise, /solana/earn, /member/community, /games, /member/traders. Mobile: same except referrals/paper not separately repeated. All inspected destinations fit viewport width; one shared navigation header; no homepage energy scene on interior routes. Section heading headers are semantic content, not duplicate navigation.

Mobile menu opens, includes required member tools, and closes with Escape. Connect Wallet opens the existing chooser with Phantom, Solflare and Backpack. No signature or transaction was submitted. Full authenticated wallet flows require the owner wallet and were not exercised.

Anonymous local checks: session 401, admin users 403; member snapshot reports financialOperationsPaused=true and payoutsEnabled=false; fund and advertising checkout POST requests return 503. No financial operation executed.

## Reference deviations and unavailable features
The approved existing production lion/city remains intact rather than replacing it with artwork in the layout reference. Desktop cards sit below the hero so paws and coin remain visible. Mobile uses a portrait crop of the same source. Sample connected balances, unread badges, returns and rankings are omitted. Discover displays verified Devnet listings and available volume; it is not a market ranking. Paper issuance remains dependent on reviewed ledger activation and publisher credentials. Purchases, deposits, withdrawals, sends, payouts and live trading remain paused. Legacy contests and notifications retain separate historical account destinations; identities are not merged.

## Release and rollback
UI candidate only: no SQL migration or configuration change. Before production, deploy this committed candidate using the existing Vercel project/configuration and confirm the live alias, responsive layout, wallet chooser and pause responses. Prior production rollback target: dpl_ARC7SHJZSQTFsYQphtP4d5KQhU43. Roll back the application if navigation, authentication entry, rendering or financial pause checks regress. No database rollback is needed for this patch.

Screenshots are outside the repository at /Users/bishop/.codex/visualizations/2026/10/15/01a13d83-027a-7e33-aaf5-b953b1acc451/premium-kingdom-reference/desktop-1440-local.png and mobile-390-local.png.
