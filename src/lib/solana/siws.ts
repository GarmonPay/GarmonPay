/** Server-side staging adapter for Wallet Standard's solana:signIn response.
 * The expected input must be recovered from a one-time server challenge record.
 * This module performs no wallet connection, session creation or activation.
 */
import { timingSafeEqual } from "node:crypto";
import { decodeBase58, validateWallet, verifyWalletSignature } from "./auth-crypto";
const statement = "Sign in to GarmonPay. This does not authorize a transaction or transfer.";
export type SiwsInput = { domain: string; address: string; statement: string; uri: string; version: "1"; chainId: "solana:mainnet" | "solana:devnet" | "solana:testnet"; nonce: string; issuedAt: string; expirationTime: string };
export function buildSiwsChallenge(address: string, nonce: string, origin: string, now: number, chainId: SiwsInput["chainId"] = "solana:devnet"): SiwsInput {
  validateWallet(address);
  const url = new URL(origin);
  const loopback = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!loopback && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Exact secure origin required");
  if(!/^[A-Za-z0-9]{8,64}$/.test(nonce) || !Number.isSafeInteger(now) || now < 0 || !["solana:mainnet","solana:devnet","solana:testnet"].includes(chainId)) throw new Error("Invalid sign-in challenge");
  return Object.freeze({ domain:url.host,address,statement,uri:url.origin,version:"1",chainId,nonce,issuedAt:new Date(now).toISOString(),expirationTime:new Date(now+300000).toISOString() });
}
export function siwsMessage(input: SiwsInput) {
  return `${input.domain} wants you to sign in with your Solana account:\n${input.address}\n\n${input.statement}\n\nURI: ${input.uri}\nVersion: ${input.version}\nChain ID: ${input.chainId}\nNonce: ${input.nonce}\nIssued At: ${input.issuedAt}\nExpiration Time: ${input.expirationTime}`;
}
export type SiwsOutput = { account: { address: string; publicKey: Uint8Array }; signedMessage: Uint8Array; signature: Uint8Array; signatureType?: string };
export function verifySiwsOutput(expected: SiwsInput, output: SiwsOutput, now: number): boolean {
  try {
    const issued = Date.parse(expected.issuedAt), expires = Date.parse(expected.expirationTime);
    if(!Number.isSafeInteger(now) || issued > now || expires <= now || expires-issued !== 300000) return false;
    const canonical = buildSiwsChallenge(expected.address,expected.nonce,expected.uri,issued,expected.chainId);
    if(siwsMessage(canonical) !== siwsMessage(expected)) return false;
    if(output.account.address !== expected.address || (output.signatureType !== undefined && output.signatureType !== "ed25519")) return false;
    if(!(output.account.publicKey instanceof Uint8Array) || !(output.signature instanceof Uint8Array) || !(output.signedMessage instanceof Uint8Array)) return false;
    const key = decodeBase58(expected.address), actualKey = Buffer.from(output.account.publicKey);
    const message = Buffer.from(siwsMessage(expected)), actualMessage = Buffer.from(output.signedMessage);
    if(actualKey.length !== 32 || output.signature.length !== 64 || actualMessage.length !== message.length || !timingSafeEqual(key,actualKey) || !timingSafeEqual(message,actualMessage)) return false;
    return verifyWalletSignature(expected.address,message.toString("utf8"),Buffer.from(output.signature).toString("base64"));
  } catch { return false; }
}
