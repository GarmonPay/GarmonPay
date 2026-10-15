import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { DEV_LAUNCHPAD_PROGRAM } from "@raydium-io/raydium-sdk-v2";
import { describe, expect, it } from "vitest";
import { isOperationPaused } from "../security/financial-pause";
import { authorizedPlatformWallets, AUTHORIZED_PLATFORM_ADDRESSES } from "./platform-setup";
import { buildPlatformConfigTransaction, resolvePlatformWallets, assertSignedPlatformTransaction, devnetPlatformSubmitAllowed } from "./platform-transaction";

describe("unsigned devnet platform transaction", () => {
  it("keeps configured wallets and builds a transaction only the admin can sign", () => {
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
    const resolved = resolvePlatformWallets(env, { admin: Keypair.generate().publicKey.toBase58(), fee: fee.toBase58(), nft: nft.toBase58(), vesting: vesting.toBase58() });
    expect(resolved.source).toBe("environment");
    expect(resolved.wallets.admin.equals(admin)).toBe(true);
    expect(resolved.replaced).toBe(false);
    const built = buildPlatformConfigTransaction(resolved.wallets, Keypair.generate().publicKey.toBase58(), "1447680");
    expect(built.submitted).toBe(false);
    expect(built.platformExists).toBe(false);
    expect(built.feeRate).toBe("12000");
    expect(built.creatorFeeRate).toBe("3000");
    expect(built.creatorScale).toBe("0");
    expect(built.requiredSigner).toBe(admin.toBase58());
    expect(built.accounts.filter(account => account.signer).map(account => account.address)).toEqual([admin.toBase58()]);
    expect(built.programId).toBe(DEV_LAUNCHPAD_PROGRAM.toBase58());
    const transaction = Transaction.from(Buffer.from(built.unsignedTransaction, "base64"));
    expect(transaction.instructions).toHaveLength(3);
    expect(transaction.feePayer?.equals(admin)).toBe(true);
    expect(transaction.signatures.some(entry => entry.signature != null)).toBe(false);
    expect(JSON.stringify(built)).not.toMatch(/secretKey|privateKey|seed/i);
    expect(isOperationPaused("/api/solana/launches/platform", "POST")).toBe(false);
    expect(isOperationPaused("/api/solana/launches/platform/submit", "POST")).toBe(false);
    expect(devnetPlatformSubmitAllowed({ NODE_ENV: "production", VERCEL: "1", GARMONPAY_DEVNET_LAUNCH: "1", SOLANA_CLUSTER: "devnet" })).toBe(false);
  });

  it("rejects a private-key shaped value and a repeated address", () => {
    expect(() => resolvePlatformWallets({}, { admin: "a".repeat(88), fee: "x", nft: "y", vesting: "z" })).toThrow(/public address/);
    const shared = Keypair.generate().publicKey.toBase58();
    expect(() => resolvePlatformWallets({}, { admin: shared, fee: shared, nft: Keypair.generate().publicKey.toBase58(), vesting: Keypair.generate().publicKey.toBase58() })).toThrow(/separate/);
    expect(new PublicKey(shared)).toBeInstanceOf(PublicKey);
  });

  it("requires the admin signature and keeps production submission closed", () => {
    const admin = Keypair.generate();
    const wallets = { admin: admin.publicKey, fee: Keypair.generate().publicKey, nft: Keypair.generate().publicKey, vesting: Keypair.generate().publicKey };
    const built = buildPlatformConfigTransaction(wallets, Keypair.generate().publicKey.toBase58(), "5445760");
    const transaction = Transaction.from(Buffer.from(built.unsignedTransaction, "base64"));
    transaction.sign(admin);
    const signed = transaction.serialize().toString("base64");
    expect(assertSignedPlatformTransaction(signed, wallets).verifySignatures()).toBe(true);
    const tampered = Transaction.from(Buffer.from(signed, "base64"));
    tampered.instructions.at(-1)!.data[0] ^= 1;
    const altered = tampered.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    expect(() => assertSignedPlatformTransaction(altered, wallets)).toThrow(/approved configuration/);
    expect(devnetPlatformSubmitAllowed({})).toBe(false);
    expect(devnetPlatformSubmitAllowed({ NODE_ENV: "production", GARMONPAY_DEVNET_LAUNCH: "1", SOLANA_CLUSTER: "devnet" })).toBe(false);
    expect(devnetPlatformSubmitAllowed({ NODE_ENV: "development", VERCEL: "1", GARMONPAY_DEVNET_LAUNCH: "1", SOLANA_CLUSTER: "devnet" })).toBe(false);
    expect(devnetPlatformSubmitAllowed({ NODE_ENV: "development", GARMONPAY_DEVNET_LAUNCH: "1", SOLANA_CLUSTER: "devnet" })).toBe(true);
    const authorized = authorizedPlatformWallets();
    expect(authorized.admin.toBase58()).toBe(AUTHORIZED_PLATFORM_ADDRESSES.admin);
    const foreign = Transaction.from(Buffer.from(buildPlatformConfigTransaction({ ...authorized, admin: Keypair.generate().publicKey }, Keypair.generate().publicKey.toBase58(), "5445760").unsignedTransaction, "base64"));
    expect(() => assertSignedPlatformTransaction(foreign.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), authorized)).toThrow(/approved configuration|reviewed configuration/);
    expect(JSON.stringify({ signed })).not.toMatch(/secretKey|seed phrase/i);
  });
});
