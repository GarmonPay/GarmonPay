/** Server-only, read-only transport boundary. Never accepts browser RPC evidence. */
import {validateSettlementEvidence,type SettlementIntent} from './settlement-evidence';
import {validateWallet} from './auth-crypto';
type ParsedTransaction={slot:number;blockTime?:number|null;meta:{err:unknown}|null;transaction:{signatures:string[];message:{accountKeys:{pubkey:{toString():string};signer:boolean}[];instructions:unknown[]}}};
export type SettlementRpc={
 getGenesisHash():Promise<string>;
 getSignatureStatuses(signatures:string[],config:{searchTransactionHistory:true}):Promise<{value:({confirmationStatus?:string|null;err:unknown;slot:number}|null)[]}>;
 getParsedTransaction(signature:string,config:{commitment:'finalized';maxSupportedTransactionVersion:0}):Promise<ParsedTransaction|null>;
};
export async function readFinalizedSettlement(rpc:SettlementRpc,intent:SettlementIntent){
 const [genesis,statuses,transaction]=await Promise.all([
  rpc.getGenesisHash(),rpc.getSignatureStatuses([intent.signature],{searchTransactionHistory:true}),
  rpc.getParsedTransaction(intent.signature,{commitment:'finalized',maxSupportedTransactionVersion:0}),
 ]);
 const status=statuses.value[0];
 if(statuses.value.length!==1 || !status || status.confirmationStatus!=='finalized' || status.err!==null || !transaction || !transaction.meta || transaction.meta.err!==null || transaction.slot!==status.slot || transaction.transaction.signatures[0]!==intent.signature) throw new Error('Successful finalized transaction unavailable');
 const keys=transaction.transaction.message.accountKeys;
 if(!Array.isArray(keys) || keys.length>256) throw new Error('Unsupported transaction accounts');
 const signers=keys.filter(k=>k.signer===true).map(k=>validateWallet(k.pubkey.toString()));
 const instructions=transaction.transaction.message.instructions;
 if(!Array.isArray(instructions) || instructions.length>64) throw new Error('Unsupported transaction instructions');
 const transfers: {instructionIndex:number;programId:string;type:string;source:string;destination:string;amountLamports:string}[]=[];
 instructions.forEach((instruction,index)=>{
  if(!instruction || typeof instruction!=='object') throw new Error('Invalid RPC instruction');
  const row=instruction as {programId?:{toString():string};parsed?:{type?:string;info?:{source?:string;destination?:string;lamports?:number}}};
  if(row.programId?.toString()!=='11111111111111111111111111111111' || row.parsed?.type!=='transfer')return;
  const info=row.parsed.info;
  if(!info || !Number.isSafeInteger(info.lamports) || info.lamports!<=0 || typeof info.source!=='string' || typeof info.destination!=='string') throw new Error('Exact safe native transfer required');
  transfers.push({instructionIndex:index,programId:row.programId.toString(),type:'transfer',source:validateWallet(info.source),destination:validateWallet(info.destination),amountLamports:String(info.lamports)});
 });
 const receipt=validateSettlementEvidence(intent,{genesisHash:genesis,signature:intent.signature,confirmationStatus:'finalized',error:null,slot:transaction.slot,blockTimeSeconds:transaction.blockTime??null,signers,transfers});
 return {receipt,blockTimeSeconds:transaction.blockTime!,postingEnabled:false as const};
}
