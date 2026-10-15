/** Timeouts use the same transactional roll writer as normal rolls. */
import type {SupabaseClient} from '@supabase/supabase-js';
import {runCeloRoll} from './celo-roll-action';
export type CeloPlayerRollTimeoutRoom={id:string;banker_id:string;platform_fee_pct:number};
export type CeloPlayerRollTimeoutRound={id:string;status?:string;pending_roll_id?:string|null;pending_roll_payload?:{dice?:unknown}|null;roll_seq?:number;roller_user_id?:string|null;roll_animation_start_at?:string|null};
export type ResolvePlayerRollTimeoutResult={ok:true;body:Record<string,unknown>}|{ok:false;status:number;error:string};
export async function resolvePlayerRollTimeout(admin:SupabaseClient,ctx:{room:CeloPlayerRollTimeoutRoom;round:CeloPlayerRollTimeoutRound;feePct:number}):Promise<ResolvePlayerRollTimeoutResult>{
 try{
  const pending=ctx.round;
  if(pending.pending_roll_id&&Array.isArray(pending.pending_roll_payload?.dice)){
   const actor=pending.status==='banker_rolling'?ctx.room.banker_id:pending.roller_user_id;
   if(!actor||Date.now()-Date.parse(pending.roll_animation_start_at??'')<30000)return {ok:false,status:409,error:'Accepted roll is still settling'};
   return {ok:true,body:await runCeloRoll(admin,actor,ctx.room.id,pending.id,pending.pending_roll_id,pending.roll_seq??0,false)};
  }
  return {ok:true,body:await runCeloRoll(admin,ctx.room.banker_id,ctx.room.id,ctx.round.id,crypto.randomUUID(),null,true)};}catch(error){return {ok:false,status:409,error:error instanceof Error?error.message:'Timeout settlement failed'};}
}
