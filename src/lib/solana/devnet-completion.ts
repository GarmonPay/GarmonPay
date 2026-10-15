import { PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DEV_LAUNCHPAD_PROGRAM, LaunchpadPool, getPdaMetadataKey } from "@raydium-io/raydium-sdk-v2";
import { validateTokenMetadata } from "./token-metadata";
import { CLUSTER_GENESIS } from "./platform-setup";
import { afterDevnetBroadcast } from "./devnet-submission";
import { DevnetBlockhashError, sendExactSignedTransaction } from "./devnet-blockhash";
import { assertSignedDevnetLaunch, buildDevnetLaunchTransaction, DEVNET_TEST_SUPPLY, readDevnetLaunchContext } from "./devnet-coin";
export function devnetLaunchNotSent(code: string) {
  return code === "BLOCKHASH_EXPIRED" || code === "SIMULATION_FAILED" || code === "NOT_SUBMITTED";
}
function blockhashHeight(body: Record<string, unknown>) {
 const height = body.lastValidBlockHeight;
 if (typeof height !== "number" || !Number.isSafeInteger(height) || height < 0) throw new DevnetBlockhashError("Devnet blockhash expiry is missing. Nothing was submitted.", "BLOCKHASH_REJECTED");
 return height;
}
export async function submitLaunch(body: Record<string, unknown>, payer: string, transaction: string) {
  const metadata = validateTokenMetadata(body);
  const mint = typeof body.mint === "string" ? body.mint : "";
  const uri = typeof body.uri === "string" ? body.uri : "";
  const context = await readDevnetLaunchContext(payer);
  const genesis = await context.connection.getGenesisHash();
  if (genesis !== CLUSTER_GENESIS.devnet) throw new Error("RPC is not Solana devnet");
  if (!context.platformExists) throw new Error("The Devnet platform account is not confirmed yet");
  let built: ReturnType<typeof buildDevnetLaunchTransaction>;
  let height: number;
  try {
    const candidate = Transaction.from(Buffer.from(transaction, "base64"));
    if (!candidate.recentBlockhash) throw new Error("Devnet blockhash is required");
    built = buildDevnetLaunchTransaction({
      payer, mint, blockhash: candidate.recentBlockhash, name: metadata.name, symbol: metadata.symbol, uri, configData: context.configData,
    });
    assertSignedDevnetLaunch(transaction, built.transaction, new PublicKey(payer), new PublicKey(mint));
    height = blockhashHeight(body);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    const message = error instanceof Error ? error.message : "Devnet token creation did not finish";
    throw Object.assign(new Error(message), { code: "NOT_SUBMITTED" });
  }
  const gate = await sendExactSignedTransaction(context.connection, transaction, height);
  const before = context.balance;
  const signature = gate.signature;
  return afterDevnetBroadcast(signature, async () => {
  const confirmation = await context.connection.confirmTransaction({ signature, blockhash: gate.blockhash, lastValidBlockHeight: gate.lastValidBlockHeight }, "finalized");
  if (confirmation.value.err) throw new Error("Devnet rejected the token transaction");
  const status = await context.connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
  const chain = status.value[0];
  if (!chain || chain.err || chain.confirmationStatus !== "finalized") throw new Error("Devnet did not finalize the token transaction");
  const mintAccount = await context.connection.getAccountInfo(new PublicKey(mint), "finalized");
  if (!mintAccount || !mintAccount.owner.equals(TOKEN_PROGRAM_ID)) throw new Error("The mint account was not confirmed");
  const parsed = await context.connection.getParsedAccountInfo(new PublicKey(mint), "finalized");
  const info = parsed.value && "parsed" in parsed.value.data ? parsed.value.data.parsed.info : null;
  if (!info || info.decimals !== 6 || info.supply !== DEVNET_TEST_SUPPLY.toString()) throw new Error("Finalized mint supply or decimals do not match this launch");
  const poolAccount = await context.connection.getAccountInfo(new PublicKey(built.pool), "finalized");
  if (!poolAccount || !poolAccount.owner.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("Finalized LaunchLab pool is missing");
  const pool = LaunchpadPool.decode(poolAccount.data);
  if (!pool.mintA.equals(new PublicKey(mint)) || !pool.platformId.equals(context.platformId) || !pool.creator.equals(new PublicKey(payer)) || pool.supply.toString() !== DEVNET_TEST_SUPPLY.toString()) throw new Error("Finalized LaunchLab pool does not match this creator and mint");
  const metadataAccount = await context.connection.getAccountInfo(getPdaMetadataKey(new PublicKey(mint)).publicKey, "finalized");
  if (!metadataAccount || !metadataAccount.owner.equals(new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"))) throw new Error("Finalized token metadata is missing");
  const metadataBytes = metadataAccount ? Buffer.from(metadataAccount.data).toString("utf8") : "";
  const after = await context.connection.getBalance(new PublicKey(payer), "finalized");
  if (!metadataBytes.includes(metadata.name)) throw new Error("On-chain token details do not match this coin");
  let launchedAt: string | null = null;
  try {
    const recorded = await context.connection.getTransaction(signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
    if (recorded?.blockTime) launchedAt = new Date(recorded.blockTime * 1000).toISOString();
  } catch { launchedAt = null; }
  return {
    submitted: true as const,
    confirmed: true as const,
    cluster: "devnet" as const,
    kind: "launch" as const,
    signature,
    mint,
    pool: built.pool,
    platformId: context.platformId.toBase58(),
    curveType: "virtual_constant_product",
    name: metadata.name,
    symbol: metadata.symbol,
    network: "Solana Devnet",
    confirmationStatus: "finalized" as const,
    decimals: info?.decimals ?? null,
    metadataUri: uri,
    metadataStored: metadataBytes.includes(metadata.name),
    payerLamportsBefore: before,
    payerLamportsAfter: after,
    lamportsSpent: before - after,
    launchedAt,
    explorerTransaction: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    explorerMint: `https://explorer.solana.com/address/${mint}?cluster=devnet`,
  };
  });
}
