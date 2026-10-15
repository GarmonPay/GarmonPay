import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  DEV_LAUNCHPAD_PROGRAM, LAUNCHPAD_PROGRAM, LaunchpadConfig, LaunchpadPool, PlatformConfig, Raydium, TxVersion,
  getPdaCreatorVault, getPdaLaunchpadAuth, getPdaLaunchpadPoolId, getPdaPlatformVault,
} from "@raydium-io/raydium-sdk-v2";
import { SealedMintKeypair } from "./mint-keypair";

import { launchMetadataUri, nextLaunchAction } from "./launch-fees";
import { CLUSTER_GENESIS, assertNotDefaultPlatform, garmonPlatformId, platformFeePlan, readPlatformWallets, verifyPlatformRecord } from "./platform-setup";

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const DEVNET_SOL_CONFIG = new PublicKey("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
export const DEVNET_CPMM_CONFIG = new PublicKey("5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy");
const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");
const SCALES = [
  { platformScale: 1_000_000, creatorScale: 0, burnScale: 0 },
  { platformScale: 0, creatorScale: 0, burnScale: 1_000_000 },
] as const;

const memory = new Map<string, "failed" | "confirmed">();

export function devnetLaunchAllowed(env: NodeJS.ProcessEnv, endpoint: string) {
  let host = "";
  try { host = new URL(endpoint).host; } catch { host = ""; }
  return env.NODE_ENV !== "production" && env.GARMONPAY_DEVNET_LAUNCH === "1" && env.SOLANA_CLUSTER === "devnet" && host === "api.devnet.solana.com";
}

export function interpretChainResult(status: { err: unknown; confirmationStatus?: string | null } | null, mintExists: boolean) {
  const successful = !!status && status.err == null && status.confirmationStatus === "finalized" && mintExists;
  return { successful };
}

export function assertLaunchInstructions(transaction: Transaction) {
  const allowed = new Set([
    DEV_LAUNCHPAD_PROGRAM.toBase58(), TOKEN_PROGRAM_ID.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
    SystemProgram.programId.toBase58(), ComputeBudgetProgram.programId.toBase58(), METADATA_PROGRAM.toBase58(), SYSVAR_RENT_PUBKEY.toBase58(),
  ]);
  if (!transaction.instructions.length) throw new Error("Launch transaction is empty");
  for (const instruction of transaction.instructions) {
    const program = instruction.programId.toBase58();
    if (program === LAUNCHPAD_PROGRAM.toBase58()) throw new Error("Mainnet LaunchLab program rejected");
    if (!allowed.has(program)) throw new Error(`Unexpected program in launch transaction: ${program}`);
  }
}

function wipe(signers: Keypair[]) {
  for (const signer of signers) signer.secretKey.fill(0);
}

async function sendOnce(connection: Connection, transaction: Transaction, payer: Keypair, signers: Keypair[], mint?: PublicKey) {
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = payer.publicKey;
  const unique = [...new Map([payer, ...signers].map(signer => [signer.publicKey.toBase58(), signer])).values()];
  transaction.sign(...unique);
  if (mint) {
    const signed = transaction.signatures.some(entry => entry.publicKey.equals(mint) && entry.signature != null);
    if (!signed) throw new Error("Mint did not sign the launch");
  }
  assertLaunchInstructions(transaction);
  const simulation = await connection.simulateTransaction(transaction);
  if (simulation.value.err) return { submitted: false as const, confirmed: false as const, signature: null, error: JSON.stringify(simulation.value.err).slice(0, 300) };
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
  const result = await connection.confirmTransaction({ signature, ...latest }, "finalized");
  const status = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
  const chain = interpretChainResult(status.value[0] ? { err: status.value[0].err, confirmationStatus: status.value[0].confirmationStatus } : { err: result.value.err, confirmationStatus: result.value.err ? null : "finalized" }, true);
  return { submitted: true as const, confirmed: result.value.err == null && chain.successful, signature, error: result.value.err ? JSON.stringify(result.value.err).slice(0, 300) : null };
}

async function createPlatform(connection: Connection, raydium: Raydium, admin: Keypair, roles: { fee: PublicKey; nft: PublicKey; vesting: PublicKey }) {
  const plan = platformFeePlan();
  let platformError = "The approved 1.20% / 0.30% platform split was not accepted";
  const splits = [plan];
  for (const scale of SCALES) {
    for (const split of splits) {
      try {
        const platformId = garmonPlatformId(admin.publicKey, "devnet");
        assertNotDefaultPlatform(platformId);
        const built = await raydium.launchpad.createPlatformConfig({
          programId: DEV_LAUNCHPAD_PROGRAM,
          platformAdmin: admin.publicKey,
          platformClaimFeeWallet: roles.fee,
          platformLockNftWallet: roles.nft,
          platformVestingWallet: roles.vesting,
          cpConfigId: DEVNET_CPMM_CONFIG,
          migrateCpLockNftScale: { platformScale: new BN(scale.platformScale), creatorScale: new BN(scale.creatorScale), burnScale: new BN(scale.burnScale) },
          transferFeeExtensionAuth: PublicKey.default,
          feeRate: new BN(split.platform),
          creatorFeeRate: new BN(split.creator),
          name: "GarmonPay",
          web: "https://garmonpay.com",
          img: "https://garmonpay.com/favicon.ico",
          txVersion: TxVersion.LEGACY,
        });
        const result = await sendOnce(connection, built.transaction, admin, built.signers.filter((signer): signer is Keypair => signer instanceof Keypair));
        if (result.confirmed) return { accepted: split, scale, platformId, error: null as string | null };
        platformError = result.error || platformError;
        if (result.submitted) return { accepted: null, scale, platformId, error: platformError };
      } catch (error) {
        platformError = error instanceof Error ? error.message.slice(0, 300) : platformError;
      }
    }
  }
  return { accepted: null, scale: null, platformId: garmonPlatformId(admin.publicKey, "devnet"), error: platformError };
}

function roleWallets(admin: PublicKey) {
  const generated = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const roles = { fee: generated[0].publicKey, nft: generated[1].publicKey, vesting: generated[2].publicKey };
  for (const key of generated) key.secretKey.fill(0);
  if (roles.fee.equals(admin) || roles.nft.equals(admin) || roles.vesting.equals(admin)) throw new Error("Platform roles were not distinct");
  return roles;
}

function platformName(bytes: number[]) {
  const end = bytes.indexOf(0);
  return Buffer.from(end < 0 ? bytes : bytes.slice(0, end)).toString("utf8");
}

export async function executeDevnetLaunch(input: {
  env: NodeJS.ProcessEnv;
  name: string;
  symbol: string;
  description: string;
  keywords: string;
}) {
  if (!devnetLaunchAllowed(input.env, DEVNET_RPC)) throw new Error("Devnet launch execution is disabled");
  const configured = readPlatformWallets(input.env);
  if (configured.configured) {
    return {
      created: false, confirmed: false, submitted: false, platformExists: false,
      signaturesNeeded: ["GARMONPAY_PLATFORM_ADMIN"],
      platformId: garmonPlatformId(configured.wallets.admin, "devnet").toBase58(),
      reason: "The configured admin wallet must sign the platform transaction. Its private key is not available here.",
      secretExposed: false as const,
    };
  }
  const metadata = launchMetadataUri(input);
  const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const payer = Keypair.generate();
  const disposable = [payer];
  let sealed: SealedMintKeypair | undefined;
  try {
    const genesis = await connection.getGenesisHash();
    if (genesis !== CLUSTER_GENESIS.devnet) throw new Error("RPC is not Solana devnet");
    const configAccount = await connection.getAccountInfo(DEVNET_SOL_CONFIG, "confirmed");
    if (!configAccount || !configAccount.owner.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("Devnet SOL LaunchLab config is unavailable");
    const configInfo = LaunchpadConfig.decode(configAccount.data);
    if (configInfo.curveType !== 0 || !configInfo.mintB.equals(WRAPPED_SOL)) throw new Error("Devnet SOL config is not a constant-product SOL curve");
    const protocolFeeRate = configInfo.tradeFeeRate.toString();
    let airdropError: string | null = null;
    try {
      const airdropSignature = await connection.requestAirdrop(payer.publicKey, 1_000_000_000);
      await connection.confirmTransaction(airdropSignature, "finalized");
    } catch (error) {
      airdropError = (error instanceof Error ? error.message : "Airdrop failed").replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "[redacted]").slice(0, 180);
    }
    if (airdropError) {
      return { created: false, confirmed: false, submitted: false, platformExists: false, airdrop: "unavailable" as const, airdropError, protocolFeeRate, curveType: configInfo.curveType, secretExposed: false as const };
    }
    const roles = roleWallets(payer.publicKey);
    const raydium = await Raydium.load({ connection, cluster: "devnet", owner: payer, disableLoadToken: true, disableFeatureCheck: true });
    const platformResult = await createPlatform(connection, raydium, payer, roles);
    if (!platformResult.accepted || !platformResult.scale) {
      return { created: false, platformExists: false, submitted: false, confirmed: false, platformError: platformResult.error, protocolFeeRate, secretExposed: false as const, keysRetained: false as const };
    }
    const platformData = await connection.getAccountInfo(platformResult.platformId, "finalized");
    if (!platformData || !platformData.owner.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("Platform account owner mismatch");
    const platform = PlatformConfig.decode(platformData.data);
    const platformRecord = verifyPlatformRecord({
      platformId: platformResult.platformId.toBase58(), admin: payer.publicKey.toBase58(),
      feeWallet: platform.platformClaimFeeWallet.toBase58(), nftWallet: platform.platformLockNftWallet.toBase58(), vestingWallet: platform.platformVestingWallet.toBase58(),
      feeRate: platform.feeRate.toString(), creatorFeeRate: platform.creatorFeeRate.toString(),
      platformScale: platform.platformScale.toString(), creatorScale: platform.creatorScale.toString(), burnScale: platform.burnScale.toString(),
      cpConfigId: platform.cpConfigId.toBase58(), expectedCpConfigId: DEVNET_CPMM_CONFIG.toBase58(),
      name: platformName(platform.name), platformCpCreator: platform.platformCpCreator.toBase58(),
    });
    if (platform.feeRate.toString() !== platformResult.accepted.platform || platform.platformClaimFeeWallet.equals(payer.publicKey)) {
      throw new Error("Platform fee account does not match the separate fee wallet");
    }
    const generatedMint = Keypair.generate();
    sealed = SealedMintKeypair.seal(generatedMint.publicKey.toBase58(), generatedMint.secretKey);
    const mint = new PublicKey(sealed.publicKey);
    const pool = getPdaLaunchpadPoolId(DEV_LAUNCHPAD_PROGRAM, mint, WRAPPED_SOL).publicKey;
    const [mintAccount, poolAccount] = await Promise.all([
      connection.getAccountInfo(mint, "finalized"),
      connection.getAccountInfo(pool, "finalized"),
    ]);
    const action = nextLaunchAction({
      mintExists: mintAccount != null, poolExists: poolAccount != null, sellConfirmed: false, memory: memory.get(mint.toBase58()) ?? "none",
    });
    if (action !== "create") {

      return { created: false, action, mint: mint.toBase58(), submitted: false, confirmed: false, secretExposed: false as const };
    }

    const mintSigner = sealed.ephemeralSigner();
    disposable.push(mintSigner);
    const platformId = platformResult.platformId;
    assertNotDefaultPlatform(platformId);
    const supply = new BN("10000000000000");
    const createdLaunch = await raydium.launchpad.createLaunchpad({
      programId: DEV_LAUNCHPAD_PROGRAM,
      mintA: mint,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
      decimals: 6,
      migrateType: "cpmm",
      configId: DEVNET_SOL_CONFIG,
      configInfo,
      platformId,
      buyAmount: new BN(100_000),
      slippage: new BN(1000),
      supply,
      totalSellA: new BN("7931000000000"),
      totalFundRaisingB: new BN(1_000_000),
      totalLockedAmount: new BN(0),
      extraSigners: [mintSigner],
      txVersion: TxVersion.LEGACY,
      computeBudgetConfig: { units: 600_000, microLamports: 1 },
    });
    let launchConfirmed = false;
    let launchSubmitted = false;
    let launchError: string | null = null;
    let launchSignature: string | null = null;
    for (let index = 0; index < createdLaunch.transactions.length; index += 1) {
      const signers = createdLaunch.signers[index].filter((signer): signer is Keypair => signer instanceof Keypair);
      const needsMint = createdLaunch.transactions[index].instructions.some(instruction => instruction.keys.some(key => key.isSigner && key.pubkey.equals(mint)));
      const result = await sendOnce(connection, createdLaunch.transactions[index], payer, signers, needsMint ? mint : undefined);
      launchSubmitted = launchSubmitted || result.submitted;
      launchConfirmed = result.confirmed;
      launchError = result.error;
      launchSignature = result.signature;
      if (!result.confirmed) break;
    }
    sealed.destroy();


    if (!launchConfirmed || !launchSignature) {
      memory.set(mint.toBase58(), "failed");
      return { created: false, mint: mint.toBase58(), submitted: launchSubmitted, confirmed: false, accepted: platformResult.accepted, launchError, metadata, secretExposed: false as const };
    }

    const status = await connection.getSignatureStatuses([launchSignature], { searchTransactionHistory: true });
    const exists = (await connection.getAccountInfo(mint, "finalized")) != null;
    const chain = interpretChainResult(status.value[0] ? { err: status.value[0].err, confirmationStatus: status.value[0].confirmationStatus } : null, exists);
    const storedPool = await connection.getAccountInfo(pool, "finalized");
    if (!chain.successful || !storedPool || !storedPool.owner.equals(DEV_LAUNCHPAD_PROGRAM)) {
      memory.set(mint.toBase58(), "failed");
      return { created: false, mint: mint.toBase58(), submitted: true, confirmed: false, launchError: "On-chain confirmation did not match the mint", metadata, secretExposed: false as const };
    }
    const decodedPool = LaunchpadPool.decode(storedPool.data);
    if (!decodedPool.mintA.equals(mint) || decodedPool.mintDecimalsA !== 6 || decodedPool.supply.toString() !== supply.toString()) throw new Error("On-chain mint does not match the launched token");
    const auth = getPdaLaunchpadAuth(DEV_LAUNCHPAD_PROGRAM).publicKey;
    const parsedMint = await connection.getParsedAccountInfo(mint, "finalized");
    const mintInfo = parsedMint.value && "parsed" in parsedMint.value.data ? parsedMint.value.data.parsed.info : null;
    if (!mintInfo || mintInfo.mintAuthority !== auth.toBase58() || mintInfo.freezeAuthority != null || mintInfo.decimals !== 6) throw new Error("Mint authority is not the LaunchLab authority");

    const [platformVault, creatorVault] = await connection.getMultipleAccountsInfo([
      getPdaPlatformVault(DEV_LAUNCHPAD_PROGRAM, platformId, WRAPPED_SOL).publicKey,
      getPdaCreatorVault(DEV_LAUNCHPAD_PROGRAM, payer.publicKey, WRAPPED_SOL).publicKey,
    ], "finalized");
    const accounts = await connection.getParsedTokenAccountsByOwner(payer.publicKey, { mint }, "finalized");
    const balance = BigInt(accounts.value[0]?.account.data.parsed.info.tokenAmount.amount ?? "0");
    let sellConfirmed = false;
    let sellError: string | null = balance > BigInt(1) ? null : "Initial buy did not produce a token balance";
    if (balance > BigInt(1)) {
      const sell = await raydium.launchpad.sellToken({
        programId: DEV_LAUNCHPAD_PROGRAM, mintA: mint, sellAmount: new BN((balance / BigInt(2)).toString()), slippage: new BN(1000), configInfo, txVersion: TxVersion.LEGACY,
      });
      const sold = await sendOnce(connection, sell.transaction, payer, sell.signers.filter((signer): signer is Keypair => signer instanceof Keypair));
      sellConfirmed = sold.confirmed;
      sellError = sold.error;
    }
    const failed = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 5_000_000_000 }));
    const failedResult = await sendOnce(connection, failed, payer, [payer]);
    memory.set(mint.toBase58(), "confirmed");
    return {
      created: true, confirmed: true, mint: mint.toBase58(), submitted: true,
      initialBuyConfirmed: balance > BigInt(0), sellConfirmed, sellError,
      failedLaunchConfirmed: interpretChainResult(failedResult.confirmed ? { err: null, confirmationStatus: "finalized" } : { err: failedResult.error, confirmationStatus: null }, false).successful,
      failedLaunchSubmitted: failedResult.submitted, duplicateAction: nextLaunchAction({ mintExists: true, poolExists: true, sellConfirmed, memory: "confirmed" }),
      accepted: platformResult.accepted, scale: platformResult.scale, protocolFeeRate: configInfo.tradeFeeRate.toString(),
      poolStatus: decodedPool.status, graduated: false as const, graduationSignerControlled: true as const,
      curveProgressBps: decodedPool.totalFundRaisingB.isZero() ? "0" : decodedPool.realB.mul(new BN(10000)).div(decodedPool.totalFundRaisingB).toString(),
      platformId: platformId.toBase58(), platformExists: true, platformRecord, keysRetained: false as const,
      platformVaultExists: platformVault != null, creatorVaultExists: creatorVault != null,
      metadata, secretExposed: false as const,
    };
  } finally {
    sealed?.destroy();
    wipe(disposable);
  }
}
