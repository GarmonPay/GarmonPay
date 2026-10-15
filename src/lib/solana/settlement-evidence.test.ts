import { describe, expect, it } from "vitest";
import { reconcileSettlementReceipt, validateSettlementEvidence, type SettlementEvidence, type SettlementIntent } from "./settlement-evidence";
const source = "11111111111111111111111111111111";
const destination = "So11111111111111111111111111111111111111112";
const signature = "1".repeat(64);
const intent: SettlementIntent = { id: "00000000-0000-4000-8000-000000000001", purpose: "deposit", genesisHash: source,
 source, destination, amountLamports: "9007199254740993", signature, instructionIndex: 2, minimumSlot: 10, issuedAtSeconds: 100, expiresAtSeconds: 200 };
const evidence: SettlementEvidence = { genesisHash: source, signature, confirmationStatus: "finalized", error: null, slot: 11,
 blockTimeSeconds: 150, signers: [source], transfers: [{ instructionIndex: 2, programId: source, type: "transfer", source, destination, amountLamports: intent.amountLamports }] };
const clone = () => structuredClone(evidence);
describe("staging settlement evidence", () => {
 it("validates exact bigint deposit evidence and freezes the receipt", () => {
   const receipt = validateSettlementEvidence(intent, evidence);
   expect(receipt.amountLamports).toBe("9007199254740993");
   expect(Object.isFrozen(receipt)).toBe(true);
   expect(reconcileSettlementReceipt(receipt, null)).toBe("new");
   expect(reconcileSettlementReceipt(receipt, receipt)).toBe("duplicate");
 });
 it("checks withdrawal evidence without changing gross/net economics", () => {
   expect(validateSettlementEvidence({ ...intent, purpose: "withdrawal" }, evidence).purpose).toBe("withdrawal");
 });
 it.each(["processed", "confirmed"] as const)("rejects %s finality", confirmationStatus => {
   expect(() => validateSettlementEvidence(intent, { ...evidence, confirmationStatus })).toThrow();
 });
 it.each([null, 99, 201, 1.5])("rejects missing or out-of-window block time %s", blockTimeSeconds => {
   expect(() => validateSettlementEvidence(intent, { ...evidence, blockTimeSeconds })).toThrow();
 });
 it.each([0, 9, Number.MAX_SAFE_INTEGER + 1, 10.5])("rejects stale or inexact slot %s", slot => {
   expect(() => validateSettlementEvidence(intent, { ...evidence, slot })).toThrow();
 });
 it("rejects a failed transaction even when its transfer is present", () => {
   expect(() => validateSettlementEvidence(intent, { ...evidence, error: { InstructionError: [3, "failed"] } })).toThrow();
 });
 it("rejects missing error evidence, source signer, network and transaction mismatch", () => {
   for (const change of [{ error: undefined }, { signers: [destination] }, { genesisHash: destination }, { signature: "2".repeat(64) }]) {
     expect(() => validateSettlementEvidence(intent, { ...evidence, ...change })).toThrow();
   }
 });
 it("rejects underpayment, overpayment, numeric encoding and wrong recipient/source/program", () => {
   for (const change of [{ amountLamports: "9007199254740992" }, { amountLamports: "9007199254740994" }, { amountLamports: "09007199254740993" },
    { destination: source }, { source: destination }, { programId: destination }, { type: "transferWithSeed" }]) {
     const changed = clone(); changed.transfers = [{ ...changed.transfers[0], ...change }];
     expect(() => validateSettlementEvidence(intent, changed)).toThrow();
   }
 });
 it("does not aggregate unrelated instructions or count a duplicate instruction twice", () => {
   const changed = clone(); changed.transfers = [changed.transfers[0], changed.transfers[0]];
   expect(() => validateSettlementEvidence(intent, changed)).toThrow(/Ambiguous/);
   const missing = clone(); missing.transfers = [{ ...missing.transfers[0], instructionIndex: 1 }];
   expect(() => validateSettlementEvidence(intent, missing)).toThrow();
 });
 it.each(["0", "-1", "1e9", "9223372036854775808"])("rejects invalid quoted amount %s", amountLamports => {
   expect(() => validateSettlementEvidence({ ...intent, amountLamports }, evidence)).toThrow();
 });
 it("rejects numeric amounts even when both caller objects use the same encoding", () => {
   const unsafe = { ...intent, amountLamports: 1 } as unknown as SettlementIntent;
   const changed = clone(); changed.transfers = [{ ...changed.transfers[0], amountLamports: 1 } as unknown as SettlementEvidence["transfers"][number]];
   expect(() => validateSettlementEvidence(unsafe, changed)).toThrow();
 });
 it("rejects invalid signer addresses, signature sizes, zero duration and unsafe intent index", () => {
   for (const change of [{ source: "invalid" }, { signature: "1".repeat(63) }, { expiresAtSeconds: 100 }, { instructionIndex: 1.5 }]) {
     expect(() => validateSettlementEvidence({ ...intent, ...change }, evidence)).toThrow();
   }
 });
 it("rejects replay with a different intent, amount, recipient or finalized slot", () => {
   const receipt = validateSettlementEvidence(intent, evidence);
   for (const change of [{ intentId: "00000000-0000-4000-8000-000000000002" }, { amountLamports: "1" }, { destination: source }, { slot: 12 }]) {
     expect(() => reconcileSettlementReceipt(receipt, { ...receipt, ...change })).toThrow(/conflicts/);
   }
 });
 it("has no persistent mutation on failed partial evidence and can retry exact evidence", () => {
   const incomplete = clone(); incomplete.transfers = [];
   expect(() => validateSettlementEvidence(intent, incomplete)).toThrow();
   const receipt = validateSettlementEvidence(intent, evidence);
   expect(reconcileSettlementReceipt(receipt, null)).toBe("new");
   expect(intent.amountLamports).toBe("9007199254740993");
 });
});
