import { createAdminClient } from '@/lib/supabase';
import { json } from '@/lib/solana/http';
import { memberSessionHash } from '@/lib/solana/members';
import { walletAuthEnabled } from '@/lib/solana/policy';
import {presentMembers,searchLegacyNames} from '@/lib/solana/member-presentation.server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!walletAuthEnabled())return json({members:[],status:'paused'});
 const params=new URL(request.url).searchParams, query=params.get('q'), username=params.get('username');
 if((query?.length||0)>32 || (username!==null&&!/^[a-z][a-z0-9_]{2,23}$/.test(username)))return json({error:'Invalid search'},400);
 const db=createAdminClient();if(!db)return json({error:'Member directory unavailable'},503);
 const hash=await memberSessionHash();
 const {data,error}=await db.rpc('gp_sol_member_directory',{p_query:query,p_username:username,p_hash:hash});
 if(error)return json({error:'Member directory unavailable'},503);try{return json({members:await presentMembers(db,query&&!username&&!data?.length?await searchLegacyNames(db,query,hash):data??[]),status:'available'});}catch{return json({error:'Member names unavailable. Please retry.'},503);}
}
