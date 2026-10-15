import {NextResponse} from 'next/server';
import {isCronAuthorized} from '@/lib/cron-auth';
import {createAdminClient} from '@/lib/supabase';
export const runtime='nodejs';
async function cleanup(request:Request){
 if(!isCronAuthorized(request))return NextResponse.json({message:'Unauthorized'},{status:401});
 const admin=createAdminClient();if(!admin)return NextResponse.json({message:'Service unavailable'},{status:503});
 const {data:rooms,error}=await admin.from('celo_rooms').select('id,paused_at,pause_expires_at,last_activity,status').neq('status','cancelled');
 if(error)return NextResponse.json({error:error.message},{status:500});
 const processed:string[]=[],skipped:{roomId:string;reason:string}[]=[];
 for(const room of rooms??[]){
  const pause=!!room.paused_at,expiry=Date.parse(pause?room.pause_expires_at:room.last_activity);
  if(!Number.isFinite(expiry)||expiry>Date.now()-(pause?0:600000))continue;
  const {data,error:failure}=await admin.rpc('celo_cleanup_room_atomic',{p_room:room.id,p_pause:pause});
  if(failure||!data?.ok)skipped.push({roomId:room.id,reason:failure?.message??data?.reason??'not eligible'});else processed.push(room.id);
 }
 return NextResponse.json({ok:true,processed,skipped});
}
export const GET=cleanup;export const POST=cleanup;
