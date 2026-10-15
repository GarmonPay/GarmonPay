import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { confirmLaunchedMint, constructMintSignedTransaction, signMintMessage, submitGpayLaunch } from "./gpay-launch";
import { startVanitySearch } from "./vanity-jobs";
import { SealedMintKeypair, VanitySearchError, encodeBase58, guardLaunchSubmission, hasExactGpaySuffix, raydiumExternalMintPlan, searchVanityMint, vanitySearchAllowed } from "./vanity-mint";

describe("ordinary mint launch guards", () => {
  it("matches Solana base58 and keeps the secret out of JSON", async () => {
    const sample = Keypair.generate().publicKey.toBytes();
    expect(encodeBase58(sample)).toBe(new PublicKey(sample).toBase58());
    const sealed = await searchVanityMint({ suffix: "a", maxAttempts: 5000, concurrency: 2 });
    expect(sealed.publicKey.endsWith("a")).toBe(true);
    expect(sealed.publicKey.length).toBeGreaterThanOrEqual(32);
    const serialized = JSON.stringify(sealed);
    expect(serialized).toBe(JSON.stringify({ publicKey: sealed.publicKey }));
    expect(Object.keys(sealed)).toEqual(["publicKey"]);
    const message = new TextEncoder().encode(`proof:${sealed.publicKey}`);
    expect(signMintMessage(sealed, message)).toHaveLength(64);
    const signer = sealed.ephemeralSigner();
    expect(signer.publicKey.toBase58()).toBe(sealed.publicKey);
    const proof = new Transaction({ feePayer: signer.publicKey, recentBlockhash: "11111111111111111111111111111111" });
    proof.add(SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: signer.publicKey, lamports: 0 }));
    proof.partialSign(signer);
    expect(proof.serialize({ requireAllSignatures: false }).length).toBeGreaterThan(64);
    signer.secretKey.fill(0);
    expect(signMintMessage(sealed, message)).toHaveLength(64);
    sealed.destroy();
    expect(() => sealed.sign(message)).toThrow(/no longer available/);
  });

  it("cancels and retries without launching a non-gpay mint", async () => {
    const controller = new AbortController();
    const pending = searchVanityMint({ suffix: "gpay", signal: controller.signal, maxMs: 30_000 });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(VanitySearchError);
    await expect(searchVanityMint({ suffix: "gpay", maxAttempts: 1, concurrency: 1 })).rejects.toThrow(/before a gpay/);
    const ordinary = Keypair.generate().publicKey.toBase58();
    expect(ordinary.endsWith("gpay")).toBe(false);
    expect(() => raydiumExternalMintPlan("not-a-gpay-mint")).toThrow(/invalid/);
    expect(raydiumExternalMintPlan(ordinary)).toMatchObject({ mintA: ordinary, extraSigners: 1, secretIncluded: false, launchEnabled: false });
    expect(() => guardLaunchSubmission("ordinarymint", "devnet")).toThrow(/invalid/);
    expect(() => guardLaunchSubmission(ordinary, "mainnet-beta")).toThrow(/disabled/);
    expect(() => guardLaunchSubmission(ordinary, "devnet")).toThrow(/disabled/);
    const send = vi.fn();
    await expect(submitGpayLaunch(ordinary, "devnet", send)).rejects.toThrow(/disabled/);
    expect(send).not.toHaveBeenCalled();
  });

  it("signs an ordinary mint and confirms the on-chain result honestly", async () => {
    const short = await searchVanityMint({ suffix: "e", maxAttempts: 5000 });
    const builtShort = constructMintSignedTransaction(short, Keypair.generate().publicKey, "11111111111111111111111111111111");
    expect(builtShort.submitted).toBe(false);
    expect(builtShort.mint.endsWith("gpay")).toBe(false);
    short.destroy();
    const found = await searchVanityMint({ suffix: "gpay", maxMs: 2_500, concurrency: 4 }).catch(error => error);
    if (found instanceof SealedMintKeypair) {
      const built = constructMintSignedTransaction(found, Keypair.generate().publicKey, "11111111111111111111111111111111");
      expect(built.submitted).toBe(false);
      expect(hasExactGpaySuffix(built.mint)).toBe(true);
      found.destroy();
    } else {
      expect(found).toBeInstanceOf(VanitySearchError);
    }
    const ordinary = Keypair.generate().publicKey.toBase58();
    expect(ordinary.endsWith("gpay")).toBe(false);
    expect(await confirmLaunchedMint({
      getSignatureStatus: async () => ({ confirmationStatus: "processed", err: null }),
      accountExists: async () => false,
    }, "sig", ordinary)).toMatchObject({ confirmed: false, reason: "transaction not finalized" });
    expect(await confirmLaunchedMint({
      getSignatureStatus: async () => ({ confirmationStatus: "finalized", err: null }),
      accountExists: async () => true,
    }, "sig", ordinary)).toMatchObject({ confirmed: true, reason: "mint account found" });
    expect(await confirmLaunchedMint({
      getSignatureStatus: async () => ({ confirmationStatus: "finalized", err: null }),
      accountExists: async () => true,
    }, "sig", "not-a-mint")).toMatchObject({ confirmed: false, reason: "mint address invalid" });
  }, 15_000);

  it("does not grind on a production web request", () => {
    expect(vanitySearchAllowed({ GARMONPAY_VANITY_WORKER: "1", NODE_ENV: "production" })).toBe(false);
    expect(vanitySearchAllowed({ GARMONPAY_VANITY_WORKER: "1", NODE_ENV: "development", SOLANA_CLUSTER: "mainnet-beta" })).toBe(false);
    expect(startVanitySearch({ NODE_ENV: "production", GARMONPAY_VANITY_WORKER: "1" }).status).toMatchObject({ status: "paused", launchEnabled: false, submitted: false, publicKey: null });
  });
});
