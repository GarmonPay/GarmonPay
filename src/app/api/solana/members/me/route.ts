import { createAdminClient } from '@/lib/supabase';
import { json,sameOrigin,smallJson } from '@/lib/solana/http';
import { memberSessionHash,profileInput,memberActorId } from '@/lib/solana/members';
import { normalizeMemberPicture } from '@/lib/solana/member-picture';
import {presentMembers,saveLegacyDisplayName} from '@/lib/solana/member-presentation.server';
export const dynamic='force-dynamic';
export async function GET(){
 const hash=await memberSessionHash();if(!hash)return json({error:'Wallet sign-in required'},401);
 const db=createAdminClient();if(!db)return json({error:'Profiles unavailable'},503);
 const {data,error}=await db.rpc('gp_sol_member_me',{p_hash:hash});if(error)return json({error:'Profiles unavailable'},503);if(!data)return json({error:'Wallet sign-in required'},401);try{return json({member:(await presentMembers(db,[data]))[0]});}catch{return json({error:'Member names unavailable. Please retry.'},503);}
}
export async function PATCH(request:Request){
 if(!sameOrigin(request))return json({error:'Origin rejected'},403);
 const hash=await memberSessionHash();if(!hash)return json({error:'Wallet sign-in required'},401);
 try{
 const body=await smallJson(request),actorId=memberActorId(body),input=profileInput(body),db=createAdminClient();if(!db)return json({error:'Profiles unavailable'},503);
 const {data:actor,error:actorError}=await db.rpc('gp_sol_member_me',{p_hash:hash});
 if(actorError)return json({error:'Profiles unavailable'},503);if(!actor)return json({error:'Wallet sign-in required'},401);
 if(actor.id!==actorId)return json({error:'Wallet session changed. Refresh before saving.'},409);
 input.p_picture=await normalizeMemberPicture(input.p_picture as string|null);
 let {error}=await db.rpc('gp_sol_member_save',{p_hash:hash,...input});
 if(error?.code==='PGRST202'){
  const {p_display,...legacy}=input;legacy.p_username=legacy.p_username??actor.username;
  ({error}=await db.rpc('gp_sol_member_save',{p_hash:hash,...legacy}));
  if(!error&&p_display!==null)await saveLegacyDisplayName(db,actor.id,p_display);
 }
 if(error)return json({error:'Unable to save that profile. The public handle may already be taken.'},409);
 return GET();
 }catch(e){return json({error:e instanceof Error?e.message:'Invalid profile'},400);}
}
