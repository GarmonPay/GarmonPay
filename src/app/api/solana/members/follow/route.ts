import { createAdminClient } from '@/lib/supabase';
import { json,sameOrigin,smallJson } from '@/lib/solana/http';
import { memberSessionHash,memberActorId } from '@/lib/solana/members';
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Origin rejected'},403);
 const hash=await memberSessionHash();if(!hash)return json({error:'Wallet sign-in required'},401);
 try{const body=await smallJson(request),actorId=memberActorId(body);if(typeof body.memberId!=='string'||!/^[0-9a-f-]{36}$/.test(body.memberId)||typeof body.follow!=='boolean')return json({error:'Invalid member'},400);
 const db=createAdminClient();if(!db)return json({error:'Follows unavailable'},503);
 const {data:actor,error:actorError}=await db.rpc('gp_sol_member_me',{p_hash:hash});
 if(actorError)return json({error:'Follows unavailable'},503);if(!actor)return json({error:'Wallet sign-in required'},401);
 if(actor.id!==actorId)return json({error:'Wallet session changed. Refresh before following.'},409);
 const {error}=await db.rpc('gp_sol_member_follow',{p_hash:hash,p_target:body.memberId,p_follow:body.follow});return error?json({error:'Unable to update follow'},409):json({ok:true});
 }catch{return json({error:'Invalid request'},400);}
}
