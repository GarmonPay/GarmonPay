import { Connection } from "@solana/web3.js";
import { DEV_LAUNCHPAD_PROGRAM, PlatformConfig } from "@raydium-io/raydium-sdk-v2";
import { DEVNET_CPMM_CONFIG, DEVNET_RPC } from "./launchlab-flow";
import { CLUSTER_GENESIS, authorizedPlatformWallets, garmonPlatformId, verifyPlatformRecord } from "./platform-setup";
import { assertSignedPlatformTransaction } from "./platform-transaction";
import { afterDevnetBroadcast } from "./devnet-submission";
import { sendExactSignedTransaction } from "./devnet-blockhash";

function platformName(bytes: number[]) {
  const end = bytes.indexOf(0);
  return Buffer.from(end < 0 ? bytes : bytes.slice(0, end)).toString("utf8");
}

export async function submitSignedPlatformTransaction(serialized: string, lastValidBlockHeight: number) {
  const wallets = authorizedPlatformWallets();
  const signed = assertSignedPlatformTransaction(serialized, wallets);
  const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const genesis = await connection.getGenesisHash();
  if (genesis !== CLUSTER_GENESIS.devnet) throw new Error("RPC is not Solana devnet");
  const gate = await sendExactSignedTransaction(connection, serialized, lastValidBlockHeight);
  const platformId = garmonPlatformId(wallets.admin, "devnet");
  const signature = gate.signature;
  return afterDevnetBroadcast(signature, async () => {
  const confirmation = await connection.confirmTransaction({ signature, blockhash: gate.blockhash, lastValidBlockHeight: gate.lastValidBlockHeight }, "finalized");
  if (confirmation.value.err) throw new Error("Devnet rejected the platform transaction");
  const account = await connection.getAccountInfo(platformId, "finalized");
  if (!account || !account.owner.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("Platform account was not confirmed");
  const platform = PlatformConfig.decode(account.data);
  const record = verifyPlatformRecord({
    platformId: platformId.toBase58(),
    admin: wallets.admin.toBase58(),
    feeWallet: platform.platformClaimFeeWallet.toBase58(),
    nftWallet: platform.platformLockNftWallet.toBase58(),
    vestingWallet: platform.platformVestingWallet.toBase58(),
    feeRate: platform.feeRate.toString(),
    creatorFeeRate: platform.creatorFeeRate.toString(),
    platformScale: platform.platformScale.toString(),
    creatorScale: platform.creatorScale.toString(),
    burnScale: platform.burnScale.toString(),
    cpConfigId: platform.cpConfigId.toBase58(),
    expectedCpConfigId: DEVNET_CPMM_CONFIG.toBase58(),
    name: platformName(platform.name),
    platformCpCreator: platform.platformCpCreator.toBase58(),
  });
  if (platform.feeRate.toString() !== "12000" || platform.creatorFeeRate.toString() !== "3000") {
    throw new Error("Confirmed fee rates do not match the approved split");
  }
  return {
    submitted: true as const,
    confirmed: true as const,
    platformExists: true as const,
    signature,
    platformId: platformId.toBase58(),
    feeRate: platform.feeRate.toString(),
    creatorFeeRate: platform.creatorFeeRate.toString(),
    creatorScale: platform.creatorScale.toString(),
    feeWallet: platform.platformClaimFeeWallet.toBase58(),
    nftWallet: platform.platformLockNftWallet.toBase58(),
    vestingWallet: platform.platformVestingWallet.toBase58(),
    cpmmCreatorRedirected: record.cpmmCreatorRedirected,
  };
  });
}
