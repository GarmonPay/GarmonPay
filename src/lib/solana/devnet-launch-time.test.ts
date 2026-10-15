import { describe, expect, it, vi } from "vitest";
import { Connection } from "@solana/web3.js";
import { devnetLaunchTime } from "./devnet-token-view";
describe("confirmed coin launch time", () => {
 it("uses the finalized chain block time, never a reservation creation date", async () => {
  const getTransaction=vi.fn().mockResolvedValue({blockTime:1700000000});
  expect(await devnetLaunchTime({getTransaction} as unknown as Connection,'public-transaction-id')).toBe('2023-11-14T22:13:20.000Z');
  expect(getTransaction).toHaveBeenCalledWith('public-transaction-id',{commitment:'finalized',maxSupportedTransactionVersion:0});
 });
 it("leaves time unknown when the chain does not provide it", async () => {
  expect(await devnetLaunchTime({getTransaction:async()=>({blockTime:null})} as unknown as Connection,'sig')).toBeNull();
  expect(await devnetLaunchTime({getTransaction:async()=>{throw new Error('RPC unavailable')}} as unknown as Connection,'sig')).toBeNull();
 });
});
