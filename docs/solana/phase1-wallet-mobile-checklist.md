# Phase 1 wallet and mobile acceptance — prepared, not performed

Temporary staging URL: https://handed-teens-shortcuts-kent.trycloudflare.com/solana/members. This is a Cloudflare quick tunnel on this computer, not permanent hosting. It uses staging Supabase `bhxheuaoofiklsaurqlu`. Do not use production `zfnwypoxggqpairmwnja`. Do not enter a seed phrase. Report device, OS, wallet name and version, and pass or fail only.

One Phantom approval in desktop Chrome created staging member `m_2f87a07eef904ebe89ad` at 10:05 PM. The sign-in message named this staging host, showed the selected address, included a nonce and a five-minute expiry, and said it does not authorize a transaction or transfer. Rejection, profile and photo save, disconnect, reconnect, account switching, a second account, and referrals were not observed for that wallet. Solflare and physical phones were not used. Browser emulation is not device acceptance. Evidence: `docs/solana/phase1-phantom-manual.json`.

## Desktop wallet

Use two wallets that have never signed in to staging. Repeat the whole list with Phantom, then with Solflare.

1. Open the staging URL in the desktop browser where that wallet extension is installed. Choose the wallet and press Connect & sign in.
2. If the extension is missing, the page must say to open the wallet browser or install the extension, and no profile is created.
3. Approve only the sign-in message. Confirm it names `handed-teens-shortcuts-kent.trycloudflare.com`, shows the selected address, includes a nonce and a five-minute expiry, and says it does not authorize a transaction or transfer. Reject one prompt and confirm no profile is created.
4. After approval, save a unique username, biography, and a PNG, JPEG, or WebP photo. Reload. Sign out with Disconnect, then connect the same wallet again. The same member and referral link must remain.
5. With the second wallet, reject a duplicate username and confirm it cannot edit the first profile. Open the first wallet's unsaved profile in another tab, switch accounts, and confirm the stale save is rejected.
6. Hide the first wallet. From the second account and from a signed-out window, the public profile must not show the address. Search, follow, follow again, and unfollow.
7. Use the first wallet's referral link for a third wallet that has never registered. Only that first signup increases the count. Signing in again must not.

## iPhone and Android

On an iPhone or Android phone, open the staging Members page in Safari. Choose Phantom and press Connect & sign in. The page should say it is opening Phantom, and Phantom should show this same page. Sign-in then continues inside Phantom: the button should change to Connecting and Phantom should ask you to approve the sign-in. Opening the page is not a completed sign-in. The message must say it does not authorize a transaction or transfer. A missing sign-in must not be described as a member-profile failure. If the app is not installed, use the Install link. Reject one prompt and confirm no new member appears. Then approve. A resized desktop browser does not count. Do not mark this passed until the physical phone signs in.

Inside each wallet's own browser, the page connects with the injected wallet. Repeat the profile, photo, privacy, follow, and referral checks there. On each device, choose a photo from the phone, save, reload, replace it, remove it, and reload again. Then try a file that is not a PNG, JPEG, or WebP and confirm the saved profile stays unchanged. Check that the form, search box, and profile text fit the screen without sideways scrolling.

## Already verified without a wallet app

Generated Ed25519 signatures, profile and photo persistence, search, follows, privacy, referrals, and sign-out recovery passed against this staging server. Those results do not complete this checklist.
