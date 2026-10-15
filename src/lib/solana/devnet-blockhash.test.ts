import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLUSTER_GENESIS } from "./platform-setup";
import { decideDevnetBroadcast, classifySendFailure } from "./devnet-blockhash";

const height = 498100908;
const open = { genesis: CLUSTER_GENESIS.devnet, blockhashValid: true, currentBlockHeight: height, lastValidBlockHeight: height + 150, chainStatus: "absent" as const };

describe("Devnet blockhash broadcast gate", () => {
  it("broadcasts a fresh Devnet blockhash that has not landed", () => {
    expect(decideDevnetBroadcast(open)).toBe("broadcast");
  });
  it("does not broadcast after the block height passes lastValidBlockHeight", () => {
    expect(decideDevnetBroadcast({ ...open, currentBlockHeight: open.lastValidBlockHeight + 1 })).toBe("expired");
  });
  it("does not broadcast a blockhash the Devnet RPC rejects while the window is still open", () => {
    expect(decideDevnetBroadcast({ ...open, blockhashValid: false })).toBe("rejected");
  });
  it("confirms an existing signature instead of sending it again", () => {
    expect(decideDevnetBroadcast({ ...open, chainStatus: "finalized", blockhashValid: false, currentBlockHeight: open.lastValidBlockHeight + 5 })).toBe("confirm-existing");
    expect(decideDevnetBroadcast({ ...open, chainStatus: "failed" })).toBe("confirm-existing");
  });
  it("does not claim a missing signature when Devnet could not answer", () => {
    expect(decideDevnetBroadcast({ ...open, chainStatus: "unknown" })).toBe("unknown");
    expect(decideDevnetBroadcast({ ...open, genesis: "mainnet-genesis" })).toBe("rejected");
  });
  it("classifies a send failure only after the signature lookup", () => {
    expect(classifySendFailure("Transaction simulation failed", "absent")).toBe("not-submitted");
    expect(classifySendFailure("Blockhash not found", "absent")).toBe("expired");
    expect(classifySendFailure("already been processed", "absent")).toBe("confirm-existing");
    expect(classifySendFailure("fetch failed", "unknown")).toBe("ambiguous");
    expect(classifySendFailure("fetch failed", "finalized")).toBe("confirm-existing");
    expect(classifySendFailure("preflight failure", "failed")).toBe("confirm-existing");
  });
  it("refreshes the blockhash after cost approval and before the wallet signature", () => {
    const source = readFileSync(new URL("../../components/solana/CreateCoin.tsx", import.meta.url), "utf8");
    const sign = source.slice(source.indexOf("async function signAndSubmit"), source.indexOf("async function launch"));
    expect(sign.indexOf("consent.current")).toBeLessThan(sign.indexOf("await refresh()"));
    expect(sign.indexOf("await refresh()")).toBeLessThan(sign.indexOf("signTransaction(transaction)"));
    expect(sign.indexOf("reviewWalletResult(signed, reviewedMessage)")).toBeLessThan(sign.indexOf('action: "submit"'));
    expect(sign).toContain("lastValidBlockHeight: fresh.lastValidBlockHeight");
    expect(sign.match(/signTransaction\(/g)?.length).toBe(1);
    expect(sign).not.toContain("sendRawTransaction");
    expect(source).not.toContain("Devnet blockhash expired or belongs to another network");
  });
});
