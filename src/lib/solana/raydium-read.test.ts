import { describe,expect,it,vi } from "vitest";
import { readLaunch,hasGarmonPayProvenance } from "./raydium-read";
import { PublicKey } from "@solana/web3.js";
describe("Raydium read-only integration",()=>{
 it("fails closed on an absent LaunchLab account",async()=>{await expect(readLaunch({getAccountInfo:vi.fn().mockResolvedValue(null)},"11111111111111111111111111111111")).rejects.toThrow("cannot be verified");});
 it("rejects a pool account owned by an unrelated program",async()=>{await expect(readLaunch({getAccountInfo:vi.fn().mockResolvedValue({owner:new PublicKey("11111111111111111111111111111111"),data:Buffer.alloc(0)})},"11111111111111111111111111111111")).rejects.toThrow("cannot be verified");});
 it("never accepts a gpay suffix as provenance",()=>{const launch={mint:"syntheticgpay",creator:"creator",platform:"external"} as Awaited<ReturnType<typeof readLaunch>>;expect(hasGarmonPayProvenance(launch,{mint:launch.mint,creator:"creator",platform:"garmon",creationSignature:"fixture",initializationVerified:true})).toBe(false);expect(hasGarmonPayProvenance(launch,{mint:launch.mint,creator:"creator",platform:"external",creationSignature:"fixture",initializationVerified:false})).toBe(false);});
});
