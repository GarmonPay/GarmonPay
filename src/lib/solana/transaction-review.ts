/** Staging-only raw transaction review. Never signs, simulates, broadcasts or
 * authorizes execution. Expected instruction manifests must be built and decoded
 * by a trusted server after program/config/economics review, not by a browser.
 * Exact byte matching does not independently establish that a planned instruction
 * is safe. Lookup tables and partially signed transactions require separate review.
 */
import { createHash } from "node:crypto";
import { VersionedTransaction } from "@solana/web3.js";
import { lamports } from "./amounts";
import { validateWallet } from "./auth-crypto";
export type PreparedInstruction = { programId: string; accounts: readonly string[]; dataHash: string };
export type PreparedTransactionIntent = {
  kind: "launch" | "buy" | "sell"; payer: string; blockhash: string;
  messageHash: string; signerAddresses: readonly string[]; instructions: readonly PreparedInstruction[];
  issuedAt: number; expiresAt: number; lastValidBlockHeight: number;
  maxSpendLamports: string; minimumReceivedAtomic: string;
};
export type PreparedSimulation = { messageHash: string; error: unknown; observedAt: number;
  blockHeight: number; spentLamports: string; receivedAtomic: string };
export function transactionMessageHash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
export function reviewPreparedTransaction(encoded: string, expected: PreparedTransactionIntent, simulation: PreparedSimulation, now: number) {
  if(!["launch","buy","sell"].includes(expected.kind))throw new Error("Known transaction purpose required");
  validateWallet(expected.payer);validateWallet(expected.blockhash);
  if(![now,expected.issuedAt,expected.expiresAt,expected.lastValidBlockHeight,simulation.observedAt,simulation.blockHeight].every(value=>Number.isSafeInteger(value)&&value>=0))throw new Error("Integer quote bounds required");
  if(expected.issuedAt>now||expected.expiresAt<=now||expected.expiresAt-expected.issuedAt>60000||simulation.observedAt<expected.issuedAt||simulation.observedAt>now||now-simulation.observedAt>60000||simulation.blockHeight>expected.lastValidBlockHeight)throw new Error("Fresh unexpired transaction review required");
  if(typeof encoded!=="string"||encoded.length>1644||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error("Bounded base64 transaction required");
  const bytes=Buffer.from(encoded,"base64");if(bytes.length>1232||bytes.toString("base64")!==encoded)throw new Error("Canonical transaction encoding required");
  const transaction=VersionedTransaction.deserialize(bytes),message=transaction.message;
  if(message.addressTableLookups.length)throw new Error("Lookup-table review unavailable");
  const accounts=message.staticAccountKeys.map(key=>key.toBase58());
  const hash=transactionMessageHash(message.serialize());
  if(hash!==expected.messageHash||simulation.messageHash!==hash||message.recentBlockhash!==expected.blockhash||accounts[0]!==expected.payer)throw new Error("Transaction intent binding mismatch");
  if(simulation.error!==null)throw new Error("Successful trusted simulation evidence required");
  if(transaction.signatures.some(signature=>signature.some(byte=>byte!==0)))throw new Error("Previously signed transactions require separate review");
  const signers=accounts.slice(0,message.header.numRequiredSignatures);
  if(JSON.stringify(signers)!==JSON.stringify(expected.signerAddresses))throw new Error("Unexpected signing authority");
  const instructions=message.compiledInstructions.map(instruction=>({programId:accounts[instruction.programIdIndex],accounts:instruction.accountKeyIndexes.map(index=>accounts[index]),dataHash:transactionMessageHash(instruction.data)}));
  if(JSON.stringify(instructions)!==JSON.stringify(expected.instructions)||instructions.length===0)throw new Error("Unexpected program, accounts or instruction data");
  if(lamports(simulation.spentLamports)>lamports(expected.maxSpendLamports)||lamports(simulation.receivedAtomic)<lamports(expected.minimumReceivedAtomic))throw new Error("Simulation violates quoted spend or receive limits");
  return { messageHash:hash,kind:expected.kind,reviewPassed:true as const,executionEnabled:false as const,requiresProgramAndQuoteApproval:true as const };
}
