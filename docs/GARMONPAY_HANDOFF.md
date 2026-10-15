# GarmonPay handoff

Updated October 14, 2026, after production deployment of the uniform price-impact limit, sell controls, sign-in disclosure, and wallet-deeplink compile fix. No secrets belong in this file. The pending `gp_sol_devnet_launches` registry SQL was not executed. Mainnet financial operations stay disabled.

The domain-review draft is `docs/solana/phantom-domain-review.md`. It has not been emailed or submitted. Do not tell anyone to proceed past Phantom’s warning.

Sign-in defaults to message network `mainnet` and mobile cluster `mainnet-beta` because that is Phantom’s sign-in chain. The session stores a wallet address only. Devnet trades always use `https://api.devnet.solana.com`.

Admin wallet `HLQyS1fLfboSvY5jwQwmpk394QfZhuWMZWmGZ2Bj7QUE` still has Devnet token account `Ah9UJqSHzfa6Rq5SoLndXpHDbjB39hEqgwUzpe2mYUkd`. Its FOXNEW balance is 0. Confirmed Devnet transaction `5fubPJ87zLZVxiBXeuQyqo9FsFCYhbFxKFAWNJPx7HoN2GYCsWHzVCPxBkZWesnfYwYpAPBKG89A6awyYgdEVRy7` at 2026-10-15T01:05:24Z is a CPMM `SwapBaseInput`. It moved 7,931,000 FOXNEW from that wallet into pool authority `CXniRufdq5xL8t8jZAPxsPZDpuudwuJSPWnbcD5Y5Nxq` and credited the wallet about 0.000790706 SOL. The mint does not exist on Mainnet. The tokens were sold into the Devnet pool. They were not found on another network.

Every trade at 5.00% impact or more is blocked, including the 0.00001 SOL FOXNEW buy. A 100 FOXNEW unsigned sell still quotes under 5%. Nothing was signed or broadcast. Production is `dpl_AmUcC1t8qQeCyHQuY2V9nqkgtcL2`, aliased to https://garmonpay.com. It replaces `dpl_CkG65Vvcd2QGzXnfSWGgGK4J98zr`. Inspector: https://vercel.com/garmonpays-projects/garmon-pay/AmUcC1t8qQeCyHQuY2V9nqkgtcL2.

## 1. Current status and Git revision

- Repository: `/Users/bishop/Desktop/GarmonPay`
- Branch: `integrate/member-platform`
- HEAD: `f40a08c` — Record the production deployment of the Devnet trade safeguards.
- Local commits only. This branch has not been pushed. The member worktree at `/Users/bishop/Desktop/garmonpay-member-platform` remains on `cursor/member-platform`.
- Production: https://garmonpay.com
- Production deployment: `dpl_AmUcC1t8qQeCyHQuY2V9nqkgtcL2`, aliased to https://garmonpay.com. It replaces `dpl_CkG65Vvcd2QGzXnfSWGgGK4J98zr`.
- Inspector: https://vercel.com/garmonpays-projects/garmon-pay/AmUcC1t8qQeCyHQuY2V9nqkgtcL2
- Do not roll back to `dpl_GP1TbxdKHnBp3PZUUprvPxfKuqy9`.
- Deploy from a git-free copy at `/private/tmp/garmonpay-web-upload`. Do not upload `.env.local`. Do not set `GARMONPAY_DEVNET_LAUNCH`, `GARMONPAY_VANITY_WORKER`, or a wallet-auth flag on Vercel.

## 2. Active branch and uncommitted changes

The working tree remains dirty. Do not revert or commit it as a batch.

The owner confirmed Phantom sign-in works on a physical iPhone. The connected wallet shows as `93SD…nPcS`. The sign-in message still says `Chain ID: mainnet`. A later members-page error, “Unable to check your sign-in. Please retry.”, came from session reads sharing the 10-per-minute sign-in limit. Those reads now have their own limit. Phantom provider refreshes no longer revoke the server session. Challenge and session cookies are HttpOnly, Secure, and SameSite=Lax so the in-app browser keeps them. Disconnect still ends the session. The member account remains.

This pass separated display names from public handles, replaced the long referral URL with a copy-and-share card, and made the connected-wallet menu a compact bottom sheet on narrow screens. New members keep the wallet address private. Existing public or private choices were not rewritten.

The next deploy fixed the header menu and the wallet list together. MetaMask was repeating because every Wallet Standard announcement appended another wallet object, and the picker only collapsed exact display-name matches. Account suffixes, chain suffixes, and a fresh announcement each became another MetaMask button in a two-column grid with no height limit. On desktop that list sat in an absolute panel up to a full viewport wide, so it read as a stretched sheet and ran off the screen. Registration now keeps one entry per Solana product identity. Ethereum-only providers are not offered. The chooser shows Phantom, Solflare, Backpack, and More Wallets. Other Solana wallets appear once inside More Wallets. The desktop menu is a 300px dropdown under the wallet button. Narrow screens still use the portaled bottom sheet. The header shows the display name, or a real username, instead of the wallet address. A generated `m_` username shows as Member. Sign-in still requires a signature. Disconnect and Switch Wallet still end the server session before another wallet can sign in.

## 3. Completed features and verified tests

- Display names accept `HolyGhost`, spaces, apostrophes, periods, and hyphens, at 2–32 characters. The browser `pattern` attribute is gone. Invalid names return “Use 2–32 letters or numbers. Spaces, apostrophes, periods, and hyphens are allowed.”
- A public handle is optional and separate. Leaving it blank keeps the generated `m_` username, and that generated value is not shown as the display name or as an @handle.
- A live Ed25519 session on `dpl_7BXQEszePzqtJmofanWyha8SNWst` saved display name `HolyGhost` and biography “A short introduction.” A second read returned both. The new test member was private. A one-character name was rejected. The test wallets were deleted. This was not the owner’s iPhone save.
- Short invites use `https://garmonpay.com/join/{8-character-code}` and redirect to `/solana/members?ref={code}`. The original 32-character `?ref=` codes still attribute. Invalid join codes return 404. `/r/[code]` still sends the legacy account flow toward `/register`.
- A second new wallet using the short code counted one verified referral. Repeating that login did not add another. Signing in with one’s own code did not add one. A third wallet using the 32-character code counted a second referral. Those rows were deleted.
- `POST /api/wallet/fund` returned 503. The challenge line was exactly `Chain ID: mainnet`.
- On a 390px browser, the members header fit with no horizontal overflow. Connect Wallet and the wordmark were fully visible. The wallet sheet was fixed from 12px to 378px and stayed on screen. The mobile menu’s 13 labels were not clipped. The logged-out page had no `pattern` input and no raw referral URL.
- The live JavaScript includes “Your name,” “Invite Friends,” “Copy Referral Link,” and the account actions My Profile, My Tokens, My Rewards, Switch Wallet, and Disconnect.
- The launchpad bundle still contains the ChatGPT artwork action. Mainnet financial operations stay paused.
- Local checks before the menu deploy: wallet discovery, display-name labels, session, auth-chain, challenge, rate-limit, and financial-pause tests passed. Twelve MetaMask registrations collapse to one Solana wallet. An Ethereum-only provider is excluded. A second Solana wallet stays listed once.
- Live on `dpl_87aJyPHrPrMxtvpjzHR2c77FHgp5`: `POST /api/wallet/fund` returned 503. Session reads for a signed-out visitor returned 401. The live script still builds `Chain ID: mainnet`. At 1920px the header menu is `gp-wallet-dropdown`, 300px wide, right-aligned with Connect Wallet, and inside the viewport. Its choices are Phantom, Solflare, Backpack, and More Wallets. More Wallets says no other Solana wallet is installed in a browser without an extension. At 390px the menu is a body-portaled `gp-wallet-sheet` from 12px to 378px and stays on screen. The wordmark and Connect Wallet do not overlap. This was browser emulation, not a physical phone.

## 4. In-progress features and files

https://garmonpay.com/solana/create is live. Create Coin asks for a name, ticker, description, optional image, and optional social links, with optional AI suggestions. Launch creates a normal Solana mint, builds a real Devnet LaunchLab `initializeV2` transaction, shows the cost, and asks Phantom to sign. The mint key stays in the encrypted server cookie and is not sent to the browser. The server submits only to `https://api.devnet.solana.com`. Success is shown only after Devnet finalizes the mint account, then the page opens `/solana/token/{mint}`. Confirmed coins appear on the public launchpad and My Coins with the Devnet block time, age, bonding-curve status, curve chart, and on-chain activity.

Fresh Start Fox (FOXNEW) is the only consumed coin. Mint `9myr1ZKYAAxvyXf8UmWwyeGmotXEakbVpAWEAZh4Be2e`. Creator `HLQyS1fLfboSvY5jwQwmpk394QfZhuWMZWmGZ2Bj7QUE`. Launch transaction `53fEomSkuEzbiMXPJhS3ijcMLzUtwc9dZnGVn8ZnXrsVVRDbm9FjhoD1Ntd7fgAgkktHNtsqcMqsJLnDzstsoB7N`. Devnet block time is exactly `2026-10-14T21:17:19.000Z`. LaunchLab pool `CtxexD2mKYkVoVZiNsLLJrSN3P1rEnD6QMkxHxMzbEmP` is status 2 on platform `5ruSwxF3qUdMpiDPPSXus2RJc82n6Jmxcf4UuPehGVNF`. On-chain LaunchLab fees remain platform 12000, creator 3000, protocol 2500. `realA` equals `totalSellA` at 7931000000000. `realB` is 999999 of the 1000000 lamport target. No stored artwork, so the page shows a FOX monogram and says no artwork was stored. The finishing buy is `42K5ZbpQpRZNgVpucDXu9ejsAwMXXakhYG9b2jM4RoYNTvcVX7vAsQD1v5z9zCMKMhGUB9DyKWpk1NvYAkyUbeRd`. Migration is `4AV8ihSgAJeuy4CsWHqz952uuPeGyY3PwPLWYox4RUcJyi5wkZca9a1u1ewcLwWRCRR71NHCGdg6wWQKnePWFzsr`, with logs `MigrateToCpswap`, `InitializeWithPermission`, and `LockCpLiquidity`. The Devnet CPMM pool is `rKDtk4T7gA1HBQfuoPetifrFUUtv4rVHGaUtJSXi97h`. The other mint order, `HejSXEvJkRE99Fb7b3PRvtyc8PfRR3rFR3KH57e8UoUk`, is empty. Config `7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt` names migrate wallet `DRayP1Yav394wpS47WQJ5Qm6d95WTQFtGGh54cVQFmhF`. Platform CPMM config is `5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy`. The vanity worker stays stopped. The registry SQL was not executed. Both member profiles remain.

The owner still needs to save `HolyGhost` on the iPhone, try Share, and open the connected-wallet sheet with the keyboard. Browser emulation is not that device check.

## 5. Production and staging

Mainnet trading, withdrawals, deposits, and payouts stay disabled. `walletAuthentication` is true. `tokenLaunches` stays false. The Devnet Create Coin route is a separate reviewed exception and submits only to Devnet.

Production Supabase `zfnwypoxggqpairmwnja` now has `display_name` and `referral_slug` on `gp_sol_members`. `wallet_public` defaults to false for new rows. The two members that already existed stayed public. `gp_sol_member_save` now takes the optional display name. Anon and authenticated cannot execute the member functions. Service role can. Staging on `127.0.0.1:4327` was left stopped.

## 6. Known bugs and external blockers

- Vanity mint generation is retired. `scripts/vanity/inventory-worker.mjs` exits immediately. New coins use `Keypair.generate()` at Launch. Confirmed launches stay in `gp_sol_mint_inventory`. Unused vanity rows are cancelled, not deleted. A signed-out mint start returns 401. `POST /api/wallet/fund` stays 503. `GARMONPAY_VANITY_WORKER` and `GARMONPAY_MINT_WORKER_URL` are not set. The registry SQL was not executed.
- Token creation still needs one Phantom signature. Graduation is signed by Raydium’s Devnet migrate wallet `DRayP1Yav394wpS47WQJ5Qm6d95WTQFtGGh54cVQFmhF`, not by the GarmonPay admin.
- Artwork is stored by GarmonPay, not on an immutable metadata host. A Devnet test can still record a metadata URL. That does not make the artwork permanent.
- The two existing member profiles still show a wallet address because that visibility was already on. Each member can turn off “Show my wallet address publicly” and save. Do not flip those rows from the database.
- Android, Solflare, and Backpack device sign-in remain unproven.
- FOXNEW buy `244Vx5Jg…` finalized and did not migrate the pool. The instruction is LaunchLab `BuyExactIn` with amount 17688 lamports and minimum out 36075330352. The logs contain no migrate instruction and no CPMM program. Pool status stayed 0 because 310 lamports and 638.566893 tokens are still unsold. Raydium accepts `MigrateToCpswap` only after status is 1, and only from `DRayP1Yav394wpS47WQJ5Qm6d95WTQFtGGh54cVQFmhF`. This SDK cannot build that instruction, and the admin wallet would be rejected. A simulated completing buy of 315 lamports, not submitted, buys the last 638566893 raw tokens, fees 4/1/1, price impact 0.04%, and leaves the simulated pool at status 1 with both CPMM accounts empty. `POST /api/wallet/fund` still returns 503. After status 2, trades use the Devnet CPMM program only when that pool account exists. No live graduation or post-graduation trade has been signed. Mainnet trading stays off.

## 7. Financial features that must remain disabled

Mainnet trading, custody, deposits, withdrawals, advertising funding, token rewards, referral payouts, and paid games stay off. Devnet test-coin creation can be signed by the connected wallet and cannot target Mainnet. Wallet sign-in does not authorize those paused actions. Referral counts are attribution only. GarmonPay does not pay for member image generation.

## 8. Next specific task

FOXNEW trades now route only through Devnet CPMM pool `rKDtk4T7gA1HBQfuoPetifrFUUtv4rVHGaUtJSXi97h`. A simulated buy of 10000 lamports quotes 20383375524 raw FOXNEW, minimum 20179541768 at 1% slippage, and uses the Devnet CPMM program. A simulated sell of 10000000000 raw FOXNEW quotes 4786 lamports, minimum 4738. Neither was signed or broadcast. The admin wallet read showed 468424061 lamports and 7931000000000 raw FOXNEW. Raydium’s migrate transaction `4AV8ihSgAJeuy4CsWHqz952uuPeGyY3PwPLWYox4RUcJyi5wkZca9a1u1ewcLwWRCRR71NHCGdg6wWQKnePWFzsr` is labeled Liquidity Migration. The displayed price is the CPMM reserve quote, 0.000000000483 SOL per token, with 999999 lamports of pool liquidity. There are no confirmed CPMM trades yet, so no price history or candlesticks are drawn. The next step is the owner’s Phantom approval of a small CPMM buy and a small CPMM sell, then a finalized read of each signature. Do not approve the pending registry SQL. Do not set `GARMONPAY_VANITY_WORKER` or `GARMONPAY_MINT_WORKER_URL`. Do not enable mainnet. Do not restart the vanity worker.

## 9. How to resume

1. Read this file, then check `git status` and `git rev-parse --short HEAD`.
2. Preserve the dirty tree. Do not commit or push unless the user asks.
3. Leave staging on port 4327 alone. It was stopped and should not be restarted unless asked.
4. Do not print, store, or return a mint, admin, or API secret.
5. Do not set the vanity worker or the broad launch flag on Vercel.
6. The platform account was confirmed by a finalized Devnet read. Do not claim a token mint until a finalized Devnet read shows the mint account. A gpay suffix is not required.
7. Do not add an OpenAI image key or call a paid image API for member artwork.
8. Do not change the existing members’ wallet-visibility setting.
9. Update this file before stopping.
