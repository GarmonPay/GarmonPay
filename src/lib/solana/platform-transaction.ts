import { ComputeBudgetProgram, PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { DEV_LAUNCHPAD_PROGRAM, createPlatformConfig } from "@raydium-io/raydium-sdk-v2";
import { DEVNET_CPMM_CONFIG } from "./launchlab-flow";
import { PLATFORM_WALLET_ENV, PlatformWallets, assertDistinctPlatformWallets, garmonPlatformId, platformFeePlan, readPlatformWallets } from "./platform-setup";
import { devnetPlatformSubmitAllowed } from "./devnet-guard";

export { devnetPlatformSubmitAllowed };

function publicAddress(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be a public address`);
  const address = value.trim();
  if (!address || address.length > 44 || address.startsWith("[") || /\s/.test(address)) throw new Error(`${label} must be a public address`);
  try { return new PublicKey(address); } catch { throw new Error(`${label} is not a Solana address`); }
}

/** Existing environment wallets win. A request cannot replace them. */
export function resolvePlatformWallets(env: NodeJS.ProcessEnv, body: Record<string, unknown> = {}) {
  const configured = readPlatformWallets(env);
  if (configured.configured) return { source: "environment" as const, wallets: configured.wallets, replaced: false as const };
  const wallets: PlatformWallets = {
    admin: publicAddress(body.admin, "Admin"),
    fee: publicAddress(body.fee, "Fee"),
    nft: publicAddress(body.nft, "NFT lock"),
    vesting: publicAddress(body.vesting, "Vesting"),
  };
  assertDistinctPlatformWallets(wallets);
  return { source: "guided-setup" as const, wallets, replaced: false as const };
}

export function buildPlatformConfigTransaction(wallets: PlatformWallets, blockhash: string, rentLamports: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(blockhash)) throw new Error("A devnet blockhash is required");
  if (!/^(0|[1-9][0-9]{0,12})$/.test(rentLamports)) throw new Error("Platform rent must be an integer lamport amount");
  const plan = platformFeePlan();
  const platformId = garmonPlatformId(wallets.admin, "devnet");
  const instruction = createPlatformConfig(
    DEV_LAUNCHPAD_PROGRAM,
    wallets.admin,
    wallets.fee,
    wallets.nft,
    wallets.vesting,
    platformId,
    DEVNET_CPMM_CONFIG,
    PublicKey.default,
    { platformScale: new BN(plan.platformScale), creatorScale: new BN(plan.creatorScale), burnScale: new BN(plan.burnScale) },
    new BN(plan.platform),
    new BN(plan.creator),
    "GarmonPay",
    "https://garmonpay.com",
    "https://garmonpay.com/favicon.ico",
    new BN(0),
  );
  if (!instruction.programId.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("Devnet LaunchLab program required");
  const signers = instruction.keys.filter(key => key.isSigner).map(key => key.pubkey.toBase58());
  if (signers.length !== 1 || signers[0] !== wallets.admin.toBase58()) throw new Error("Only the admin wallet can sign the platform transaction");
  // Supply an explicit, zero-price budget so Phantom does not add undisclosed fees.
  const transaction = new Transaction({ feePayer: wallets.admin, recentBlockhash: blockhash }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    instruction,
  );
  return {
    cluster: "devnet" as const,
    submitted: false as const,
    platformExists: false as const,
    platformId: platformId.toBase58(),
    programId: DEV_LAUNCHPAD_PROGRAM.toBase58(),
    feeRate: plan.platform,
    creatorFeeRate: plan.creator,
    creatorScale: plan.creatorScale,
    platformScale: plan.platformScale,
    burnScale: plan.burnScale,
    cpConfigId: DEVNET_CPMM_CONFIG.toBase58(),
    rentLamports,
    adminOwnership: "unproven" as const,
    destinationOwnership: "unproven" as const,
    requiredSigner: wallets.admin.toBase58(),
    feeWallet: wallets.fee.toBase58(),
    nftWallet: wallets.nft.toBase58(),
    vestingWallet: wallets.vesting.toBase58(),
    accounts: instruction.keys.map(key => ({ address: key.pubkey.toBase58(), signer: key.isSigner, writable: key.isWritable })),
    unsignedTransaction: Buffer.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
    blockhash,
    envNames: PLATFORM_WALLET_ENV,
  };
}

export function assertSignedPlatformTransaction(serialized: string, wallets: PlatformWallets) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(serialized) || serialized.length > 2000) throw new Error("Signed transaction is invalid");
  const signed = Transaction.from(Buffer.from(serialized, "base64"));
  console.info("[garmonpay-launch]", JSON.stringify({ stage: "platform-validation", cluster: "devnet", instructionCount: signed.instructions.length, computeBudgetCount: signed.instructions.filter(instruction => instruction.programId.equals(ComputeBudgetProgram.programId)).length }));
  if (!signed.recentBlockhash || ![1, 3].includes(signed.instructions.length)) throw new Error("Platform transaction shape is invalid: expected LaunchLab setup and the reviewed compute budget");
  const expected = Transaction.from(Buffer.from(buildPlatformConfigTransaction(wallets, signed.recentBlockhash, "1").unsignedTransaction, "base64"));
  // Keep unexpired legacy one-instruction requests valid; never accept arbitrary additions.
  if (signed.instructions.length === 1) expected.instructions = expected.instructions.slice(2);
  const actual = signed.instructions.at(-1)!;
  const wanted = expected.instructions.at(-1)!;
  if (!actual.programId.equals(DEV_LAUNCHPAD_PROGRAM) || !actual.data.equals(wanted.data) || actual.keys.length !== wanted.keys.length) {
    throw new Error("Platform instruction does not match the approved configuration");
  }
  if (!signed.serializeMessage().equals(expected.serializeMessage())) throw new Error("Platform transaction changed: compute budget, accounts, fee payer or instruction order differs from the reviewed configuration");
  for (let index = 0; index < actual.keys.length; index += 1) {
    const left = actual.keys[index];
    const right = wanted.keys[index];
    if (!left.pubkey.equals(right.pubkey) || left.isSigner !== right.isSigner || left.isWritable !== right.isWritable) {
      throw new Error("Platform accounts do not match the approved configuration");
    }
  }
  if (!signed.feePayer?.equals(wallets.admin) || !signed.verifySignatures()) throw new Error("The admin signature is missing or invalid");
  return signed;
}
