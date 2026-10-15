# Hybrid DeFi trust boundaries and activation requirements

Reviewed October 11, 2026. This is the proposed security contract for subsequent phases, not a claim that financial functionality is complete. Production financial flags remain disabled. See [Raydium verification](./raydium-verification.md) and [phase report](./phase-report.md).

## User wallet and application identity

The wallet retains user private keys and approves specific transactions. The application must never collect seed phrases. Wallet connection identifies an address; authentication additionally requires a server nonce, verified signature, expiration, domain/origin binding and atomic single-use consumption. An authenticated session grants application access, not authority to sign transactions or prove receipt of funds. Account linking and wallet replacement require explicit ownership proofs and audit records. Logout must revoke server sessions.

The existing challenge/session architecture is gated. Mobile adapter compatibility, durable abuse limits, replay concurrency, session revocation and account-linking tests remain activation prerequisites.

## Application server and database

Public clients receive only approved public records or their authorized personal records under RLS. The server-side service role bypasses RLS and is a privileged boundary: keep it server-only, restrict reachable operations with server authorization, and treat every request input as untrusted. An administrative screen is not authorization. Administrators need independently checked role/status, strong authentication, narrowly scoped changes and audit logging.

Database balances, GPC, reward eligibility and pending commission records are off-chain liabilities or application records. They do not prove transferable SOL or token ownership. No conversion can be implied by an interface. Production balances must not be used as synthetic test fixtures or modified to test migration.

The 134-table unused-privilege proposal remains unapplied. Review each table and role, dependencies, catalog access and trusted server impact; prepare focused changes and exact rollback, then obtain explicit production approval. Do not weaken an existing policy to make a feature work.

## Solana, Raydium and RPC

Settlement, token accounts and liquidity belong to on-chain programs. The server prepares an intent; the wallet authorizes a verified transaction. Validate programs, addresses, quote mint, amounts, fees, slippage, signer set and allowed instructions before presenting or broadcasting it. RPC responses and third-party indexers are external observations: verify ownership/provenance, freshness and finality. Discovery needs defensible indexed metrics and must disclose unknown data.

Raydium protocol config, migration signer, platform config admin, fee wallets, CPMM creator beneficiary and Fee Key holder are distinct authorities. Inventory actual addresses and their rotation/upgrade powers before activation. Token mint/freeze and Token-2022 extension authorities also require explicit inspection. A noncustodial wallet does not remove these protocol and platform trust assumptions. No permanent creator split is currently verified.

## Advertising, rewards and reconciliation

Advertising is separate from trading. A crypto payment receives credit only after the server verifies the expected recipient, mint, amount, instruction context and finality. Enforce uniqueness by chain transaction identity plus operation; reconciliation must recover partial failures without double credit. USD displays require an expiring crypto quote and clear actual charge. Do not treat a submitted signature as confirmed payment.

Reward eligibility is server controlled. Completion, nonce/activity uniqueness, fraud checks and immutable accounting precede payout scheduling. Atomic ledger entries, reservations, idempotency and reversal records must replace legacy read-then-write balance mutations before activation. Referral attribution requires legitimate purchases, no self-referral, refund handling and validated campaign profitability. A payout scheduler is a privileged fund-signing boundary; treasury keys require a separately reviewed custody/signing design and explicit funding/activation approval.

## Games and independent workers

Games cannot authorize launchpad, wallet or reward transfers. Player actions require server authentication, room authorization and authoritative outcomes. Real-money play needs separate legal and security approval. The standalone fight server is a distinct deployment: a website release does not verify its live secret, endpoints or settlement pause. External payment-provider subscriptions are also outside the website pause and require independent verification.

## Local verification and release gates

Use synthetic data and local staging with no new paid hosting. Test unauthorized access, concurrency, signature replay, duplicate credits, partial failure, reversals, rollback and reconciled accounting. Simulation and a successful build do not authorize live transactions. Financial activation requires completed security/compliance review, verified worker/provider boundaries and the user's explicit authorization. Safe visual releases must retain the disabled production flags and rollback capability.
