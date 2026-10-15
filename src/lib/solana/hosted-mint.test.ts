import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { metadataHash, openMintRecord, runHostedMint, sealMintRecord, mintSealKey } from "./hosted-mint";
import { SealedMintKeypair } from "./mint-keypair";

const key = mintSealKey({ SOLANA_AUTH_RATE_SECRET: "test-mint-reservation-secret-value" } as NodeJS.ProcessEnv);
const owner = "owner-wallet";
const draft = { name: "Purple Lion", symbol: "LION", description: "A purple and gold test coin.", website: "", social: "" };

const reserved = (suffix: string) => ({ id: `${suffix}`.padEnd(32, "a").slice(0, 32), mint: `Mint${suffix}gpay`, secret: `sealed-secret-${suffix}` });

describe("hosted ordinary mint reservation", () => {
  it("creates a normal mint and does not expose the sealed secret", async () => {
    const started = await runHostedMint({ action: "start", owner, draft }, key);
    expect(started.status).toBe(200);
    expect(started.body.status).toBe("ready");
    expect(String(started.body.mint)).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(String(started.body.mint).endsWith("gpay")).toBe(false);
    const opened = openMintRecord(String(started.cookie), key);
    expect(opened?.secret && opened.secret.length > 40).toBe(true);
    expect(JSON.stringify(started.body)).not.toContain(opened?.secret);
    const secret = Buffer.from(String(opened?.secret), "base64");
    const sealed = SealedMintKeypair.seal(String(opened?.mint), new Uint8Array(secret));
    expect(sealed.publicKey).toBe(opened?.mint);
    expect(sealed.publicKey.endsWith("gpay")).toBe(false);
    sealed.destroy();
  });

  it("does not keep a suffix rejection on the Create Coin path", () => {
    const files = [
      "./hosted-mint.ts",
      "./mint-keypair.ts",
      "./devnet-coin.ts",
      "./devnet-completion.ts",
      "./devnet-wallet-review.ts",
      "../../app/api/solana/launches/devnet/route.ts",
      "../../components/solana/CreateCoin.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toContain("Mint suffix rejected");
      expect(source).not.toContain("hasExactGpaySuffix");
      expect(source).not.toContain("suffix rejected");
    }
    expect(readFileSync(new URL("./hosted-mint.ts", import.meta.url), "utf8")).not.toContain("vanity-mint");
  });

  it("recovers a corrupt legacy unused signer without clearing cookies or submitted records", async () => {
    const started = await runHostedMint({ action: "start", owner, draft }, key);
    const legacy = openMintRecord(String(started.cookie), key)!;
    legacy.secret = Buffer.alloc(64).toString("base64");
    const recovered = await runHostedMint({ action: "start", owner, draft, cookie: sealMintRecord(legacy,key) },key);
    expect(recovered.status).toBe(200);
    expect(recovered.body.jobId).not.toBe(legacy.id);
    expect(recovered.body.status).toBe("ready");
    legacy.status="submitting"; legacy.transaction="pending-signed-transaction";
    expect((await runHostedMint({action:"start",owner,draft,cookie:sealMintRecord(legacy,key)},key)).status).toBe(409);
  });

  it("replaces an unused reservation when the coin changes and keeps a submitted launch", async () => {
    const owner = "second-wallet";
    const started = await runHostedMint({ action: "start", owner, draft, reserved: reserved("1") }, key);
    const opened = openMintRecord(String(started.cookie), key);
    expect(opened?.secret).toBe("sealed-secret-1");
    expect(JSON.stringify(started.body)).not.toContain("sealed-secret-1");
    const ready = openMintRecord(String(started.cookie), key);
    if (!ready) throw new Error("reservation missing");
    ready.status = "ready";
    ready.secret = "bWluay1zZWNyZXQtdGhhdC1tdXN0LXN0YXktc2VhbGVk";
    ready.mint = "ExampleMintgpay";
    const replaced = await runHostedMint({ action: "start", owner, draft: { ...draft, name: "Fresh Coin" }, cookie: sealMintRecord(ready, key), reserved: reserved("2") }, key);
    expect(replaced.status).toBe(200);
    expect(JSON.stringify(replaced.body)).not.toContain(ready.secret);
    expect(openMintRecord(String(replaced.cookie), key)?.secret).not.toBe(ready.secret);
    const restarted = await runHostedMint({ action: "start", owner, draft: { ...draft, symbol: "GOLD" }, cookie: replaced.cookie, reserved: reserved("3") }, key);
    expect(restarted.status).toBe(200);
    expect(restarted.body.status).toBe("ready");
    expect(restarted.body.jobId).not.toBe(started.body.jobId);
    const seen = await runHostedMint({ action: "current", owner, cookie: restarted.cookie }, key);
    expect(seen.body.replaceable).toBe(true);
    const cancelled = await runHostedMint({ action: "cancel", owner, cookie: restarted.cookie }, key);
    expect(cancelled.body.status).toBe("cancelled");
    expect(cancelled.body.replaceable).toBe(false);
    const pending = openMintRecord(String(started.cookie), key);
    if (!pending) throw new Error("reservation missing");
    pending.status = "submitting";
    pending.transaction = "signed-transaction";
    const sealed = sealMintRecord(pending, key);
    const blocked = await runHostedMint({ action: "start", owner, draft: { ...draft, name: "Other Coin" }, cookie: sealed, reserved: reserved("4") }, key);
    const empty = await runHostedMint({ action: "start", owner: "empty-wallet", draft }, key);
    expect(empty.status).toBe(200);
    expect(String(empty.body.mint)).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/still being confirmed/);
    const recovered = await runHostedMint({ action: "start", owner, draft: { ...draft, name: "Other Coin" }, cookie: sealed, reserved: reserved("5"), replaceUnconfirmed: true }, key);
    expect(recovered.status).toBe(200);
    expect(recovered.body.status).toBe("ready");
    expect(recovered.body.mint).toBe("Mint5gpay");
    const kept = await runHostedMint({ action: "cancel", owner, cookie: sealed }, key);
    expect(kept.body.status).toBe("submitting");
    expect(openMintRecord(String(kept.cookie), key)?.transaction).toBe("signed-transaction");
    expect(metadataHash(draft)).toBe(metadataHash({ ...draft }));
  });
});
