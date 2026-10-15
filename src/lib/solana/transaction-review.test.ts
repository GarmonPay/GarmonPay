import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { describe,expect,it } from "vitest";
import { reviewPreparedTransaction,transactionMessageHash,type PreparedTransactionIntent } from "./transaction-review";
const payer=Keypair.generate(),destination=Keypair.generate(),now=1000000,blockhash=Keypair.generate().publicKey.toBase58();
const instruction=SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:destination.publicKey,lamports:100});
const message=new TransactionMessage({payerKey:payer.publicKey,recentBlockhash:blockhash,instructions:[instruction]}).compileToV0Message();
const transaction=new VersionedTransaction(message),encoded=Buffer.from(transaction.serialize()).toString("base64");
const hash=transactionMessageHash(message.serialize());
const expected:PreparedTransactionIntent={kind:"buy",payer:payer.publicKey.toBase58(),blockhash,messageHash:hash,signerAddresses:[payer.publicKey.toBase58()],instructions:[{programId:SystemProgram.programId.toBase58(),accounts:[payer.publicKey.toBase58(),destination.publicKey.toBase58()],dataHash:transactionMessageHash(instruction.data)}],issuedAt:now,expiresAt:now+60000,lastValidBlockHeight:200,maxSpendLamports:"100",minimumReceivedAtomic:"1"};
const simulation={messageHash:hash,error:null,observedAt:now,blockHeight:100,spentLamports:"100",receivedAtomic:"1"};
describe("Staging transaction-envelope review",()=>{
 it("reviews real serialized synthetic transaction bytes without enabling execution",()=>{expect(reviewPreparedTransaction(encoded,expected,simulation,now)).toMatchObject({reviewPassed:true,executionEnabled:false});});
 it.each([{payer:destination.publicKey.toBase58()},{messageHash:"0".repeat(64)},{blockhash:destination.publicKey.toBase58()},{signerAddresses:[destination.publicKey.toBase58()]},{instructions:[{...expected.instructions[0],dataHash:"0".repeat(64)}]}])("rejects altered authorization %j",change=>{expect(()=>reviewPreparedTransaction(encoded,{...expected,...change},simulation,now)).toThrow();});
 it.each([{error:{InstructionError:[0,"failure"]}},{messageHash:"0".repeat(64)},{spentLamports:"101"},{receivedAtomic:"0"},{blockHeight:201},{observedAt:now+1}])("rejects failed or conflicting simulation evidence %j",change=>{expect(()=>reviewPreparedTransaction(encoded,expected,{...simulation,...change},now)).toThrow();});
 it("rejects an expired quote and a previously signed transaction",()=>{expect(()=>reviewPreparedTransaction(encoded,expected,simulation,now+60000)).toThrow();const signed=new VersionedTransaction(message);signed.sign([payer]);expect(()=>reviewPreparedTransaction(Buffer.from(signed.serialize()).toString("base64"),expected,simulation,now)).toThrow(/signed/);});
 it("rejects oversized or noncanonical transaction encoding",()=>{expect(()=>reviewPreparedTransaction("A".repeat(2000),expected,simulation,now)).toThrow();expect(()=>reviewPreparedTransaction(encoded+"\n",expected,simulation,now)).toThrow();});
});
