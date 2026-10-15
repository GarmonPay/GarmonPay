/** Staging-only evidence validation. No RPC, signing, balance posting or activation. */
import { decodeBase58, validateWallet } from "./auth-crypto";
import { lamports } from "./amounts";

export interface SettlementIntent {
  id: string;
  purpose: "deposit" | "withdrawal";
  genesisHash: string;
  source: string;
  destination: string;
  amountLamports: string;
  signature: string;
  instructionIndex: number;
  minimumSlot: number;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
}

/** Must be produced by a trusted server RPC decoder, never supplied by a browser. */
export interface SettlementEvidence {
  genesisHash: string;
  signature: string;
  confirmationStatus: "processed" | "confirmed" | "finalized";
  error: unknown;
  slot: number;
  blockTimeSeconds: number | null;
  signers: readonly string[];
  transfers: readonly {
    instructionIndex: number;
    programId: string;
    type: string;
    source: string;
    destination: string;
    amountLamports: string;
  }[];
}
export interface SettlementReceipt {
  intentId: string;
  purpose: SettlementIntent["purpose"];
  receiptKey: string;
  genesisHash: string;
  signature: string;
  instructionIndex: number;
  source: string;
  destination: string;
  amountLamports: string;
  slot: number;
}
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function integer(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function requireSignature(value: string): void {
  if (typeof value !== "string" || decodeBase58(value).length !== 64) throw new Error("Invalid transaction signature");
}

/** Exact transfer matching; account delta alone cannot establish payment intent. */
export function validateSettlementEvidence(intent: SettlementIntent, evidence: SettlementEvidence): Readonly<SettlementReceipt> {
  if (!UUID.test(intent.id) || !["deposit", "withdrawal"].includes(intent.purpose)) throw new Error("Invalid settlement intent");
  validateWallet(intent.genesisHash);
  validateWallet(intent.source);
  validateWallet(intent.destination);
  if (typeof intent.amountLamports !== "string" || intent.source === intent.destination || lamports(intent.amountLamports) <= BigInt(0)) throw new Error("Invalid settlement amount or destination");
  requireSignature(intent.signature);
  if (![intent.instructionIndex, intent.minimumSlot, intent.issuedAtSeconds, intent.expiresAtSeconds].every(integer) || intent.expiresAtSeconds <= intent.issuedAtSeconds) throw new Error("Invalid intent bounds");
  if (evidence.genesisHash !== intent.genesisHash || evidence.signature !== intent.signature) throw new Error("Network or transaction mismatch");
  if (evidence.confirmationStatus !== "finalized" || evidence.error !== null) throw new Error("Successful finalized evidence required");
  if (!integer(evidence.slot) || evidence.slot < intent.minimumSlot || evidence.blockTimeSeconds === null || !integer(evidence.blockTimeSeconds) || evidence.blockTimeSeconds < intent.issuedAtSeconds || evidence.blockTimeSeconds > intent.expiresAtSeconds) throw new Error("Evidence outside intent bounds");
  if (!Array.isArray(evidence.signers) || !evidence.signers.includes(intent.source)) throw new Error("Source signer missing");
  if (!Array.isArray(evidence.transfers) || evidence.transfers.length > 64) throw new Error("Invalid transfer evidence");
  const indexes = new Set<number>();
  for (const transfer of evidence.transfers) {
    if (!integer(transfer.instructionIndex) || indexes.has(transfer.instructionIndex)) throw new Error("Ambiguous transfer instruction");
    indexes.add(transfer.instructionIndex);
  }
  const transfer = evidence.transfers.find(t => t.instructionIndex === intent.instructionIndex);
  if (!transfer || transfer.programId !== SYSTEM_PROGRAM || transfer.type !== "transfer" || transfer.source !== intent.source || transfer.destination !== intent.destination || transfer.amountLamports !== intent.amountLamports) throw new Error("Expected native SOL transfer missing");
  // Canonical amount parsing is shared with the existing bigint-backed accounting foundation.
  lamports(transfer.amountLamports);
  return Object.freeze({ intentId: intent.id, purpose: intent.purpose,
    receiptKey: `${intent.genesisHash}:${intent.signature}:${intent.instructionIndex}`,
    genesisHash: intent.genesisHash, signature: intent.signature, instructionIndex: intent.instructionIndex,
    source: intent.source, destination: intent.destination, amountLamports: intent.amountLamports, slot: evidence.slot });
}

/** Caller must atomically claim BOTH intentId and receiptKey alongside the journal. */
export function reconcileSettlementReceipt(incoming: Readonly<SettlementReceipt>, existing: Readonly<SettlementReceipt> | null): "new" | "duplicate" {
  if (existing === null) return "new";
  const fields: (keyof SettlementReceipt)[] = ["intentId", "purpose", "receiptKey", "genesisHash", "signature", "instructionIndex", "source", "destination", "amountLamports", "slot"];
  if (fields.some(field => existing[field] !== incoming[field])) throw new Error("Settlement replay conflicts with recorded intent");
  return "duplicate";
}
