# Member platform progress

Worktree: `/Users/bishop/Desktop/garmonpay-member-platform`  
Branch: `cursor/member-platform`  
Economics version: `2026-10-14-member-v2`  
Nothing was pushed, merged, or deployed. The SQL files were not applied.

## Corrected rules

- Advertiser referrals: 20% of the first qualifying purchase, then 10% of each later qualifying purchase. A full refund stops that purchase from counting, so the next one is first again.
- Viewer referrals: 100% lifetime match of eligible verified advertising earnings, reserved separately. The viewer amount is not reduced.
- Advertising: 500 verified views or clicks. 5 seconds $6.99, 15 seconds $9.99, 30 seconds $14.99, 60 seconds $24.99. No subscription and no $5 minimum. No per-view dollar reward is configured, so none is displayed.
- Payments, payouts, and Mainnet financial settings stay off.
- The dashboard names wallet-signature as the production identity and does not enable the paused wallet session. Staging profiles are not wallets.

## Shared files

Navigation-only edits: `src/components/Navbar.tsx`, `src/components/PublicNavbarWrapper.tsx`, `src/components/PublicFooterWrapper.tsx`, and a link on `src/app/dashboard/page.tsx`. No Solana trade, wallet-auth, policy, or on-chain files were changed.
