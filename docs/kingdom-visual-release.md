# Kingdom visual release — 2026-10-15

## Verified starting point
Production alias garmonpay.com resolved through the authenticated existing Vercel CLI to Ready deployment dpl_AShCXC3MTgAss4Bvbipa4KF1Ef9h (garmon-8fxi72mtp-garmonpays-projects.vercel.app). Local branch integrate/member-platform, HEAD 3900614. Member worktree remains untouched at 9aff027. Existing stash is preserved.

Before editing, 60 existing changed/untracked files were copied to /private/tmp/garmonpay-takeover-baseline-20261015 with a hash manifest and tracked binary patch. No reset, stash apply, stash drop or unrelated commit was performed.

## Presentation changes
- Homepage uses a new crop of the owner-selected lion reference, not the rejected reconstructed lion. Original Downloads source is unchanged. Six movement panels are excluded. A left-edge presentation mask conceals old poster lettering; original city marks and small decorative portrait billboards remain baked into the supplied art. It is a static source composition, not a rigged character or independently controlled video screen.
- Text and calls to action are separate from the artwork. Mobile stacks them without overlapping the lion. No simulated lion scaling or breathing is shipped.
- Official headline and slogan preserved. Availability is explicit. No funded balances, prices, activity or contests invented.
- Public navigation groups secondary destinations under More; mobile retains native buttons, Escape dismissal and existing wallet entry. Footer is grouped.
- Shared interior visual system covers Launchpad, trading, advertising, rewards, learning, member tools, paper/trader boards, games, legacy shells and admin. Existing components and handlers remain in use.
- Member navigation is a sidebar on desktop and wraps on mobile. Wallet entry remains the existing WalletMenu/WalletSignIn; no authentication or signing code changed.
- Interior wallet panels collapse so they do not dominate feature content. Admin authorization layout is unchanged.

## Protected work excluded
No changes to src/lib, src/app/api, middleware, migrations, dependencies, deployment configuration, financial calculation settings, wallet signing, trade protection or account enforcement. Financial operations remain paused. No chain transactions or paid image-generation calls.

## Actionable protected backlog
See kingdom-financial-correction.md. Owner targets in the latest takeover request differ from current code: 1000 views / $5 floor versus 500-view tiers; 50% viewer match versus 100%; 10%/5% advertiser commission versus 20%/10%. No rate changes applied. Earlier approvals in chat also conflict with these new targets, so they are not advertised as live offers.
- Wallet-generated handles and 7-day rename cooldown need a separately verified secure implementation; legacy policy is not sufficient.
- 10 virtual SOL and anti-gaming ranking policy depend on the pending reviewed production migration. Migration remains unapplied. No simulated balance is fabricated.
- 0.05 SOL launch fee and 1% trade-fee target remain unverified and unchanged.
- No new contests, real-money wagering, payouts or funded campaign functionality.
- Authenticated admin and signed-wallet flows require authorized sessions for full visual review. Do not bypass access controls to inspect them.

## Verification and rollback
Essential TypeScript/build, navigation, economics, admin authorization, wallet session/provider, financial pause and Devnet trade checks run. Browser screenshots and viewport checks are under the task visualization directory kingdom-release-qa. No real-device hardware or authenticated admin session was available.

Deploy only the validated visual tree using the established upload workflow, excluding environment files, .git, design and unrelated temporary scan scripts. Retain the pre-release deployment above for rollback through the existing Vercel rollback process. Roll back if public navigation, wallet entry, access control, paused operations, or source artwork fail post-deployment verification. A visual rollback needs no database rollback.

## Completed local checks
- Production build and its TypeScript checks passed after final layout corrections.
- Navigation/economics/wallet-guard subset: 18 passed.
- Admin/auth/request/pause/wallet/provider/session/Devnet trade subset: 97 passed, 1 skipped.
- Four-width responsive sweep (390, 412, 768, 1440): homepage, member, paper, traders, trade and games all matched document width with no horizontal overflow.
- Additional mobile screenshots: launchpad, advertising, rewards and learning. Public/header and member/header separation verified.
- Mobile menu opens; wallet chooser presents Phantom, Solflare and Backpack without requesting a signature. More menu exposes existing secondary routes.
- Free Connect Four: dropping a disc changes the turn from Gold to Purple.
- Local POST /api/wallet/fund: 503 FINANCIAL_OPERATIONS_PAUSED.
- Local GET /api/solana/auth/session: 401; GET /api/admin/users: 403; /admin/dashboard redirects to admin login.
- Local snapshot: financialOperationsPaused=true, paymentEnabled=false, payoutsEnabled=false.
- Local /design-preview/kingdom: 404.
- Trading HEAD 3900614787de9aa64068337673539983b1f7f673; member HEAD 9aff027fc87487b63cd011b69765dbfb4a1786b0; stash@{0} 1add02e9580de057d73531d2d4d999d1b087cfd7 unchanged.

## Verified production result
Ready deployment: dpl_ETEf7nsq1SFpeRSyf3bmciGYkrYz.
Deployment URL: https://garmon-i0b8b0wcs-garmonpays-projects.vercel.app.
Actual alias verified through Vercel inspect: https://garmonpay.com.
Live homepage artwork loads at native width 1111; desktop and mobile visual checks completed. Mobile menu and wallet chooser work without a requested signature. Launchpad, trade, advertising, earn, learn, member, paper, trader and games routes return 200; sampled live desktop routes have no horizontal overflow and no cinematic scene outside the homepage. Funding remains 503 FINANCIAL_OPERATIONS_PAUSED; anonymous wallet session is 401; admin users is 403; snapshot confirms payments and payouts false. Design preview remains 404.

This completes a deployed visual improvement, not activation or completion of unavailable product capabilities. Signed-in admin interiors and real wallet signature completion were not exercised. No fake member records or sessions were created to bypass that limitation. Independent billboard video, realistic character animation, full candlestick/watchlist expansion and new contest functionality are not delivered by this visual release.
