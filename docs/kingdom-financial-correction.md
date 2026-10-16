# Kingdom financial correction — not applied

This note records conflicts between the owner’s stated business targets and the code that is live in this checkout. The visual redesign did not change these calculations, database checks, or tests. Financial operations remain paused.

## Owner targets, not implemented

- Minimum package: 1,000 verified views
- Minimum advertising checkout: $5
- Viewer referral match: 50% of eligible verified viewer earnings, lifetime
- Advertiser commission: 10% of the first eligible purchase and 5% of later eligible purchases, lifetime

## What the member-platform code records

`src/lib/member-platform/economics.ts`

- `ADVERTISER_FIRST_PURCHASE_BPS = 2000` (20%)
- `ADVERTISER_SUBSEQUENT_PURCHASE_BPS = 1000` (10%)
- `VIEWER_MATCH_BPS = 10000` (100%)
- `PACKAGE_VIEWS = 500`
- `PAYMENT_ENABLED = false`
- `PAYOUTS_ENABLED = false`
- `PAPER_STARTING_LAMPORTS = 10000000000` (10 virtual SOL)

`src/lib/member-platform/advertising.ts` prices each 500-view package at $6.99, $9.99, $14.99, or $24.99.

`src/lib/member-platform/member-platform.test.ts` expects the 20% / 10% / 100% calculation and rejects a 1,000-view draft.

`src/components/solana/AdvertisingPlanner.tsx` keeps the draft at 500 views. The label now says the figure is a code record and checkout is paused. The price math is unchanged.

`src/app/member/advertising/page.tsx` still requests `views=500` because that is what the quote route accepts.

Unapplied SQL, do not run:

- `supabase/member-platform/0001_isolated_not_applied.sql` checks `views = 500`
- `supabase/security/review/20261015_member_wallet_workspace.sql` checks `views = 500`
- `src/lib/member-platform/wallet-guard.test.ts` asserts that check

An older quote helper, `src/lib/solana/advertising-pricing.ts`, is closer to the stated targets (views in increments of 1,000, a $5 checkout floor, and a 50% viewer reserve). It is not the active member-platform rate.

## Separate work required before any rate change

1. Replace the economics constants and advertising tier view counts.
2. Update `member-platform.test.ts` and any draft validation that throws unless views are 500.
3. Update the unapplied SQL checks and `wallet-guard.test.ts` together, then review the new hash before any migration.
4. Keep `FINANCIAL_OPERATIONS_PAUSED`, `PAYMENT_ENABLED`, and `PAYOUTS_ENABLED` off until a separate financial authorization.

## Username cooldown, not implemented

The intended wallet policy is an automatic username, member edits, and a seven-day cooldown, with the wallet address as the stable id. `supabase/migrations/20260612120000_username_change_history.sql` enforces 30 days on legacy `public.users`. No seven-day rule was added. This redesign did not change authentication or that migration.

## Paper trading migration, not applied

The member paper page can record a virtual fill when the signed-in workspace already has paper state. The pending production migration that issues the 10 virtual SOL balance was not applied. Virtual SOL is not withdrawable. If the workspace has no paper balance, the page says so.

## Launch fees, not changed

The 0.05 SOL platform launch fee and the 1% trade-fee split discussed earlier remain unverified and were not implemented. LaunchLab fee copy in the product was left as already shipped.
