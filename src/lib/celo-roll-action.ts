import type { SupabaseClient } from '@supabase/supabase-js';
import { rollThreeDice,evaluateRoll } from './celo-engine';
/** The only main-table roll/timeout writer. Database owns turn claims and all settlement. */
export async function runCeloRoll(admin:SupabaseClient,userId:string,roomId:string,roundId:string,requestId:string,seq:number|null,timeout=false){
 const dice=timeout?null:rollThreeDice();
 const evaluated=dice?evaluateRoll(dice):{dice:null,result:'instant_loss',rollName:'TIMEOUT — FORFEIT',point:null,isCelo:false};
 const {data:claimed,error:claimError}=await admin.rpc('celo_claim_roll_atomic',{p_user:userId,p_room:roomId,p_round:roundId,p_request:requestId,p_seq:seq,p_timeout:timeout,p_payload:evaluated});
 if(claimError)throw new Error(claimError.message);
 if(claimed?.replay){
  return claimed.replay as Record<string,unknown>;
 }
 const roll=claimed?.payload??evaluated;
 if(!timeout)await new Promise(resolve=>setTimeout(resolve,1500));
 const {data,error}=await admin.rpc('celo_settle_roll_atomic',{p_user:userId,p_room:roomId,p_round:roundId,p_request:requestId,p_dice:roll.dice,p_result:roll.result,p_name:roll.rollName,p_point:roll.point,p_is_celo:roll.isCelo,p_timeout:timeout});
 if(error)throw new Error(error.message);
 return data as Record<string,unknown>;
}
