import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { executeDevnetLaunch } from "./launchlab-flow";

const enabled = process.env.GARMONPAY_DEVNET_LAUNCH === "1";

describe.skipIf(!enabled)("Raydium LaunchLab devnet launch", () => {
  it("creates a separate GarmonPay platform, then one gpay token when devnet funding is available", async () => {
    const env = { ...process.env, GARMONPAY_VANITY_WORKER: "1", SOLANA_CLUSTER: "devnet", GARMONPAY_DEVNET_LAUNCH: "1" };
    delete env.GARMONPAY_PLATFORM_ADMIN;
    delete env.GARMONPAY_PLATFORM_FEE_WALLET;
    delete env.GARMONPAY_PLATFORM_NFT_WALLET;
    delete env.GARMONPAY_PLATFORM_VESTING_WALLET;
    let result: Awaited<ReturnType<typeof executeDevnetLaunch>>;
    try {
      result = await executeDevnetLaunch({ env, name: "Garmon Check", symbol: "GPAYDEV", description: "Disposable devnet check", keywords: "gpay" });
    } catch (error) {
      result = { created: false, confirmed: false, submitted: false, secretExposed: false, reason: (error instanceof Error ? error.message : "Launch attempt failed").replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "[redacted]").slice(0, 300) };
    }
    const report = { ...result, secretExposed: false as const };
    expect(JSON.stringify(report)).not.toMatch(/secretKey|privateKey|seedPhrase/i);
    await writeFile("docs/solana/launchlab-devnet-result.json", JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2) + "\n");
    if (report.created) {
      expect(report.confirmed).toBe(true);
      expect(report.suffixOk).toBe(true);
      expect(report.duplicateAction).toBe("stop");
      expect(report.failedLaunchConfirmed).toBe(false);
      expect(report.platformExists).toBe(true);
      expect(report.keysRetained).toBe(false);
    } else {
      expect(report.confirmed).not.toBe(true);
    }
    expect(report.secretExposed).toBe(false);
  }, 900_000);
});
