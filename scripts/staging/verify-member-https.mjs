// Automated HTTPS transport + real signature cryptography; not wallet-device acceptance.
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {writeFile,access} from 'node:fs/promises';
import sharp from 'sharp';
import {createClient} from '@supabase/supabase-js';
const origin=new URL(process.env.MEMBER_STAGING_ORIGIN??'');
assert.equal(origin.protocol,'https:');assert.ok(origin.hostname.endsWith('.trycloudflare.com'));
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes){let n=BigInt('0x'+bytes.toString('hex')),result='';while(n){result=alphabet[Number(n%58n)]+result;n/=58n;}for(const byte of bytes){if(byte!==0)break;result='1'+result;}return result;}
function actor(){const pair=generateKeyPairSync('ed25519');return {pair,wallet:base58(pair.publicKey.export({format:'der',type:'spki'}).subarray(-32)),cookies:new Map()};}
const a=actor(),b=actor(),checks=[];
async function request(who,path,method='GET',body,requestOrigin=origin.origin){
 const options={method,redirect:'manual',headers:{origin:requestOrigin,'content-type':'application/json',cookie:[...who.cookies].map(([name,value])=>name+'='+value).join('; ')},...(body?{body:JSON.stringify(body)}:{})};
 let response=await fetch(new URL(path,origin),options);
 if(response.status===429){
  const seconds=Number(response.headers.get('retry-after')??60);
  await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,Math.min(60000,Math.max(1000,seconds*1000))));
  response=await fetch(new URL(path,origin),options);
 }
 for(const cookie of response.headers.getSetCookie()){
  const [name,value]=cookie.split(';')[0].split('=');if(value)who.cookies.set(name,value);else who.cookies.delete(name);
  if(value&&name==='gp-solana-session'){assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Strict/i);}
 }
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={error:text};}return {status:response.status,data};
}
async function login(who,referralCode,testReplay=false){
 const challenge=await request(who,'/api/solana/auth/challenge','POST',{wallet:who.wallet});assert.equal(challenge.status,200);
 const signature=sign(null,Buffer.from(challenge.data.message),who.pair.privateKey).toString('base64');
 const payload={challengeId:challenge.data.challengeId,signature,...(referralCode?{referralCode}:{})};
 const replay={cookies:new Map(who.cookies)};
 const verified=await request(who,'/api/solana/auth/verify','POST',payload);assert.equal(verified.status,200);assert.equal('token' in verified.data,false);
 if(testReplay)assert.equal((await request(replay,'/api/solana/auth/verify','POST',payload)).status,401);
 const own=await request(who,'/api/solana/members/me');assert.equal(own.status,200);assert.equal(own.data.member.wallet,who.wallet);return own.data.member;
}
const first=await login(a,undefined,true);const second=await login(b,first.referralCode);assert.notEqual(first.id,second.id);
checks.push('Independent signed test wallets create separate permanent accounts over HTTPS with secure session cookies');
const name='qa_'+randomBytes(6).toString('hex');
const picture='data:image/png;base64,'+(await sharp({create:{width:64,height:64,channels:3,background:'#6c2aaa'}}).withMetadata().png().toBuffer()).toString('base64');
assert.equal((await request(a,'/api/solana/members/me','PATCH',{actorId:first.id,username:name,biography:'Automated staging test',picture,walletPublic:false})).status,200);
const saved=(await request(a,'/api/solana/members/me')).data.member;assert.equal(saved.username,name);assert.match(saved.picture,/^data:image\/jpeg;base64,/);assert.equal(saved.walletPublic,false);
assert.equal((await request(b,'/api/solana/members/me','PATCH',{actorId:second.id,username:name,biography:'',picture:null,walletPublic:true})).status,409);
assert.equal((await request(b,'/api/solana/members/me','PATCH',{actorId:first.id,username:'stale_actor',biography:'',picture:null,walletPublic:true})).status,409);
checks.push('Profile photo normalization, reload persistence, unique usernames and cross-account write rejection');
const directory=await request(b,'/api/solana/members?username='+name);assert.equal(directory.data.members[0].wallet,null);
for(let i=0;i<2;i++)assert.equal((await request(b,'/api/solana/members/follow','POST',{actorId:second.id,memberId:first.id,follow:true})).status,200);
assert.equal((await request(a,'/api/solana/members/me')).data.member.referrals,1);
assert.equal((await request(b,'/api/solana/members?username='+name)).data.members[0].followers,1);
assert.equal((await login(b,first.referralCode)).id,second.id);assert.equal((await request(a,'/api/solana/members/me')).data.member.referrals,1);
assert.equal((await request(b,'/api/solana/members/follow','POST',{actorId:second.id,memberId:first.id,follow:false})).status,200);
checks.push('Wallet privacy, idempotent follow/unfollow and first-signup-only referrals');
assert.equal((await request(a,'/api/solana/members/me','PATCH',{actorId:first.id,username:name,biography:'',picture:null,walletPublic:true},'https://attacker.invalid')).status,403);
for(const path of ['/api/wallet/fund','/api/withdraw','/api/solana/launches'])assert.equal((await request(a,path,'POST',{})).status,503);
assert.equal((await fetch(new URL('/staging-fixture/login?actor=a',origin))).status,404);
 assert.equal((await fetch(new URL('/admin',origin))).status,404);
const rejected=actor();const badChallenge=await request(rejected,'/api/solana/auth/challenge','POST',{wallet:rejected.wallet});assert.equal(badChallenge.status,200);
assert.equal((await request(rejected,'/api/solana/auth/verify','POST',{challengeId:badChallenge.data.challengeId,signature:sign(null,Buffer.from(badChallenge.data.message),a.pair.privateKey).toString('base64')})).status,401);
assert.equal((await request(rejected,'/api/solana/members/me')).status,401);
assert.equal((await request(a,'/api/solana/auth/logout','POST',{})).status,200);assert.equal((await request(a,'/api/solana/members/me')).status,401);
checks.push('Consumed challenge replay and forged signatures rejected; Origin protection, fixture/admin exclusion, denied financial mutations and logout revocation');
let applicationRestartPersistence=false;
if(process.env.MEMBER_STAGING_RESTART_MARKER){
 const marker=process.env.MEMBER_STAGING_RESTART_MARKER;assert.match(marker,/^\/private\/tmp\/garmonpay-https-runtime\/restart-[a-z0-9-]+$/);
 await writeFile(marker+'.ready','Restart the isolated staging application now. No keys or cookies are written.\n');
 console.log('Awaiting isolated application restart for persistence acceptance');
 const deadline=Date.now()+90000;let resumed=false;
 while(Date.now()<deadline){try{await access(marker);resumed=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}}
 assert.equal(resumed,true,'Application restart was not acknowledged');
 const recovered=(await request(b,'/api/solana/members/me')).data.member;assert.equal(recovered.id,second.id);
 const returned=await login(a);assert.equal(returned.id,first.id);assert.equal(returned.username,name);assert.equal(returned.picture,saved.picture);assert.equal(returned.walletPublic,false);assert.equal(returned.referralCode,first.referralCode);assert.equal(returned.referrals,1);
 applicationRestartPersistence=true;checks.push('Application restart preserves wallet identity, member ID, profile photo, privacy, referral code and existing valid session');
}
let supabaseHttpAcceptance=false;
if(process.env.MEMBER_STAGING_SUPABASE_URL){
 const ref=process.env.GARMONPAY_STAGING_SUPABASE_REF;
 assert.equal(ref,'bhxheuaoofiklsaurqlu');
 const url=process.env.MEMBER_STAGING_SUPABASE_URL;assert.equal(url,`https://${ref}.supabase.co`);
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;assert.ok(key);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const [wallet,id] of [[a.wallet,first.id],[b.wallet,second.id]]){
  const {data,error}=await db.from('gp_sol_members').select('id').eq('wallet_address',wallet).single();assert.equal(error,null);assert.equal(data.id,id);
 }
 const {data,error}=await db.from('gp_sol_members').select('picture,wallet_public,referral_code').eq('id',first.id).single();assert.equal(error,null);assert.equal(data.picture,saved.picture);assert.equal(data.wallet_public,false);assert.equal(data.referral_code,first.referralCode);
 const publicKey=process.env.MEMBER_STAGING_SUPABASE_PUBLISHABLE_KEY;assert.ok(publicKey);
 const anonymous=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const denied=await anonymous.from('gp_sol_members').select('id');assert.ok(denied.error);assert.equal(denied.data,null);
 const deniedRpc=await anonymous.rpc('gp_sol_member_directory',{p_query:null,p_username:null,p_hash:null});assert.ok(deniedRpc.error);assert.equal(deniedRpc.data,null);
 supabaseHttpAcceptance=true;checks.push('Actual isolated Supabase REST confirms the HTTPS-created account IDs, photo and privacy; anonymous table and RPC access denied');
}
const evidence={origin:origin.origin,automatedTestWallets:true,applicationRestartPersistence,realWalletApplicationAcceptance:false,physicalMobileAcceptance:false,supabaseHttpAcceptance,productionAccess:false,checks};
if(process.env.MEMBER_HTTPS_EVIDENCE)await writeFile(process.env.MEMBER_HTTPS_EVIDENCE,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
