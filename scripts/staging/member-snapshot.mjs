// Private staging checksum. Prints counts and one digest; never prints profiles or keys.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {parse} from 'dotenv';
const envPath='/private/tmp/garmonpay-member-mobile-stage/.env.local';
if(statSync(envPath).mode&0o077) throw new Error('Staging environment file must be private');
const env=parse(readFileSync(envPath));
if(env.GARMONPAY_STAGING_SUPABASE_REF!=='bhxheuaoofiklsaurqlu'||env.NEXT_PUBLIC_SUPABASE_URL!=='https://bhxheuaoofiklsaurqlu.supabase.co') throw new Error('Staging configuration required');
const {createClient}=await import('@supabase/supabase-js');
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
function hash(value){return createHash('sha256').update(value??'').digest('hex');}
async function all(table,columns){
 const rows=[];
 for(let from=0;;from+=1000){
  const {data,error}=await db.from(table).select(columns).range(from,from+999);
  if(error) throw new Error(table+' read failed');
  rows.push(...data);
  if(data.length<1000) break;
 }
 return rows;
}
const members=await all('gp_sol_members','id,username,biography,picture,wallet_public,referral_code,referred_by');
const follows=await all('gp_sol_member_follows','follower,followed');
const identities=await all('gp_sol_identities','wallet_address,banned');
const sessions=await all('gp_sol_sessions','token_hash,wallet_address,expires_at,revoked_at');
const snapshot={
 members:members.map(row=>({id:row.id,username:row.username,biography:row.biography,picture:row.picture?hash(row.picture):null,walletPublic:row.wallet_public,referral:hash(row.referral_code??''),referredBy:row.referred_by})).sort((a,b)=>a.id.localeCompare(b.id)),
 follows:follows.map(row=>({follower:row.follower,followed:row.followed})).sort((a,b)=>a.follower.localeCompare(b.follower)||a.followed.localeCompare(b.followed)),
 identities:identities.map(row=>({wallet:hash(row.wallet_address),banned:row.banned})).sort((a,b)=>a.wallet.localeCompare(b.wallet)),
 sessions:sessions.map(row=>({token:hash(row.token_hash),wallet:hash(row.wallet_address),expiresAt:row.expires_at,revokedAt:row.revoked_at})).sort((a,b)=>a.token.localeCompare(b.token)),
};
const body=JSON.stringify(snapshot);
const digest=hash(body);
const out=process.env.MEMBER_SNAPSHOT_PATH;
if(out){if(!out.startsWith('/private/tmp/garmonpay-https-runtime/')) throw new Error('Unexpected snapshot path');writeFileSync(out,body,{mode:0o600});}
console.log(JSON.stringify({digest,members:snapshot.members.length,photos:snapshot.members.filter(row=>row.picture).length,referrals:snapshot.members.filter(row=>row.referredBy).length,follows:snapshot.follows.length,identities:snapshot.identities.length,sessions:snapshot.sessions.length}));
