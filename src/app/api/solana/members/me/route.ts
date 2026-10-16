import { assertUsernameChange } from "@/lib/member-platform/username-cooldown";
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
 if(input.p_username && input.p_username!==actor.username){
  const policy=await db.rpc('gp_sol_username_policy');
  if(policy.error||policy.data!=='seven-day-atomic-v1')return json({error:'Username changes await the reviewed seven-day database policy. Your current username was preserved.'},409);
  const history=await db.from('gp_sol_members').select('username,wallet_address,username_changed_at').eq('id',actor.id).maybeSingle();
  if(history.error||!history.data)return json({error:'Username history is unavailable. Nothing was changed.'},503);
  assertUsernameChange({currentHandle:history.data.username,nextHandle:input.p_username,walletAddress:actor.wallet,recordedWalletAddress:history.data.wallet_address,lastChangedAt:history.data.username_changed_at,nowMs:Date.now()});
 }
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
