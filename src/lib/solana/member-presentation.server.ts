/** Private compatibility adapter: public responses receive names, never hidden wallet addresses. */
export async function presentMembers(db:any, members:any[]) {
 const missing=members.filter(m=>typeof m.displayName!=='string');
 if(!missing.length)return members;
 const {data:rows,error}=await db.from('gp_sol_members').select('id,wallet_address').in('id',missing.map(m=>m.id));
 if(error)throw new Error('Member names unavailable. Please retry.');
 const wallets=(rows??[]).map((m:any)=>m.wallet_address);
 if(!wallets.length)return members;
 const {data:identities,error:identityError}=await db.from('gp_sol_identities').select('wallet_address,display_name').in('wallet_address',wallets);
 if(identityError)throw new Error('Member names unavailable. Please retry.');
 const names=new Map((identities??[]).map((i:any)=>[i.wallet_address,i.display_name??'']));
 const byId=new Map((rows??[]).map((r:any)=>[r.id,names.get(r.wallet_address)??'']));
 return members.map(m=>typeof m.displayName==='string'?m:{...m,displayName:byId.get(m.id)??''});
}
export async function saveLegacyDisplayName(db:any,actorId:string,displayName:string){
 const {data,error}=await db.from('gp_sol_members').select('wallet_address').eq('id',actorId).single();
 if(error||!data)throw new Error('Profile saved, but the display name could not be saved. Please retry.');
 const result=await db.from('gp_sol_identities').update({display_name:displayName}).eq('wallet_address',data.wallet_address);
 if(result.error)throw new Error('Profile saved, but the display name could not be saved. Please retry.');
}
export async function searchLegacyNames(db:any, query:string, hash:string|null){
 const escaped=query.replace(/[\\%_]/g,'\\$&');
 const {data:identities,error}=await db.from('gp_sol_identities').select('wallet_address').eq('banned',false).ilike('display_name','%'+escaped+'%').limit(30);
 if(error)throw new Error('Member search unavailable.');if(!identities?.length)return [];
 const {data:rows,error:memberError}=await db.from('gp_sol_members').select('username').in('wallet_address',identities.map((i:any)=>i.wallet_address));
 if(memberError)throw new Error('Member search unavailable.');
 const results=await Promise.all((rows??[]).slice(0,30).map((r:any)=>db.rpc('gp_sol_member_directory',{p_query:null,p_username:r.username,p_hash:hash})));
 if(results.some(r=>r.error))throw new Error('Member search unavailable.');return results.flatMap(r=>r.data??[]);
}
