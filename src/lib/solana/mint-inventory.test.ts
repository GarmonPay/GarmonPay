import { describe, expect, it } from "vitest";
import { decryptMintSecret, encryptMintSecret } from "./mint-inventory";
import { mintSealKey } from "./hosted-mint";

describe("mint inventory encryption", () => {
  it("round-trips a mint secret without leaving it in the stored text", () => {
    const key = mintSealKey({ SOLANA_AUTH_RATE_SECRET: "inventory-secret-value-for-tests" } as NodeJS.ProcessEnv);
    const secret = "bWluay1wcml2YXRlLWtleS1tdXN0LXN0YXktZW5jcnlwdGVk";
    const stored = encryptMintSecret(secret, key);
    expect(stored).not.toContain(secret);
    expect(decryptMintSecret(stored, key)).toBe(secret);
    expect(() => decryptMintSecret(stored, mintSealKey({ SOLANA_AUTH_RATE_SECRET: "different-inventory-secret-value" } as NodeJS.ProcessEnv))).toThrow();
  });
});
