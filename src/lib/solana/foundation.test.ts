import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { decodeBase58, validateWallet, verifyWalletSignature, challengeMessage } from "./auth-crypto";
import { allocateLamports, formatSol, lamports, solToLamports, usdToLamports, withdrawalQuote } from "./amounts";
import { validateTokenMetadata } from "./token-metadata";
import { SOLANA_POLICY } from "./policy";
function encode(bytes: Buffer) {const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";let n=BigInt(`0x${bytes.toString("hex")}`);let s="";while(n){s=alphabet[Number(n%BigInt(58))]+s;n/=BigInt(58);}for(const b of Array.from(bytes)){if(b!==0)break;s="1"+s;}return s;}
describe("wallet ownership",()=>{
 it("verifies real Ed25519 signatures and rejects changed messages and impersonation",()=>{const {publicKey,privateKey}=generateKeyPairSync("ed25519");const bytes=publicKey.export({type:"spki",format:"der"}).subarray(-32);const address=encode(bytes);const message=challengeMessage(address,"nonce","https://garmonpay.com","2026-10-11T00:00:00Z","2026-10-11T00:05:00Z");const signature=sign(null,Buffer.from(message),privateKey).toString("base64");expect(verifyWalletSignature(address,message,signature)).toBe(true);expect(verifyWalletSignature(address,message+"tampered",signature)).toBe(false);expect(verifyWalletSignature("11111111111111111111111111111111",message,signature)).toBe(false);expect(decodeBase58(address)).toEqual(bytes);});
 it("rejects invalid keys and signature encodings",()=>{expect(()=>validateWallet("0invalid")).toThrow();expect(()=>validateWallet("111")).toThrow();expect(verifyWalletSignature("11111111111111111111111111111111","message","invalid")).toBe(false);});
});
describe("lamport economics",()=>{
 it("keeps exact integer precision beyond Number.MAX_SAFE_INTEGER",()=>{expect(lamports("9007199254740993").toString()).toBe("9007199254740993");expect(solToLamports("0.000000001")).toBe(BigInt(1));expect(formatSol(solToLamports("1.050000001"))).toBe("1.050000001");});
 it.each(["-1","1e9","0.0000000001","NaN","01"])("rejects invalid SOL amount %s",v=>{expect(()=>solToLamports(v)).toThrow();});
 it("caps withdrawal fee and enforces minimum",()=>{expect(withdrawalQuote(BigInt(100000000),BigInt(10000),100,BigInt(500000))).toEqual({gross:BigInt(100000000),fee:BigInt(500000),net:BigInt(99500000)});expect(()=>withdrawalQuote(BigInt(1),BigInt(2),100,BigInt(500000))).toThrow();});
 it("conserves allocation and rejects incomplete schedules",()=>{const result=allocateLamports(BigInt(101),{reserve:7000,service:3000},"reserve");expect(result).toEqual({reserve:BigInt(71),service:BigInt(30)});expect(()=>allocateLamports(BigInt(100),{reserve:7000},"reserve")).toThrow();});
 it("rounds rewards down and minima up with a fresh feed",()=>{expect(usdToLamports(BigInt(1),BigInt(3),1000,1000)).toBe(BigInt(333333333));expect(usdToLamports(BigInt(1),BigInt(3),1000,1000,true)).toBe(BigInt(333333334));expect(()=>usdToLamports(BigInt(1),BigInt(3),1000,62000)).toThrow();});
});
describe("launch protection",()=>{
 const input={name:"Garmon",symbol:"GPAY",description:"Project description",website:"https://example.com",social:""};
 it("validates metadata without fetching external links",()=>{expect(validateTokenMetadata(input).website).toBe("https://example.com/");});
 it.each([{symbol:"TOOLONGSYMBOL"},{name:"<script>"},{website:"javascript:alert(1)"},{website:"http://example.com"},{website:"https://127.0.0.1"},{website:"https://user:pass@example.com"}])("rejects unsafe input %j",change=>{expect(()=>validateTokenMetadata({...input,...change})).toThrow();});
 it("keeps financial features closed and approved amounts intact",()=>{expect(SOLANA_POLICY).toMatchObject({launchFeeLamports:"50000000",creatorClaimFeeBps:0,desiredMintSuffix:null,tokenLaunches:false,trading:false,withdrawals:false,custody:false,paidGames:false});expect(SOLANA_POLICY.tradingFee).toMatchObject({totalBps:175,platformBps:120,creatorBps:30});});
});
