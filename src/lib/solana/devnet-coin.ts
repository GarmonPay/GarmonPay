import { ComputeBudgetProgram, Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  CpmmCreatorFeeOn, DEV_LAUNCHPAD_PROGRAM, LAUNCHPAD_PROGRAM, LaunchpadConfig, LaunchpadPool,
  PlatformConfig, Curve, getPdaLaunchpadAuth, getPdaLaunchpadPoolId, getPdaLaunchpadVaultId, getPdaMetadataKey, initializeV2,
} from "@raydium-io/raydium-sdk-v2";
import { DEVNET_RPC, DEVNET_SOL_CONFIG, assertLaunchInstructions } from "./launchlab-flow";
import { CLUSTER_GENESIS, authorizedPlatformWallets, garmonPlatformId } from "./platform-setup";
import { buildPlatformConfigTransaction } from "./platform-transaction";
import { authOrigin } from "./auth-crypto";

const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");

/** Devnet test curve. These amounts passed the live Devnet config check. */
export const DEVNET_TEST_SUPPLY = new BN("10000000000000");
export const DEVNET_TEST_SELL = new BN("7931000000000");
export const DEVNET_TEST_RAISE = new BN(1_000_000);

export function devnetCoinStep(platformExists: boolean, payer: string) {
  const admin = authorizedPlatformWallets().admin.toBase58();
  if (platformExists) return "mint" as const;
  if (payer === admin) return "platform" as const;
  throw new Error("The Devnet LaunchLab platform has not been created. The admin wallet must sign that transaction before a token can be launched.");
}

export function assertDevnetCluster(cluster: string) {
  if (cluster !== "devnet") throw new Error("Only Solana Devnet can create this test token");
}

export function metadataUri(draftId: string) {
  if (!/^[a-f0-9]{32}$/.test(draftId)) throw new Error("Token metadata id is invalid");
  const uri = `${authOrigin()}/api/solana/token-meta/${draftId}`;
  if (uri.length > 200) throw new Error("Token metadata address is too long");
  return uri;
}

export function buildDevnetLaunchTransaction(input: {
  payer: string;
  mint: string;
  blockhash: string;
  name: string;
  symbol: string;
  uri: string;
  configData: Uint8Array;
}) {
  assertDevnetCluster("devnet");
  try { new PublicKey(input.mint); } catch { throw new Error("The mint address is invalid"); }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.blockhash)) throw new Error("A devnet blockhash is required");
  if (input.uri.length > 200 || !input.uri.startsWith(`${authOrigin()}/api/solana/token-meta/`)) throw new Error("Token metadata address is invalid");
  const payer = new PublicKey(input.payer);
  const mint = new PublicKey(input.mint);
  const config = LaunchpadConfig.decode(Buffer.from(input.configData));
  if (config.curveType !== 0 || !config.mintB.equals(WRAPPED_SOL)) throw new Error("Devnet SOL config is not a constant-product SOL curve");
  const curve = Curve.getCurve(config.curveType);
  const init = curve.getInitParam({
    supply: DEVNET_TEST_SUPPLY,
    totalFundRaising: DEVNET_TEST_RAISE,
    totalSell: DEVNET_TEST_SELL,
    totalLockedAmount: new BN(0),
    migrateFee: config.migrateFee,
  });
  Curve.checkParam({
    supply: DEVNET_TEST_SUPPLY,
    totalFundRaising: DEVNET_TEST_RAISE,
    totalSell: init.c,
    totalLockedAmount: new BN(0),
    decimals: 6,
    config,
    migrateType: "cpmm",
  });
  const admin = authorizedPlatformWallets().admin;
  const platformId = garmonPlatformId(admin, "devnet");
  const pool = getPdaLaunchpadPoolId(DEV_LAUNCHPAD_PROGRAM, mint, WRAPPED_SOL).publicKey;
  const auth = getPdaLaunchpadAuth(DEV_LAUNCHPAD_PROGRAM).publicKey;
  const vaultA = getPdaLaunchpadVaultId(DEV_LAUNCHPAD_PROGRAM, pool, mint).publicKey;
  const vaultB = getPdaLaunchpadVaultId(DEV_LAUNCHPAD_PROGRAM, pool, WRAPPED_SOL).publicKey;
  const metadata = getPdaMetadataKey(mint).publicKey;
  const instruction = initializeV2(
    DEV_LAUNCHPAD_PROGRAM,
    payer,
    payer,
    DEVNET_SOL_CONFIG,
    platformId,
    auth,
    pool,
    mint,
    WRAPPED_SOL,
    vaultA,
    vaultB,
    metadata,
    TOKEN_PROGRAM_ID,
    6,
    input.name,
    input.symbol,
    input.uri,
    { type: "ConstantCurve", migrateType: "cpmm", supply: DEVNET_TEST_SUPPLY, totalSellA: DEVNET_TEST_SELL, totalFundRaisingB: DEVNET_TEST_RAISE },
    new BN(0),
    new BN(0),
    new BN(0),
    CpmmCreatorFeeOn.OnlyTokenB,
  );
  if (!instruction.programId.equals(DEV_LAUNCHPAD_PROGRAM) || instruction.programId.equals(LAUNCHPAD_PROGRAM)) {
    throw new Error("Mainnet LaunchLab program rejected");
  }
  const transaction = new Transaction({ feePayer: payer, recentBlockhash: input.blockhash }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    instruction,
  );
  assertLaunchInstructions(transaction);
  return { transaction, platformId: platformId.toBase58(), pool: pool.toBase58(), programId: DEV_LAUNCHPAD_PROGRAM.toBase58() };
}

export function assertSignedDevnetLaunch(serialized: string, expected: Transaction, payer: PublicKey, mint: PublicKey) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(serialized) || serialized.length > 4000) throw new Error("Signed transaction is invalid");
  const signed = Transaction.from(Buffer.from(serialized, "base64"));
  if (!signed.feePayer?.equals(payer) || signed.instructions.length !== expected.instructions.length) throw new Error("Launch transaction shape is invalid");
  for (let index = 0; index < signed.instructions.length; index += 1) {
    const actual = signed.instructions[index];
    const wanted = expected.instructions[index];
    if (!actual.programId.equals(wanted.programId) || !actual.data.equals(wanted.data) || actual.keys.length !== wanted.keys.length) {
      throw new Error("Launch instruction does not match the Devnet token");
    }
    for (let key = 0; key < actual.keys.length; key += 1) {
      // The payer is also the creator. Serialization merges that repeated account, so the compiled message is the signer check.
      if (!actual.keys[key].pubkey.equals(wanted.keys[key].pubkey)) throw new Error("Launch accounts do not match the Devnet token");
    }
  }
  assertLaunchInstructions(signed);
  if (!signed.serializeMessage().equals(expected.serializeMessage())) throw new Error("Launch transaction changed from the reviewed Devnet message");
  const mintSigned = signed.signatures.some(entry => entry.publicKey.equals(mint) && entry.signature != null);
  if (!mintSigned || !signed.verifySignatures()) throw new Error("The mint and wallet signatures are required");
  return signed;
}

/** Read-only preflight. No signatures, airdrops or broadcasts are requested. */
export async function reviewDevnetCosts(connection: Connection, transaction: Transaction, estimatedRentLamports: number) {
  const genesis = await connection.getGenesisHash();
  if (genesis !== CLUSTER_GENESIS.devnet) throw new Error("RPC is not Solana devnet");
  const [fee, simulation] = await Promise.all([
    connection.getFeeForMessage(transaction.compileMessage(), "confirmed"),
    connection.simulateTransaction(new VersionedTransaction(transaction.compileMessage()), { sigVerify: false, commitment: "confirmed" }),
  ]);
  if (fee.value === null) throw new Error("Devnet blockhash expired. Prepare a fresh transaction before signing.");
  if (simulation.value.err) throw new Error(`Devnet preflight failed before wallet signing: ${JSON.stringify(simulation.value.err).slice(0, 120)}`);
  return { simulationPassed: true as const, networkFeeLamports: fee.value, estimatedRentLamports, priorityFeeLamports: 0, applicationFeeLamports: 0, estimatedTotalLamports: fee.value + estimatedRentLamports };
}

export async function readDevnetLaunchContext(payer: string) {
  assertDevnetCluster("devnet");
  const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const genesis = await connection.getGenesisHash();
  if (genesis !== CLUSTER_GENESIS.devnet) throw new Error("RPC is not Solana devnet");
  const wallets = authorizedPlatformWallets();
  const platformId = garmonPlatformId(wallets.admin, "devnet");
  const [platform, config, latest, balance] = await Promise.all([
    connection.getAccountInfo(platformId, "confirmed"),
    connection.getAccountInfo(DEVNET_SOL_CONFIG, "confirmed"),
    connection.getLatestBlockhash("confirmed"),
    connection.getBalance(new PublicKey(payer), "confirmed"),
  ]);
  if (!config || !config.owner.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("Devnet SOL LaunchLab config is unavailable");
  const platformExists = platform != null && platform.owner.equals(DEV_LAUNCHPAD_PROGRAM);
  return { connection, platformId, platformExists, configData: new Uint8Array(config.data), latest, balance, admin: wallets.admin.toBase58() };
}

export async function prepareDevnetCoin(input: { payer: string; mint?: string; name?: string; symbol?: string; uri?: string }) {
  const context = await readDevnetLaunchContext(input.payer);
  const step = devnetCoinStep(context.platformExists, input.payer);
  if (step === "platform") {
    const rent = await context.connection.getMinimumBalanceForRentExemption(PlatformConfig.span);
    const prepared = buildPlatformConfigTransaction(authorizedPlatformWallets(), context.latest.blockhash, rent.toString());
    const transaction = Transaction.from(Buffer.from(prepared.unsignedTransaction, "base64"));
    const costs = await reviewDevnetCosts(context.connection, transaction, rent);
    return { ...prepared, ...costs, lastValidBlockHeight: context.latest.lastValidBlockHeight, step, confirmed: false as const, adminLamports: context.balance };
  }
  if (!input.mint || !input.name || !input.symbol || !input.uri) {
    return {
      step, submitted: false as const, confirmed: false as const, cluster: "devnet" as const,
      platformId: context.platformId.toBase58(), platformExists: true as const, programId: DEV_LAUNCHPAD_PROGRAM.toBase58(),
    };
  }
  const built = buildDevnetLaunchTransaction({
    payer: input.payer,
    mint: input.mint,
    blockhash: context.latest.blockhash,
    name: input.name,
    symbol: input.symbol,
    uri: input.uri,
    configData: context.configData,
  });
  const [mintRent, poolRent, metadataRent, vaultRent] = await Promise.all([
    context.connection.getMinimumBalanceForRentExemption(82),
    context.connection.getMinimumBalanceForRentExemption(LaunchpadPool.span),
    context.connection.getMinimumBalanceForRentExemption(679),
    context.connection.getMinimumBalanceForRentExemption(165),
  ]);
  const costs = await reviewDevnetCosts(context.connection, built.transaction, mintRent + poolRent + metadataRent + 2 * vaultRent);
  return {
    step,
    submitted: false as const,
    confirmed: false as const,
    cluster: "devnet" as const,
    programId: built.programId,
    platformId: built.platformId,
    pool: built.pool,
    mint: input.mint,
    uri: input.uri,
    blockhash: context.latest.blockhash,
    lastValidBlockHeight: context.latest.lastValidBlockHeight,
    payerLamports: context.balance,
    ...costs,
    unsignedTransaction: Buffer.from(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
  };
}
