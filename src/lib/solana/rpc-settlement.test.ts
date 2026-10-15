import {describe,it,expect,vi} from 'vitest';
import {readFinalizedSettlement,type SettlementRpc} from './rpc-settlement';
import type {SettlementIntent} from './settlement-evidence';
const source='11111111111111111111111111111111',destination='So11111111111111111111111111111111111111112',signature='1'.repeat(64);
const intent:SettlementIntent={id:'00000000-0000-4000-8000-000000000001',purpose:'deposit',genesisHash:source,source,destination,signature,amountLamports:'100',instructionIndex:0,minimumSlot:10,issuedAtSeconds:100,expiresAtSeconds:200};
function fixture(){
 const transaction={slot:11,blockTime:150,meta:{err:null as unknown},transaction:{signatures:[signature],message:{accountKeys:[{pubkey:{toString:()=>source},signer:true}],instructions:[{programId:{toString:()=>source},parsed:{type:'transfer',info:{source,destination,lamports:100}}}]}}};
 const status={confirmationStatus:'finalized',err:null as unknown,slot:11};
 const rpc:SettlementRpc={getGenesisHash:vi.fn(async()=>source),getSignatureStatuses:vi.fn(async()=>({value:[status]})),getParsedTransaction:vi.fn(async()=>transaction)};
 return {rpc,transaction,status};
}
describe('Trusted read-only settlement transport',()=>{
 it('requests finalized history and decodes exact native transfers without posting',async()=>{
  const {rpc}=fixture();expect(await readFinalizedSettlement(rpc,intent)).toMatchObject({receipt:{amountLamports:'100',intentId:intent.id},postingEnabled:false});
  expect(rpc.getParsedTransaction).toHaveBeenCalledWith(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
  expect(rpc.getSignatureStatuses).toHaveBeenCalledWith([signature],{searchTransactionHistory:true});
 });
 it.each(['processed','confirmed'])('rejects %s status',async confirmation=>{const f=fixture();f.status.confirmationStatus=confirmation;await expect(readFinalizedSettlement(f.rpc,intent)).rejects.toThrow();});
 it.each([99,101,Number.MAX_SAFE_INTEGER+1,1.5])('rejects incorrect or inexact amount %s',async amount=>{const f=fixture();f.transaction.transaction.message.instructions[0].parsed.info.lamports=amount;await expect(readFinalizedSettlement(f.rpc,intent)).rejects.toThrow();});
 it('rejects failed metadata, wrong slot and missing source signature',async()=>{
  for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.transaction.meta.err={failure:true};},(f:ReturnType<typeof fixture>)=>{f.status.slot=12;},(f:ReturnType<typeof fixture>)=>{f.transaction.transaction.message.accountKeys[0].signer=false;}]){const f=fixture();mutate(f);await expect(readFinalizedSettlement(f.rpc,intent)).rejects.toThrow();}
 });
 it('rejects wrong network and missing transaction',async()=>{
  const f=fixture();f.rpc.getGenesisHash=async()=>destination;await expect(readFinalizedSettlement(f.rpc,intent)).rejects.toThrow();
  const g=fixture();g.rpc.getParsedTransaction=async()=>null;await expect(readFinalizedSettlement(g.rpc,intent)).rejects.toThrow();
 });
});
