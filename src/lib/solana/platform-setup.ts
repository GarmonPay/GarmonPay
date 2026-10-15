import { PublicKey } from "@solana/web3.js";
import { DEV_LAUNCHPAD_PROGRAM, LAUNCHPAD_PROGRAM, getPdaPlatformId } from "@raydium-io/raydium-sdk-v2";
import { LAUNCH_FEE_FACTS, feeSplitFitsCaps } from "./launch-fees";

/** Installed package matches the current npm release of @raydium-io/raydium-sdk-v2. */
export const RAYDIUM_SDK_VERSION = "0.2.74-alpha";

/** SDK fallback in LaunchpadPoolInitParam. A GarmonPay launch must not use it. */
export const RAYDIUM_DEFAULT_PLATFORM_ID = new PublicKey("4Bu96XjU84XjPDSpveTVf6LYGCkfW5FK7SNkREWcEfV4");

export const PLATFORM_WALLET_ENV = Object.freeze({
  admin: "GARMONPAY_PLATFORM_ADMIN",
  fee: "GARMONPAY_PLATFORM_FEE_WALLET",
  nft: "GARMONPAY_PLATFORM_NFT_WALLET",
  vesting: "GARMONPAY_PLATFORM_VESTING_WALLET",
});

/** Public addresses. Platform creation is restricted to this admin. */
export const AUTHORIZED_PLATFORM_ADDRESSES = Object.freeze({
  admin: "HLQyS1fLfboSvY5jwQwmpk394QfZhuWMZWmGZ2Bj7QUE",
  fee: "3hJxH4AQYMf9rC45zSDDnFcMP4Ywqi2R9mKAKr3uaAKG",
  nft: "2xv49RSdmb9UnbAbfyULM5TnCZg7CB8TwWRjX65C1ccN",
  vesting: "5WxHPiUZaiB6KNPg61figSRX2rXbRLnZqwtLKEhqSenn",
});

const PUBLIC_RPC = Object.freeze({
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
});

export const CLUSTER_GENESIS = Object.freeze({
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
});

export type SolanaCluster = "devnet" | "mainnet-beta";

export function solanaRpc(cluster: SolanaCluster, env: NodeJS.ProcessEnv = process.env) {
  const override = cluster === "devnet" ? env.SOLANA_DEVNET_RPC : env.SOLANA_MAINNET_RPC;
  const endpoint = override?.trim() || PUBLIC_RPC[cluster];
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("RPC URL is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("RPC URL must be https without credentials");
  if (cluster === "devnet" && url.host === "api.mainnet-beta.solana.com") throw new Error("Refusing a mainnet RPC for devnet");
  if (cluster === "mainnet-beta" && url.host === "api.devnet.solana.com") throw new Error("Refusing a devnet RPC for mainnet");
  return { endpoint, cluster, launchesEnabled: false as const };
}

export function assertNotDefaultPlatform(platformId: PublicKey) {
  if (platformId.equals(RAYDIUM_DEFAULT_PLATFORM_ID)) throw new Error("Raydium's default platform cannot be used for a GarmonPay launch");
}

function pubkey(value: string | undefined, name: string) {
  if (!value?.trim()) return null;
  try { return new PublicKey(value.trim()); } catch { throw new Error(`${name} is not a Solana address`); }
}

export type PlatformWallets = { admin: PublicKey; fee: PublicKey; nft: PublicKey; vesting: PublicKey };

/** Public keys only. Missing keys stay missing; nothing is invented. */
export function readPlatformWallets(env: NodeJS.ProcessEnv = process.env) {
  const names = Object.values(PLATFORM_WALLET_ENV);
  const parsed = {
    admin: pubkey(env[PLATFORM_WALLET_ENV.admin], PLATFORM_WALLET_ENV.admin),
    fee: pubkey(env[PLATFORM_WALLET_ENV.fee], PLATFORM_WALLET_ENV.fee),
    nft: pubkey(env[PLATFORM_WALLET_ENV.nft], PLATFORM_WALLET_ENV.nft),
    vesting: pubkey(env[PLATFORM_WALLET_ENV.vesting], PLATFORM_WALLET_ENV.vesting),
  };
  const missing = names.filter(name => !env[name]?.trim());
  if (missing.length) return { configured: false as const, missing };
  const wallets = parsed as PlatformWallets;
  assertDistinctPlatformWallets(wallets);
  return { configured: true as const, wallets, missing: [] as string[] };
}

export function authorizedPlatformWallets(): PlatformWallets {
  const wallets: PlatformWallets = {
    admin: new PublicKey(AUTHORIZED_PLATFORM_ADDRESSES.admin),
    fee: new PublicKey(AUTHORIZED_PLATFORM_ADDRESSES.fee),
    nft: new PublicKey(AUTHORIZED_PLATFORM_ADDRESSES.nft),
    vesting: new PublicKey(AUTHORIZED_PLATFORM_ADDRESSES.vesting),
  };
  assertDistinctPlatformWallets(wallets);
  return wallets;
}

export function assertDistinctPlatformWallets(wallets: PlatformWallets) {
  const entries = Object.entries(wallets) as [keyof PlatformWallets, PublicKey][];
  const seen = new Set<string>();
  for (const [role, key] of entries) {
    if (key.equals(RAYDIUM_DEFAULT_PLATFORM_ID)) throw new Error("A platform wallet cannot be Raydium's default platform");
    if (seen.has(key.toBase58())) throw new Error(`Platform ${role} wallet must be a separate address`);
    seen.add(key.toBase58());
  }
}

export function garmonPlatformId(admin: PublicKey, cluster: SolanaCluster) {
  const program = cluster === "devnet" ? DEV_LAUNCHPAD_PROGRAM : LAUNCHPAD_PROGRAM;
  const platformId = getPdaPlatformId(program, admin).publicKey;
  assertNotDefaultPlatform(platformId);
  return platformId;
}

export const PLATFORM_FEE_SPLIT = Object.freeze({ platform: LAUNCH_FEE_FACTS.largerPlatformFee, creator: LAUNCH_FEE_FACTS.largerCreatorFee });

export function platformFeePlan() {
  const fit = feeSplitFitsCaps(PLATFORM_FEE_SPLIT);
  if (!fit.supported) throw new Error(fit.reasons.join(" "));
  return {
    ...PLATFORM_FEE_SPLIT,
    creatorScale: "0",
    platformScale: "1000000",
    burnScale: "0",
    allInRate: fit.allInRate,
    holderRewards: "unsupported" as const,
    cpmmCreatorRedirectedByCreate: false as const,
  };
}

export function verifyPlatformRecord(input: {
  platformId: string;
  admin: string;
  feeWallet: string;
  nftWallet: string;
  vestingWallet: string;
  feeRate: string;
  creatorFeeRate: string;
  platformScale: string;
  creatorScale: string;
  burnScale: string;
  cpConfigId: string;
  expectedCpConfigId: string;
  name: string;
  platformCpCreator: string;
}) {
  const platformId = new PublicKey(input.platformId);
  const admin = new PublicKey(input.admin);
  assertNotDefaultPlatform(platformId);
  if (!platformId.equals(garmonPlatformId(admin, "devnet")) && !platformId.equals(garmonPlatformId(admin, "mainnet-beta"))) {
    throw new Error("Platform id was not derived from the GarmonPay admin");
  }
  assertDistinctPlatformWallets({ admin, fee: new PublicKey(input.feeWallet), nft: new PublicKey(input.nftWallet), vesting: new PublicKey(input.vestingWallet) });
  if (!feeSplitFitsCaps({ platform: input.feeRate, creator: input.creatorFeeRate }).supported) throw new Error("Platform fee record does not match a supported split");
  if (input.creatorScale !== "0") throw new Error("Post-graduation creator scale must be 0");
  if (BigInt(input.platformScale) + BigInt(input.creatorScale) + BigInt(input.burnScale) !== BigInt(1_000_000)) throw new Error("Graduation LP scales must total 1000000");
  if (input.cpConfigId !== input.expectedCpConfigId) throw new Error("CPMM graduation config does not match");
  if (input.name !== "GarmonPay") throw new Error("Platform name does not match");
  const redirected = input.platformCpCreator === input.feeWallet;
  return { verified: true as const, cpmmCreatorRedirected: redirected, lockedLpToPlatform: input.platformScale === "1000000" && input.creatorScale === "0" };
}
