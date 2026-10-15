import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { SealedMintKeypair } from "./mint-keypair";
describe("ordinary mint signing", () => {
 it("accepts an ordinary mint, proves its signing key and wipes the input", () => {
  const pair = Keypair.generate(), address = pair.publicKey.toBase58();
  expect(address.endsWith("gpay")).toBe(false);
  const input = Uint8Array.from(pair.secretKey), sealed = SealedMintKeypair.seal(address,input);
  expect(input.every(n=>n===0)).toBe(true);
  const signer = sealed.ephemeralSigner(), message = new TextEncoder().encode("ordinary mint proof");
  expect(nacl.sign.detached.verify(message,nacl.sign.detached(message,signer.secretKey),pair.publicKey.toBytes())).toBe(true);
  expect(nacl.sign.detached.verify(message,sealed.sign(message),pair.publicKey.toBytes())).toBe(true);
  expect(JSON.stringify(sealed)).toEqual(JSON.stringify({publicKey:address}));
  signer.secretKey.fill(0); sealed.destroy(); pair.secretKey.fill(0);
  expect(()=>sealed.ephemeralSigner()).toThrow(/no longer/);
 });
 it("rejects a mismatched or corrupt signing key and wipes rejected input", () => {
  const pair=Keypair.generate(), input=Uint8Array.from(pair.secretKey);
  expect(()=>SealedMintKeypair.seal(Keypair.generate().publicKey.toBase58(),input)).toThrow(/does not match/);
  expect(input.every(n=>n===0)).toBe(true);
  expect(()=>SealedMintKeypair.seal(pair.publicKey.toBase58(),new Uint8Array(64))).toThrow();
  pair.secretKey.fill(0);
 });
});
