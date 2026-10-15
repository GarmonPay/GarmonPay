# Raydium LaunchLab integration verification

Checked October 11, 2026 against official documentation and the pinned `@raydium-io/raydium-sdk-v2@0.2.74-alpha` package's type/layout declarations.

- `createLaunchpad` accepts `mintA` and `extraSigners`; an externally generated unique mint keypair is supported. This permits a vanity suffix in principle. It does not establish a safe generation/storage service. No mint keypair, seed or secret has been generated, exposed or reused in this work.
- Virtual constant-product is curve type 0. The quote mint is part of the bound GlobalConfig, rather than an invented create argument. GarmonPay must require wrapped native SOL, never default USDC.
- Fees have a million-unit denominator. GlobalConfig `tradeFeeRate`, PlatformConfig `feeRate` and `creatorFeeRate` are distinct components applied in supported curve trades. Desired 0.60% platform = 6,000; 0.40% creator = 4,000; desired total 1% = 10,000. Any positive protocol component above those two shares makes the all-in total exceed 1%; this is a configuration blocker, not permission to change economics.
- Creator curve fees accrue in a creator/quote-mint vault. `claimCreatorFee` and platform fee claim builders exist. Native SOL accounting must distinguish wrapped SOL token accounts from native SOL transfers and disclose required unwrapping/account/network costs.
- Graduation is performed by configured Raydium migration signers. There is no permissionless `graduate` method to invent. Observe confirmed lifecycle/account transitions and switch to the verified destination pool.
- Post-graduation CPMM creator fees and locked-LP Fee Key revenue are separate mechanisms. Current docs describe platform ownership of combined locked LP after the August 17, 2026 upgrade; historical records must be read individually. LP ownership percentages are not equivalent to percentages of trading volume. The exact 60/40 split after graduation remains unverified.
- `raydium-read.ts` uses official account layouts and PDA derivation to validate account owners, SOL quote mint, virtual CPMM config and fee components. Its provenance helper requires a separately verified initialization signature plus expected creator/platform/mint; suffix alone is never sufficient. It has no signer or transaction broadcast path and is excluded from the safe production release pending SDK dependency security review.
- No official transaction builder has been activated. Token creation, swaps, creator claims, vanity mint workers and permanent post-graduation fee collection remain incomplete/gated.

Official sources:
- https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/raydium/launchpad/launchpad.ts
- https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/code-demos.mdx
- https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/platform-config.mdx
- https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/creator-fees.mdx

Before activation: pin/verify the deployed program and current IDL, inspect actual selected on-chain config values on the target cluster, resolve vulnerable SDK transitive dependencies, test against a supported disposable/devnet environment, approve any mismatch in economics, and obtain explicit launch/trading authorization.

## Master-upgrade recheck — October 11, 2026

Rechecked the official documentation linked above. This is documentation and repository verification, not verification of a selected live platform configuration, deployment authority, or transaction simulation.

The current [PlatformConfig documentation](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/platform-config.mdx) gives a platform-fee cap of 5% and a creator-fee cap of 0.50%. The proposed 0.60% and 0.40% fit those individual caps, but remain additive to the protocol component. New platform configuration requires `creator_scale = 0`; this field cannot establish the proposed post-graduation creator revenue split. Platform configuration can change fee rates and beneficiaries: disclose this authority and re-read configuration before signing.

The [GlobalConfig documentation](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/global-config.mdx) identifies constant product as curve type 0 and binds the quote mint and protocol fees to the selected config. Graduation requires the configured migration signer; new launches use CPMM. Protocol configuration is administratively mutable. A previously read fee quote must not be treated as an immutable guarantee.

The [creator-fee documentation](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/creator-fees.mdx) separates curve creator vaults, CPMM creator counters, and platform Fee Key revenue. `platform_cp_creator` can replace the original creator as CPMM beneficiary. Consequently a perpetual 60/40 platform/creator split has not been established and must not be advertised as implemented.

Closest supported direction: use verified SOL constant-product configuration, preserve the requested platform/creator curve components only if the user approves the resulting all-in protocol-inclusive rate, and separately disclose actual CPMM and Fee Key beneficiaries. If the 1% total remains mandatory, block activation until a compatible approved config is proven. Do not silently reduce either commercial share or invent a redistribution contract.

The [official builder example](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/code-demos.mdx) accepts an external mint signer and may return multiple sequential transactions. Its sample contains a legacy `migrateType: "amm"` value while current GlobalConfig documentation requires CPMM for new launches. Do not copy that sample uncritically: verify the pinned SDK instruction output against the deployed program. Vanity suffix generation remains optional and unimplemented; no browser or server may request a user's seed phrase. The 0.05 SOL launch charge is a GarmonPay target, not a verified Raydium bundled price.

### Implementation evidence and activation checklist

- `policy.ts` hardcodes wallet authentication, launches, trading, custody, payouts, and other financial features off. No environment-only activation exists.
- `launches/validate` validates metadata and returns `launchEnabled: false`, unknown infrastructure costs, and no total payable quote. It neither launches nor charges.
- `discovery` returns an empty verified-indexer pending state while wallet authentication is disabled; it does not fabricate market metrics.
- `raydium-read.ts` is a read-only adapter, not a production indexer or transaction engine. Its tests cannot prove deployed layout compatibility or real economics.
- Before building execution: verify account discriminators/layouts, cluster/program/config allowlists, mint authorities, quote token, immutable quote expiry, token extensions, signer set, instruction destinations, slippage and maximum spend, compute/network/rent charges, and simulation results.
- Before activation: test partial multi-transaction failure/recovery, expired blockhashes, duplicate submissions, finalized reconciliation, reorg handling, mismatched creator/platform accounts, fee changes between quote and signature, and graduation transition. Require separate explicit authorization.

No on-chain config, keys, funds, launches, trades, or production permissions changed during this recheck.

### Synthetic staging safeguards added

`src/lib/solana/launch-config.ts` provides provider-neutral arithmetic and cost-preview review without importing the Raydium SDK, RPC, a signer, or a broadcast client. It checks the exact existing commercial shares against the protocol-inclusive total, rejects additional creator-claim charges and unsupported currencies/curves, and refuses to infer post-graduation compatibility from bonding-curve fees.

Cost previews require explicit launch, network, protocol, account-rent and initial-buy amounts (zero is explicit), exact integer conservation, matching cluster/mint/creator/platform/config bindings, and an unexpired maximum 60-second validity window. Unknown cost components, partial amounts and changed launch charges are rejected. This 60-second window is a conservative local preview rule, not a Raydium protocol guarantee.

`reviewLaunchIntent` combines existing metadata validation with these reviews and always returns `launchEnabled: false`, requiring on-chain verification and simulation. No live route is wired to manufacture a quote: `/api/solana/launches/validate` still returns unknown infrastructure costs and no payable total. Input compatibility does not attest to deployed config authenticity, destination safety, complete transaction instructions, simulation success or authorization. Tests use only synthetic identifiers and values; no real transaction simulation was performed.

## Live list sample — October 13, 2026

Read-only check of `GET https://launch-mint-v1.raydium.io/get/list?sort=new&size=50` and the documented `GET /get/by/mints` detail route. No creation, signature, or `ray-token` call was made.

The newest page of 50 rows did not contain the proposed platform `feeRate` 6000 with creator `feeRate` 4000. The most common reported combination was protocol `tradeFeeRate` 2500, platform `feeRate` 10000, and creator `feeRate` 0, with `creatorScale` 0 and `cpmmCreatorFeeOn` 0. Other rows used higher platform rates, including the documented 5% platform cap paired with the 0.50% creator cap. None of those observations is a selected GarmonPay platform config, and none authorizes launches or the 1% / 0.60% / 0.40% advertisement.

`/api/solana/discovery` remains the paused GarmonPay provenance directory. `/api/solana/discovery/raydium` is a separate external directory and does not mark those rows as GarmonPay launches or tradable markets.

## Devnet execution attempt — October 13, 2026

A local four-worker search found one mint ending in `gpay` after 4,793,149 attempts. The secret was kept in process memory and was not written to the result file. `getAccountInfo` on devnet then showed that mint account does not exist.

The devnet SOL constant-product config account decoded with curve type 0 and protocol `tradeFeeRate` 2500. The public faucet returned HTTP 429 again on the later platform attempt, so no separate admin, fee, NFT, or vesting platform was created and no initialize, buy, or sell transaction was broadcast. The installed SDK is `@raydium-io/raydium-sdk-v2@0.2.74-alpha`, the same version npm publishes as latest. Raydium's default platform id is rejected. A durable GarmonPay platform still needs four distinct public wallet addresses and an admin signature. Details are in `docs/solana/launchlab-devnet-result.json`. Mainnet submission remains disabled.

