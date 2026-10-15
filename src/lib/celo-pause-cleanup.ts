import type {SupabaseClient} from '@supabase/supabase-js';
export function effectiveStakeSc(row:{stake_amount_sc?:number|null;entry_sc?:number|null;bet_cents?:number|null}){return Math.max(0,Math.floor(Number(row.stake_amount_sc??row.entry_sc??row.bet_cents??0)));}
export async function processExpiredPauseRoom(admin:SupabaseClient,room:{id:string;banker_id:string|null;paused_by?:string|null},_nowIso:string):Promise<{ok:boolean;reason?:string}>{
 const {data,error}=await admin.rpc('celo_cleanup_room_atomic',{p_room:room.id,p_pause:true});return error?{ok:false,reason:error.message}:data;
}
