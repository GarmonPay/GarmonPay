import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
const boundary=vi.hoisted(()=>({hashToken:'',db:null as any}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>boundary.hashToken?{value:boundary.hashToken}:undefined})}));
vi.mock('@/lib/supabase',()=>({createAdminClient:()=>boundary.db}));
vi.mock('./policy',async original=>({...await original<typeof import('./policy')>(),walletAuthEnabled:()=>true}));
import {PATCH as saveProfile,GET as ownProfile} from '@/app/api/solana/members/me/route';
import {POST as followRoute} from '@/app/api/solana/members/follow/route';
import {GET as directoryRoute} from '@/app/api/solana/members/route';
import {digest} from './auth-crypto';
let pg:any;
const a='11111111111111111111111111111111', b='22222222222222222222222222222222', c='33333333333333333333333333333333';
const hashes=['a','b','c'].map(s=>s.repeat(64));
async function login(wallet:string,hash:string,ref:string|null=null){return (await pg.query("SELECT gp_sol_member_login($1,$2,now()+interval '30 minutes',null,$3) id",[wallet,hash,ref])).rows[0].id;}
async function me(hash:string){return(await pg.query('SELECT gp_sol_member_me($1) member',[hash])).rows[0].member;}
async function directory(query:string|null=null){return(await pg.query('SELECT gp_sol_member_directory($1,null,null) members',[query])).rows[0].members;}
beforeAll(async()=>{
 const path=process.env.SOL_FOUNDATION_PGLITE_MODULE;if(!path)throw new Error('Synthetic PostgreSQL runtime required');
 const {PGlite}=await import(/* @vite-ignore */path);pg=new PGlite();
 await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role;');
 for(const file of ['supabase/security/staging/phase1-wallet-identity.sql','supabase/security/staging/phase3-session-rotation.sql','supabase/security/staging/phase1-members.sql'])await pg.exec(readFileSync(file,'utf8'));
 await pg.exec('SET ROLE service_role');
 boundary.db={rpc:async(name:string,args:any)=>{try{const specs:Record<string,[string,unknown[]]>={gp_sol_member_me:['SELECT gp_sol_member_me($1) data',[args.p_hash]],gp_sol_member_save:['SELECT gp_sol_member_save($1,$2,$3,$4,$5,$6) data',[args.p_hash,args.p_username,args.p_bio,args.p_picture,args.p_public,args.p_display??null]],gp_sol_member_follow:['SELECT gp_sol_member_follow($1,$2,$3) data',[args.p_hash,args.p_target,args.p_follow]],gp_sol_member_directory:['SELECT gp_sol_member_directory($1,$2,$3) data',[args.p_query,args.p_username,args.p_hash]]};const spec=specs[name];if(!spec)throw new Error('Unexpected RPC');return {data:(await pg.query(...spec)).rows[0].data,error:null};}catch(error){return {data:null,error};}}};
});
afterAll(async()=>{await pg?.close();});
describe('Persistent wallet members and isolation',()=>{
 it('automatically creates one permanent account across repeat verified logins',async()=>{
 const first=await login(a,hashes[0]);expect(await login(a,'d'.repeat(64))).toBe(first);
 const member=await me(hashes[0]);expect(member.walletPublic).toBe(false);expect(member.displayName).toBe('');expect(member.referralCode).toMatch(/^[0-9a-f]{32}$/);expect(member.referralSlug).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
 });
 it('tracks only the first verified referral, without repeat login inflation',async()=>{
 const parent=await me(hashes[0]);const child=await login(b,hashes[1],parent.referralCode);
 await login(b,'e'.repeat(64),parent.referralSlug);expect((await me(hashes[0])).referrals).toBe(1);
 expect(child).not.toBe(parent.id);await login(c,hashes[2],parent.referralSlug);expect((await me(hashes[0])).referrals).toBe(2);
 });
 it('updates only the session owner and keeps hidden wallets out of public JSON and search',async()=>{
 await pg.query("SELECT gp_sol_member_save($1,'alice','Hello',null,false,'HolyGhost')",[hashes[0]]);
 await pg.query("SELECT gp_sol_member_save($1,'bob','Other wallet',null,true,'HolyGhost')",[hashes[1]]);
 expect((await me(hashes[1])).username).toBe('bob');expect((await me(hashes[0])).username).toBe('alice');
 expect((await me(hashes[0])).displayName).toBe('HolyGhost');expect((await me(hashes[1])).displayName).toBe('HolyGhost');
 await expect(pg.query("SELECT gp_sol_member_save($1,null,'',null,false,'A')",[hashes[0]])).rejects.toThrow();
 const publicA=(await directory('alice'))[0];expect(publicA.wallet).toBeNull();expect(JSON.stringify(publicA)).not.toContain(a);expect(await directory(a)).toEqual([]);
 });
 it('enforces case-insensitive unique usernames and reserves staff names',async()=>{
 await expect(pg.query("SELECT gp_sol_member_save($1,'ALICE','',null,true)",[hashes[1]])).rejects.toThrow();
 await expect(pg.query("SELECT gp_sol_member_save($1,'admin','',null,true)",[hashes[1]])).rejects.toThrow();
 expect((await me(hashes[1])).username).toBe('bob');
 });
 it('makes follows idempotent and prevents self follows or another wallet unfollowing',async()=>{
 const alice=await me(hashes[0]),bob=await me(hashes[1]);
 for(let i=0;i<2;i++)await pg.query('SELECT gp_sol_member_follow($1,$2,true)',[hashes[1],alice.id]);
 expect((await directory('alice'))[0].followers).toBe(1);
 await pg.query('SELECT gp_sol_member_follow($1,$2,false)',[hashes[2],alice.id]);expect((await directory('alice'))[0].followers).toBe(1);
 await expect(pg.query('SELECT gp_sol_member_follow($1,$2,true)',[hashes[1],bob.id])).rejects.toThrow();
 await pg.query('SELECT gp_sol_member_follow($1,$2,false)',[hashes[1],alice.id]);expect((await directory('alice'))[0].followers).toBe(0);
 });
 it('connects real profile, search and follow handlers to the SQL store with CSRF and session isolation',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://staging.example.invalid');
 boundary.hashToken='z'.repeat(43);const actorId=await login(c,digest(boundary.hashToken));
 const request=(body:unknown,origin='https://staging.example.invalid',method='PATCH')=>new Request('https://staging.example.invalid/api/solana/members',{method,headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 expect((await saveProfile(request({actorId,username:'charlie',biography:'Third member',picture:null,walletPublic:false},'https://attacker.invalid'))).status).toBe(403);
 const sharp=(await import('sharp')).default;
 const picture='data:image/png;base64,'+(await sharp({create:{width:64,height:64,channels:3,background:'purple'}}).png().toBuffer()).toString('base64');
 expect((await saveProfile(request({actorId,username:'charlie',displayName:'HolyGhost',biography:'Third member',picture,walletPublic:false}))).status).toBe(200);
 const savedPicture=(await me(digest(boundary.hashToken))).picture;
 expect(savedPicture).toMatch(/^data:image\/jpeg;base64,/);
 expect((await sharp(Buffer.from(savedPicture.split(',')[1],'base64')).metadata()).width).toBe(64);
 const corrupt=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(corrupt);corrupt.write('IHDR',12);corrupt.writeUInt32BE(64,16);corrupt.writeUInt32BE(64,20);
 expect((await saveProfile(request({actorId,username:'charlie',biography:'Corrupt upload',picture:'data:image/png;base64,'+corrupt.toString('base64'),walletPublic:false}))).status).toBe(400);
 expect((await me(digest(boundary.hashToken))).picture).toBe(savedPicture);
 expect((await me(digest(boundary.hashToken))).biography).toBe('Third member');
 expect((await me(digest(boundary.hashToken))).displayName).toBe('HolyGhost');
 expect((await (await ownProfile()).json()).member.username).toBe('charlie');expect((await me(hashes[0])).username).toBe('alice');
 const alice=await me(hashes[0]);
 expect((await saveProfile(request({actorId:alice.id,username:'stale_actor',biography:'',picture:null,walletPublic:true}))).status).toBe(409);
 expect((await me(digest(boundary.hashToken))).username).toBe('charlie');
 expect((await followRoute(request({actorId:alice.id,memberId:alice.id,follow:true},undefined,'POST'))).status).toBe(409);
 expect((await followRoute(request({actorId,memberId:alice.id,follow:true},undefined,'POST'))).status).toBe(200);
 const found=await (await directoryRoute(new Request('https://staging.example.invalid/api/solana/members?q=charlie'))).json();expect(found.members[0].wallet).toBeNull();
 boundary.hashToken='';expect((await ownProfile()).status).toBe(401);expect((await followRoute(request({actorId,memberId:alice.id,follow:true},undefined,'POST'))).status).toBe(401);vi.unstubAllEnvs();
 });
 it('rejects expired, revoked and banned sessions immediately',async()=>{
 await pg.query('UPDATE gp_sol_sessions SET revoked_at=now() WHERE token_hash=$1',[hashes[2]]);
 await expect(pg.query("SELECT gp_sol_member_save($1,'hacked','',null,true)",[hashes[2]])).rejects.toThrow(/Unauthorized/);
 await pg.query('UPDATE gp_sol_identities SET banned=true WHERE wallet_address=$1',[b]);
 expect(await me(hashes[1])).toBeNull();expect(await directory('bob')).toEqual([]);
 });
 it('denies browser roles both raw private rows and privileged member functions',async()=>{
 for(const role of ['anon','authenticated']){await pg.exec(`SET ROLE ${role}`);
 try{await expect(pg.query('SELECT * FROM gp_sol_members')).rejects.toThrow(/permission denied/);await expect(pg.query('SELECT gp_sol_member_me($1)',[hashes[0]])).rejects.toThrow(/permission denied/);}
 finally{await pg.exec('RESET ROLE; SET ROLE service_role');}}
 });
});
