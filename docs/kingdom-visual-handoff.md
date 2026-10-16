# GarmonPay Kingdom visual handoff

October 16, 2026. The owner locked the live appearance. Do not redesign the homepage, navigation, cards, or colors. Finish functionality only. Do not start a new repository. Do not delete the current homepage.

## Project

- Working copy: `/Users/bishop/Desktop/GarmonPay`
- Branch: `integrate/member-platform`
- Live site: https://garmonpay.com
- Current production deployment: `dpl_9yUjcqWnoHmg2gw1Dy6NSXfFt1dJ`
- Inspector: https://vercel.com/garmonpays-projects/garmon-pay/9yUjcqWnoHmg2gw1Dy6NSXfFt1dJ
- Previous locked homepage deployment: `dpl_4UFuqjt7bxubbZLz3kDVXYm1ZoBp`
- Homepage art is the owner’s locked mockup crop at `public/images/kingdom/locked-hero.jpg`. Do not generate a new lion. The full mockup copy is `design/kingdom-asset-prep/references/locked-official-design.png`. Earlier Downloads references are historical.
- Isolated worktree, do not deploy from it: `/Users/bishop/Desktop/garmonpay-member-platform`
- Do not commit, push, or discard unrelated dirty files unless the owner asks.
- `FINANCIAL_OPERATIONS_PAUSED` stays `true` in `src/lib/security/financial-pause.ts`.

## Approved concept

The public homepage is the cinematic GarmonPay Kingdom. Interior pages are premium purple-and-gold tools. The full lion-and-city scene belongs on the homepage only.

Locked copy:

- Headline: `ENTER THE KINGDOM.`
- Slogan: `GET SEEN. GET KNOWN. GET PAID.`
- Support: `YOUR COIN DESERVES MORE THAN A LAUNCH. IT DESERVES AN AUDIENCE.`

The gold coin marked G is a brand symbol. It is not an official GPAY token and not a cryptocurrency listing.

## Authoritative artwork

Use these two files. They are the approved references. Do not treat the generated candidates as identical to them.

- Lion identity and movement: `/Users/bishop/Downloads/E9BF6706-3A29-44BF-81E5-46A90B54054D.PNG`
- Homepage composition: `/Users/bishop/Downloads/DD95F186-542E-45AB-8B43-6E986ED18565.PNG`

Working copies:

- `design/kingdom-asset-prep/references/lion-identity-reference.png`
- `design/kingdom-asset-prep/references/homepage-composition-reference.png`
- `design/kingdom-asset-prep/references/movement-strip-reference-only.png`

The six small frames at the bottom of the lion file are a movement reference. They must not appear on the homepage. Do not copy sample balances, GPC labels, fake prices, or the mock dashboard from the composition reference.

Rejected art, do not use:

- `public/images/garmon-master/lion-hero.webp`
- `/Users/bishop/Downloads/80D91812-BCCB-45FF-8B83-72A3F4A7DD37.PNG` (October 4, slogan “PLAY. EARN. BE REWARDED.”)

## What is on the site now

Public images:

- `public/images/kingdom/lion.png` — transparent reconstruction, 789×589
- `public/images/kingdom/city.jpg` — city plate, 1280×720

Homepage component: `src/components/kingdom/home.tsx`  
Homepage route: `src/app/page.tsx`  
Scene CSS: `src/app/kingdom-site.css`  
Shared color tokens also sit in `src/app/globals.css`.

The scene has a light pulse, a small lion rise, and desktop billboard words (“Your campaign”, “Get seen”, “Launch & promote”, “Discover”, “Watch”, “Play”). Those words are placeholders. They are not advertising impressions. Mobile hides the placeholder boxes so they do not cover the headline. `prefers-reduced-motion` stops the movement. There is no sound and no separate tail layer.

Navigation lives in `src/config/solana-navigation.ts` and `src/components/Navbar.tsx`. Every header link goes to an existing route. Contests are omitted because there is no public contests route. Paid game entry stays off.

## Why the artwork pass stopped

Local extraction could not lift the original lion’s raised tail without taking city pixels with it. One Cursor image reconstruction was already made for the lion and one for the city. Further generation was not authorized. Repeating color masking or another generation of the same prompt will not recover the original pixels.

The live lion is recognizable as a golden crowned lion with violet eyes, a mane, both front paws, a raised tail, and a G coin. It is not the approved drawing.

Differences to correct before calling the art final:

- Face, crown points, and coin emblem differ.
- The pose is more upright. The reference lion lies lower, with the coin against the chest.
- The tail is raised, but the curve is smoother and shorter than the reference.
- A thin magenta edge can remain under the paws.
- The city matches the purple-and-gold night palette. The skyline, street, and camera differ.
- Some city billboards still contain marks or letter fragments.

Source candidates, not approved finals:

- `design/kingdom-asset-prep/phase-2/pending-visual-approval/lion-candidate-PENDING.jpg`
- `design/kingdom-asset-prep/phase-2/pending-visual-approval/lion-transparent-PENDING.png`
- `design/kingdom-asset-prep/phase-2/pending-visual-approval/city-candidate-PENDING.jpg`
- `design/kingdom-asset-prep/phase-2/pending-visual-approval/desktop-composition-PENDING.jpg`
- `design/kingdom-asset-prep/phase-2/pending-visual-approval/mobile-composition-PENDING.jpg`
- `design/kingdom-asset-prep/phase-2/pending-visual-approval/comparison-lion-PENDING.jpg`
- `design/kingdom-asset-prep/phase-2/pending-visual-approval/comparison-city-PENDING.jpg`
- `design/kingdom-asset-prep/phase-2/pending-visual-approval/REVIEW.md`

Failed extractions, do not ship:

- `design/kingdom-asset-prep/attempts/`
- `design/kingdom-asset-prep/phase-2/incomplete/`

## Unfinished visual work

The live lion still differs from the approved drawing. Dashboard and admin shells now use Kingdom gold navigation, and the public games page links rewards, existing tournament boards, and paper trading. Individual game rooms, trade tickets, and admin tools still use their existing layouts. There is no separate tail layer, so the homepage is not fully animated.

The FAQ at `src/app/faq/page.tsx` no longer claims daily cash, instant referral pay, or an official GPAY token. The referral terms page has a pause notice and still contains the older legal clauses.

There is no isolated tail asset, so do not describe the lion as fully animated.

## Do not change while designing

- `src/lib/security/financial-pause.ts`
- `src/lib/member-platform/economics.ts` and `src/lib/member-platform/advertising.ts`
- Wallet sign-in in `src/components/solana/WalletSignIn.tsx`
- Launch fees, price-impact checks, and LaunchLab transaction code
- Database migrations. Do not apply `supabase/member-platform/0001_isolated_not_applied.sql`.
- The seven-day username rule is not implemented. Legacy SQL is 30 days in `supabase/migrations/20260612120000_username_change_history.sql`.
- Paper trading’s 10 virtual SOL migration is not applied. Do not show a fake balance if the account has none.
- Do not launch FOXNEW, a vanity `gpay` mint, Mayhem, or an official GPAY token.

Financial conflicts are listed in `docs/kingdom-financial-correction.md`. The code still records 500-view packages, a 100% viewer match, and 20% / 10% advertiser commissions. The owner’s targets are 1,000 views, a $5 minimum, a 50% viewer match, and 10% / 5% advertiser commissions. Do not advertise either set as a live offer. Do not change the calculations in a visual pass.

## Deploy, only after a real visual improvement

Build from `/Users/bishop/Desktop/GarmonPay`. Do not run `npm run dev`. Do not deploy from the git checkout or the member worktree.

```bash
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude .env.local --exclude '.env.*' \
  --exclude .vercel --exclude coverage --exclude design \
  --exclude scripts/tmp-fox-scan.mts \
  /Users/bishop/Desktop/GarmonPay/ /private/tmp/garmonpay-web-upload/
```

Remove any `.env.production` that remains in the upload folder. Keep `/private/tmp/garmonpay-web-upload/.vercel/project.json` as project `prj_gWNHw6NDw34bVfMpWAIsA9kR42s3`, org `team_Y6eSeUbo1ILPTORHqdCb2FXl`, name `garmon-pay`.

```bash
cd /private/tmp/garmonpay-web-upload
npm_config_cache=/private/tmp/garmonpay-npm-cache npx -y vercel@63.1.2 deploy --prod --yes --scope team_Y6eSeUbo1ILPTORHqdCb2FXl
```

After deploy, confirm https://garmonpay.com still shows `ENTER THE KINGDOM.`, `/design-preview/kingdom` returns 404, and `POST /api/wallet/fund` returns 503 `FINANCIAL_OPERATIONS_PAUSED`.

Do not deploy a homepage that drops the lion, the city, or the locked copy just to ship something simpler.

GET SEEN. GET KNOWN. GET PAID.
