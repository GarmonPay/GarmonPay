import { LAUNCHPAD_PROGRAM, LaunchpadPool, LaunchpadConfig, PlatformConfig, Curve, getPdaLaunchpadPoolId } from "@raydium-io/raydium-sdk-v2";
import { Connection, PublicKey } from "@solana/web3.js";
const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");
/** Official pinned layouts. Read-only: never loads a signer or submits a transaction. */
export async function readLaunch(connection: Pick<Connection,"getAccountInfo">, mintAddress: string) {
  const mint = new PublicKey(mintAddress);
  const poolAddress = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mint, WRAPPED_SOL).publicKey;
  const account = await connection.getAccountInfo(poolAddress,"confirmed");
  if (!account || !account.owner.equals(LAUNCHPAD_PROGRAM) || account.data.length !== LaunchpadPool.span) throw new Error("LaunchLab pool cannot be verified");
  const pool = LaunchpadPool.decode(account.data);
  if (!pool.mintA.equals(mint) || !pool.mintB.equals(WRAPPED_SOL)) throw new Error("SOL launch mismatch");
  const [configAccount,platformAccount] = await Promise.all([connection.getAccountInfo(pool.configId,"confirmed"),connection.getAccountInfo(pool.platformId,"confirmed")]);
  if (!configAccount || !platformAccount || !configAccount.owner.equals(LAUNCHPAD_PROGRAM) || !platformAccount.owner.equals(LAUNCHPAD_PROGRAM) || configAccount.data.length !== LaunchpadConfig.span || platformAccount.data.length !== PlatformConfig.span) throw new Error("Launch configuration cannot be verified");
  const config = LaunchpadConfig.decode(configAccount.data),platform=PlatformConfig.decode(platformAccount.data);
  if (config.curveType !== 0 || !config.mintB.equals(WRAPPED_SOL)) throw new Error("Only virtual constant-product SOL launches are supported");
  const denominator = BigInt(pool.totalFundRaisingB.toString());
  const progress = denominator > BigInt(0) ? BigInt(pool.realB.toString()) * BigInt(10000) / denominator : BigInt(0);
  const totalRate = config.tradeFeeRate.add(platform.feeRate).add(platform.creatorFeeRate);
  return {
    mint: mint.toBase58(),pool:poolAddress.toBase58(),creator:pool.creator.toBase58(),platform:pool.platformId.toBase58(),
    status:pool.status,progressBps:(progress>BigInt(10000)?BigInt(10000):progress).toString(),
    priceInSol:Curve.getPrice({poolInfo:pool,curveType:config.curveType,decimalA:pool.mintDecimalsA,decimalB:pool.mintDecimalsB}).toString(),
    fees:{denominator:"1000000",protocol:config.tradeFeeRate.toString(),platform:platform.feeRate.toString(),creator:platform.creatorFeeRate.toString(),total:totalRate.toString()},
    economicsMatch:platform.feeRate.toString()==="12000" && platform.creatorFeeRate.toString()==="3000" && totalRate.toString()==="17500",
    observedAt:new Date().toISOString(),
  };
}
/** Suffix is never proof of provenance. Also require the recorded confirmed initialization. */
export function hasGarmonPayProvenance(launch: Awaited<ReturnType<typeof readLaunch>>, expected: {mint:string;creator:string;platform:string;creationSignature:string;initializationVerified:boolean}) {
  return !!expected.creationSignature && expected.initializationVerified && launch.mint===expected.mint && launch.creator===expected.creator && launch.platform===expected.platform;
}
