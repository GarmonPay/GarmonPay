# Phantom and Blowfish domain review — draft, not submitted

Status: prepared for the owner. Do not email this, open a pull request, or ask a user to continue past Phantom’s warning until the owner approves a submission.

Proposed recipients, only after approval:

- review@phantom.com
- review@blowfish.xyz
- Optional public allowlist request: https://github.com/phantom/blocklist

## Subject

Domain review for https://garmonpay.com — “Request blocked — This dApp could be malicious”

## What the user sees

On mobile, Phantom shows “Request blocked — This dApp could be malicious” for garmonpay.com. GarmonPay does not tell users to proceed. The site tells them to stop, because GarmonPay cannot override Phantom’s warning.

## Domain and origin

- Production origin: `https://garmonpay.com`
- Host: Vercel. A direct request returns that host with no redirect to another origin.
- Public Phantom lists checked on October 14, 2026: `blocklist.yaml`, `whitelist.yaml`, and `fuzzylist.yaml` in https://github.com/phantom/blocklist. None contain `garmonpay` or `garmonpay.com`. The `*.vercel.app` allowlist entry does not cover this domain.
- Mobile connect uses `https://phantom.com/ul/v1/connect` with `app_url` and `redirect_link` set from `window.location.origin`. On production that origin is `https://garmonpay.com`.
- Mobile browse uses `https://phantom.com/ul/browse/` and refuses the link unless the page origin and the app origin are the same. The `ref` parameter is that origin.
- Sign-in uses `https://phantom.com/ul/v1/signMessage`. The encrypted payload is a UTF-8 sign-in message, not a transaction.

## Wallet authentication

Sign-in proves ownership of a Solana address. The message is:

```text
GarmonPay.com wants you to prove you own this wallet:
{wallet}

https://garmonpay.com

Nonce: {nonce}
Issued At: {time}
Expiration Time: {time}
Network: {mainnet|devnet|testnet}

This does not authorize a transaction or transfer.
```

The default message network is `mainnet`. Phantom’s mobile connect link then asks for cluster `mainnet-beta`, which is the cluster name for that same sign-in network. The iPhone path uses the word `mainnet` because Phantom’s sign-in allowlist rejected `solana:mainnet`. The user can choose Devnet or Testnet in the sign-in control. That choice changes only the sign-in message and the connect cluster.

The server session stores the wallet address and an expiry. It does not store a cluster. Devnet trades ignore the sign-in network. They are built and simulated only against `https://api.devnet.solana.com`, and the Devnet genesis hash is checked before a balance read. A Devnet blockhash cannot confirm on Mainnet. Mainnet trading, deposits, withdrawals, custody, token launches, and payouts stay disabled.

The sign-in screen says this choice is only for the sign-in message, that it does not move SOL, and that Devnet trades are built for Devnet only.

## Unsigned transaction analysis

Graduated Devnet trades use one `signTransaction` call, not `signAllTransactions`. The builder’s instructions are:

1. Compute budget limit 400,000 and price 0.
2. Idempotent creation of the payer’s own token account and wrapped-SOL account.
3. On a buy only, a system transfer of the exact spend into the payer’s own wrapped-SOL account, then sync native.
4. One swap on the Devnet CPMM program `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb`.
5. Close the wrapped-SOL account back to the payer.

The payer is the only signer. The builder rejects the Mainnet CPMM program `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` and both LaunchLab programs. There is no approve, no authority change, and no transfer to a third party.

An earlier unsigned Devnet buy of 0.00001 SOL for FOXNEW (`9myr1ZKYAAxvyXf8UmWwyeGmotXEakbVpAWEAZh4Be2e`) was simulated and matched that instruction list. It was not signed or broadcast. Its price impact was 5.02%. The current safety rule blocks every trade at 5.00% or more, including that minimum buy, so GarmonPay no longer returns that order.

An unsigned sell of 100 FOXNEW still builds under the 5% limit. It uses the same program set, the same single signer, and closes wrapped SOL to the payer. It was not signed or broadcast. The admin wallet’s FOXNEW balance is 0, so that sell cannot be executed from that wallet.

## Request

Please review `garmonpay.com` as a false-positive domain block on the connection request. We are not asking Phantom or Blowfish to weaken a transaction warning, and we are not asking users to bypass the block.

## What this draft does not do

This file is not an email and not a GitHub pull request. No message has been sent.
