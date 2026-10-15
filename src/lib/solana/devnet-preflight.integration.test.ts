import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Connection } from "@solana/web3.js";
import { DEVNET_RPC, DEVNET_SOL_CONFIG } from "./launchlab-flow";
import { authorizedPlatformWallets, CLUSTER_GENESIS, garmonPlatformId } from "./platform-setup";
import { prepareDevnetCoin } from "./devnet-coin";

describe.skipIf(process.env.GARMONPAY_READ_ONLY_DEVNET_TEST !== "1")("actual Devnet read-only preflight", () => {
  it("verifies live LaunchLab config and unsigned setup simulation without broadcasting", async () => {
    const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const genesis = await connection.getGenesisHash();
    expect(genesis).toBe(CLUSTER_GENESIS.devnet);
    const platformId = garmonPlatformId(authorizedPlatformWallets().admin, "devnet");
    const [platform, config, latest] = await Promise.all([connection.getAccountInfo(platformId), connection.getAccountInfo(DEVNET_SOL_CONFIG), connection.getLatestBlockhash()]);
    const valid = await connection.isBlockhashValid(latest.blockhash);
    expect(valid.value).toBe(true);
    const result: Record<string, unknown> = { network: "devnet", genesisVerified: true, platformId: platformId.toBase58(), platformExists: !!platform, configOwner: config?.owner.toBase58(), blockhashValid: valid.value, submitted: false, signature: null, tokenCreated: false };
    try {
      const prepared = await prepareDevnetCoin({ payer: authorizedPlatformWallets().admin.toBase58() });
      result.step = prepared.step;
      if ("simulationPassed" in prepared) {
        result.simulationPassed = prepared.simulationPassed;
        result.networkFeeLamports = prepared.networkFeeLamports;
        result.estimatedRentLamports = prepared.estimatedRentLamports;
        result.priorityFeeLamports = prepared.priorityFeeLamports;
        expect(prepared.simulationPassed).toBe(true);
      }
    } catch (error) { result.error = error instanceof Error ? error.message : "Preflight unavailable"; throw error; }
    finally { writeFileSync("/private/tmp/garmonpay-coin-rpc-result.json", JSON.stringify(result, null, 2)); }
  }, 20000);
});
