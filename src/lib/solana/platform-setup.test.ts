import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { RAYDIUM_DEFAULT_PLATFORM_ID } from "./platform-setup";
import { assertDistinctPlatformWallets, assertNotDefaultPlatform, garmonPlatformId, platformFeePlan, readPlatformWallets, solanaRpc, verifyPlatformRecord } from "./platform-setup";

describe("GarmonPay LaunchLab platform setup", () => {
  it("uses the pinned SDK rules and refuses Raydium's default platform", () => {
    expect(platformFeePlan()).toMatchObject({ platform: "12000", creator: "3000", creatorScale: "0", cpmmCreatorRedirectedByCreate: false, holderRewards: "unsupported" });
    expect(() => assertNotDefaultPlatform(RAYDIUM_DEFAULT_PLATFORM_ID)).toThrow(/default platform/);
    const admin = Keypair.generate().publicKey;
    const platformId = garmonPlatformId(admin, "devnet");
    expect(platformId.equals(RAYDIUM_DEFAULT_PLATFORM_ID)).toBe(false);
    expect(platformId.equals(garmonPlatformId(admin, "mainnet-beta"))).toBe(false);
  });

  it("requires four distinct public wallet roles and does not invent them", () => {
    expect(readPlatformWallets({}).configured).toBe(false);
    const admin = Keypair.generate().publicKey;
    const fee = Keypair.generate().publicKey;
    const nft = Keypair.generate().publicKey;
    const vesting = Keypair.generate().publicKey;
    const env = {
      GARMONPAY_PLATFORM_ADMIN: admin.toBase58(),
      GARMONPAY_PLATFORM_FEE_WALLET: fee.toBase58(),
      GARMONPAY_PLATFORM_NFT_WALLET: nft.toBase58(),
      GARMONPAY_PLATFORM_VESTING_WALLET: vesting.toBase58(),
    };
    const ready = readPlatformWallets(env);
    expect(ready.configured).toBe(true);
    expect(() => assertDistinctPlatformWallets({ admin, fee: admin, nft, vesting })).toThrow(/separate/);
    expect(() => readPlatformWallets({ ...env, GARMONPAY_PLATFORM_FEE_WALLET: "not-an-address" })).toThrow(/not a Solana address/);
  });

  it("keeps RPC endpoints on the requested cluster and launches disabled", () => {
    expect(solanaRpc("devnet", {})).toMatchObject({ endpoint: "https://api.devnet.solana.com", launchesEnabled: false });
    expect(solanaRpc("mainnet-beta", {})).toMatchObject({ endpoint: "https://api.mainnet-beta.solana.com", launchesEnabled: false });
    expect(() => solanaRpc("devnet", { SOLANA_DEVNET_RPC: "https://api.mainnet-beta.solana.com" })).toThrow(/mainnet/);
    expect(() => solanaRpc("devnet", { SOLANA_DEVNET_RPC: "http://api.devnet.solana.com" })).toThrow(/https/);
    expect(() => solanaRpc("devnet", { SOLANA_DEVNET_RPC: "https://user:pass@api.devnet.solana.com" })).toThrow(/credentials/);
  });

  it("checks fee destinations, CPMM config, and the unset creator redirect", () => {
    const admin = Keypair.generate().publicKey;
    const fee = Keypair.generate().publicKey;
    const nft = Keypair.generate().publicKey;
    const vesting = Keypair.generate().publicKey;
    const platformId = garmonPlatformId(admin, "devnet");
    const cpConfigId = Keypair.generate().publicKey.toBase58();
    expect(verifyPlatformRecord({
      platformId: platformId.toBase58(), admin: admin.toBase58(), feeWallet: fee.toBase58(), nftWallet: nft.toBase58(), vestingWallet: vesting.toBase58(),
      feeRate: "12000", creatorFeeRate: "3000", platformScale: "1000000", creatorScale: "0", burnScale: "0",
      cpConfigId, expectedCpConfigId: cpConfigId, name: "GarmonPay", platformCpCreator: PublicKey.default.toBase58(),
    })).toMatchObject({ verified: true, cpmmCreatorRedirected: false, lockedLpToPlatform: true });
    expect(() => verifyPlatformRecord({
      platformId: platformId.toBase58(), admin: admin.toBase58(), feeWallet: fee.toBase58(), nftWallet: nft.toBase58(), vestingWallet: vesting.toBase58(),
      feeRate: "3000", creatorFeeRate: "12000", platformScale: "1000000", creatorScale: "0", burnScale: "0",
      cpConfigId, expectedCpConfigId: cpConfigId, name: "GarmonPay", platformCpCreator: fee.toBase58(),
    })).toThrow(/fee record/);
  });
});
