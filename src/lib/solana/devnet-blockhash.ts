import { Connection, Transaction } from "@solana/web3.js";
import { CLUSTER_GENESIS } from "./platform-setup";
import { DevnetSubmissionError } from "./devnet-submission";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function encodeBase58(bytes: Uint8Array) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let index = zeros; index < bytes.length; index += 1) {
    let carry = bytes[index];
    for (let digit = 0; digit < digits.length; digit += 1) {
      carry += digits[digit] << 8;
      digits[digit] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return "1".repeat(zeros) + digits.reverse().map(digit => ALPHABET[digit]).join("");
}

export type ChainSight = "absent" | "unknown" | "processed" | "confirmed" | "finalized" | "failed";
export type BroadcastDecision = "broadcast" | "confirm-existing" | "expired" | "rejected" | "unknown";

/** Decide from cluster height and signature status. A signed message is never rewritten here. */
export function decideDevnetBroadcast(input: {
  genesis: string;
  blockhashValid: boolean | null;
  currentBlockHeight: number;
  lastValidBlockHeight: number;
  chainStatus: ChainSight;
}): BroadcastDecision {
  if (input.genesis !== CLUSTER_GENESIS.devnet) return "rejected";
  if (input.chainStatus === "processed" || input.chainStatus === "confirmed" || input.chainStatus === "finalized" || input.chainStatus === "failed") return "confirm-existing";
  if (input.chainStatus === "unknown") return "unknown";
  if (!Number.isSafeInteger(input.currentBlockHeight) || !Number.isSafeInteger(input.lastValidBlockHeight)) return "unknown";
  if (input.currentBlockHeight > input.lastValidBlockHeight) return "expired";
  if (input.blockhashValid !== true) return "rejected";
  return "broadcast";
}

export class DevnetBlockhashError extends Error {
  constructor(
    message: string,
    readonly code: "BLOCKHASH_EXPIRED" | "BLOCKHASH_REJECTED" | "BLOCKHASH_UNKNOWN" | "SIMULATION_FAILED",
    readonly diagnostics?: { signature?: string; blockhash?: string; lastValidBlockHeight?: number; currentBlockHeight?: number; rpc: string },
  ) {
    super(message);
  }
}

export async function gateDevnetBroadcast(connection: Connection, transaction: Transaction, lastValidBlockHeight: number) {
  if (!Number.isSafeInteger(lastValidBlockHeight) || lastValidBlockHeight < 0) {
    throw new DevnetBlockhashError("Devnet blockhash expiry is missing. Nothing was submitted.", "BLOCKHASH_REJECTED");
  }
  if (!transaction.recentBlockhash) throw new DevnetBlockhashError("A devnet blockhash is required. Nothing was submitted.", "BLOCKHASH_REJECTED");
  const raw = transaction.signatures.find(entry => entry.signature)?.signature;
  if (!raw) throw new DevnetBlockhashError("The wallet signature is missing. Nothing was submitted.", "BLOCKHASH_REJECTED");
  const signature = encodeBase58(raw);
  const genesis = await connection.getGenesisHash();
  let chainStatus: ChainSight = "absent";
  try {
    const found = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const row = found.value[0];
    if (!row) chainStatus = "absent";
    else if (row.err) chainStatus = "failed";
    else if (row.confirmationStatus === "finalized" || row.confirmationStatus === "confirmed" || row.confirmationStatus === "processed") chainStatus = row.confirmationStatus;
    else chainStatus = "unknown";
  } catch {
    chainStatus = "unknown";
  }
  const currentBlockHeight = await connection.getBlockHeight("confirmed");
  let blockhashValid: boolean | null = null;
  try { blockhashValid = (await connection.isBlockhashValid(transaction.recentBlockhash, { commitment: "confirmed" })).value; }
  catch { blockhashValid = null; }
  const decision = decideDevnetBroadcast({ genesis, blockhashValid, currentBlockHeight, lastValidBlockHeight, chainStatus });
  const diagnostics = { signature, blockhash: transaction.recentBlockhash, lastValidBlockHeight, currentBlockHeight, rpc: "https://api.devnet.solana.com" };
  console.info("[garmonpay-devnet]", "broadcast-gate", { decision, chainStatus, blockhashValid, currentBlockHeight, lastValidBlockHeight, signature });
  if (decision === "expired") throw new DevnetBlockhashError("The Devnet blockhash expired before the signed transaction was sent. The signature was not found on Devnet.", "BLOCKHASH_EXPIRED", diagnostics);
  if (decision === "rejected") throw new DevnetBlockhashError("This signed transaction is not valid on Solana Devnet. Set Phantom to Devnet and press Launch again. The signature was not found on Devnet.", "BLOCKHASH_REJECTED", diagnostics);
  if (decision === "unknown") throw new DevnetBlockhashError("Devnet could not check whether this signature already exists. Check Solana Explorer before trying again.", "BLOCKHASH_UNKNOWN", diagnostics);
  return { decision, signature, blockhash: transaction.recentBlockhash, lastValidBlockHeight, currentBlockHeight };
}

export function classifySendFailure(message: string, chainStatus: ChainSight): "confirm-existing" | "expired" | "not-submitted" | "ambiguous" {
  if (chainStatus === "processed" || chainStatus === "confirmed" || chainStatus === "finalized" || chainStatus === "failed") return "confirm-existing";
  if (chainStatus === "unknown") return "ambiguous";
  if (/already been processed|AlreadyProcessed/i.test(message)) return "confirm-existing";
  if (/blockhash not found|blockhash.*expired|BlockhashNotFound/i.test(message)) return "expired";
  if (/preflight|simulation failed|insufficient funds|custom program error|insufficient lamports/i.test(message)) return "not-submitted";
  return "ambiguous";
}

/** Send the exact signed bytes once. A later error never builds a different transaction. */
export async function sendExactSignedTransaction(connection: Connection, serialized: string, lastValidBlockHeight: number) {
  const transaction = Transaction.from(Buffer.from(serialized, "base64"));
  const gate = await gateDevnetBroadcast(connection, transaction, lastValidBlockHeight);
  if (gate.decision === "confirm-existing") return gate;
  try {
    const signature = await connection.sendRawTransaction(Buffer.from(serialized, "base64"), { skipPreflight: false, maxRetries: 0 });
    if (signature !== gate.signature) throw new DevnetBlockhashError("Devnet returned a different signature from the signed transaction. Check Explorer before trying again.", "BLOCKHASH_UNKNOWN", { signature: gate.signature, blockhash: gate.blockhash, lastValidBlockHeight, currentBlockHeight: gate.currentBlockHeight, rpc: "https://api.devnet.solana.com" });
    return gate;
  } catch (error) {
    if (error instanceof DevnetBlockhashError) throw error;
    const message = error instanceof Error ? error.message : "Devnet submission failed";
    let chainStatus: ChainSight = "unknown";
    try {
      const found = await connection.getSignatureStatuses([gate.signature], { searchTransactionHistory: true });
      const row = found.value[0];
      if (!row) chainStatus = "absent";
      else if (row.err) chainStatus = "failed";
      else if (row.confirmationStatus === "finalized" || row.confirmationStatus === "confirmed" || row.confirmationStatus === "processed") chainStatus = row.confirmationStatus;
      else chainStatus = "unknown";
    } catch { chainStatus = "unknown"; }
    const kind = classifySendFailure(message, chainStatus);
    console.info("[garmonpay-devnet]", "send-failure", { kind, signature: gate.signature, lastValidBlockHeight, currentBlockHeight: gate.currentBlockHeight });
    if (kind === "confirm-existing") return { ...gate, decision: "confirm-existing" as const };
    const diagnostics = { signature: gate.signature, blockhash: gate.blockhash, lastValidBlockHeight, currentBlockHeight: gate.currentBlockHeight, rpc: "https://api.devnet.solana.com" };
    if (kind === "expired") throw new DevnetBlockhashError("The Devnet blockhash expired before Devnet accepted the signed transaction. The signature was not found.", "BLOCKHASH_EXPIRED", diagnostics);
    if (kind === "not-submitted") throw new DevnetBlockhashError(`Devnet rejected the transaction before accepting it. The signature was not found. ${message.replace(/[1-9A-HJ-NP-Za-km-z]{80,}/g, "[redacted]").slice(0, 140)}`, "SIMULATION_FAILED", diagnostics);
    throw new DevnetSubmissionError(gate.signature);
  }
}
