import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSiwsChallenge, siwsMessage, verifySiwsOutput } from "./siws";
const keys=generateKeyPairSync("ed25519"), bytes=keys.publicKey.export({type:"spki",format:"der"}).subarray(-32);
function encode(bytes:Buffer){const chars="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";let n=BigInt(`0x${bytes.toString("hex")}`),text="";while(n){text=chars[Number(n%BigInt(58))]+text;n/=BigInt(58);}for(const b of bytes){if(b)break;text="1"+text;}return text;}
const wallet=encode(bytes),now=Date.parse("2026-10-12T12:00:00Z");
const input=buildSiwsChallenge(wallet,"0123456789abcdef","https://staging.example.invalid",now);
const message=Buffer.from(siwsMessage(input));
const output={account:{address:wallet,publicKey:bytes},signedMessage:message,signature:sign(null,message,keys.privateKey)};
describe("Staging Wallet Standard sign-in adapter",()=>{
 it("verifies exact domain-bound bytes with a real synthetic Ed25519 signature",()=>{expect(verifySiwsOutput(input,output,now)).toBe(true);expect(input.chainId).toBe("solana:devnet");});
 it.each(["http://example.com","https://user:pass@example.com","https://example.com/path","https://example.com/?x=1"])("rejects ambiguous origin %s",origin=>{expect(()=>buildSiwsChallenge(wallet,"0123456789abcdef",origin,now)).toThrow();});
 it.each(["short","nonce_with_separator","nonce-with-dash"])("rejects nonstandard nonce %s",nonce=>{expect(()=>buildSiwsChallenge(wallet,nonce,"https://example.com",now)).toThrow();});
 it("rejects wrong account, signature type, public key and changed signed message",()=>{
  expect(verifySiwsOutput(input,{...output,account:{...output.account,address:"11111111111111111111111111111111"}},now)).toBe(false);
  expect(verifySiwsOutput(input,{...output,signatureType:"secp256k1"},now)).toBe(false);
  expect(verifySiwsOutput(input,{...output,account:{...output.account,publicKey:Buffer.alloc(32)}},now)).toBe(false);
  expect(verifySiwsOutput(input,{...output,signedMessage:Buffer.from(message.toString()+"altered")},now)).toBe(false);
 });
 it("rejects expiry and future issuance",()=>{expect(verifySiwsOutput(input,output,now+300000)).toBe(false);expect(verifySiwsOutput(input,output,now-1)).toBe(false);});
 it("supports an exact loopback origin for synthetic local testing",()=>{expect(buildSiwsChallenge(wallet,"0123456789abcdef","http://127.0.0.1:4324",now).domain).toBe("127.0.0.1:4324");});
});
