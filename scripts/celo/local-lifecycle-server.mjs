/** Local Supabase protocol fixture backed by the real lifecycle SQL. Never use production credentials. */
import {createServer as httpServer} from 'node:http';
import {createServer as httpsServer} from 'node:https';
import {readFileSync} from 'node:fs';
const createServer=handler=>process.env.CELO_FIXTURE_TLS==='1'?httpsServer({key:readFileSync('/private/tmp/garmonpay-celo-tls/key.pem'),cert:readFileSync('/private/tmp/garmonpay-celo-tls/cert.pem')},handler):httpServer(handler);
import {WebSocketServer} from '/private/tmp/garmonpay-master-release/node_modules/ws/wrapper.mjs';
import {createLifecycleFixture} from './lifecycle-fixture.mjs';
const db=await createLifecycleFixture();
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
await db.query('INSERT INTO users(id,gpay_coins,full_name,username) VALUES($1,10000,$3,$3),($2,10000,$4,$4)',[...ids,'Fixture Banker','Fixture Player']);
const subscriptions=new Map();
const send=(socket,m)=>socket.send(JSON.stringify([m.join_ref??null,m.ref??null,m.topic,m.event,m.payload]));
const userOf=req=>{try{const token=req.headers.authorization?.split(' ')[1],payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));return ids.includes(payload.sub)?payload.sub:null;}catch{return null;}};
const respond=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS,PATCH,DELETE','Content-Range':'0-99/*'});res.end(JSON.stringify(data));};
const server=createServer(async(req,res)=>{
 if(req.method==='OPTIONS')return respond(res,{});
 try{
  const url=new URL(req.url,'http://127.0.0.1:4501'),user=userOf(req),table=url.pathname.split('/').pop();
  if(url.pathname==='/auth/v1/user'){if(!user)return respond(res,{message:'Invalid fixture token'},401);return respond(res,{id:user,email:`${ids.indexOf(user)}@fixture.invalid`,email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{provider:'email'},created_at:'2026-01-01T00:00:00Z'});}
  if(url.pathname.includes('/rpc/')){
   if(req.headers.authorization!=='Bearer fixture-service')return respond(res,{message:'Service only'},403);
   let raw='';for await(const chunk of req)raw+=chunk;const args=JSON.parse(raw||'{}');
   if(!/^celo_/.test(table))throw Error('Fixture only supports C-Lo RPCs');
   const names=Object.keys(args);if(!names.every(k=>/^p_[a-z_]+$/.test(k)))throw Error('Invalid argument');
   const result=(await db.query(`SELECT "${table}"(${names.map((n,i)=>`${n} => $${i+1}`).join(',')}) AS result`,Object.values(args))).rows[0].result;
   respond(res,result);
   for(const [socket,channels]of subscriptions)for(const channel of channels)send(socket,{topic:channel.topic,event:'postgres_changes',payload:{ids:[1],data:{schema:'public',table:'celo_rounds',type:'UPDATE',record:{},old_record:{},commit_timestamp:new Date().toISOString()}},ref:null});
   return;
  }
  if(url.pathname.startsWith('/rest/v1/')){
   if(!/^(users|celo_[a-z_]+)$/.test(table))return respond(res,[]);
   const params=[],where=[];
   for(const [key,value]of url.searchParams)if(/^[a-z_]+$/.test(key)&&value.startsWith('eq.')){params.push(value.slice(3));where.push(`"${key}"=$${params.length}`);}
   let rows=(await db.query(`SELECT * FROM "${table}"${where.length?' WHERE '+where.join(' AND '):''}`,params)).rows;
   if(table==='users')rows=rows.map(r=>({...r,banned:false,role:'user',membership_tier:'free'}));
   if(table==='celo_room_players'||table==='celo_chat')for(const row of rows)row.users=(await db.query('SELECT id,username,full_name,avatar_url FROM users WHERE id=$1',[row.user_id])).rows[0];
   const accept=req.headers.accept||'';return respond(res,accept.includes('vnd.pgrst.object')?(rows[0]??null):rows);
  }
  respond(res,{});
 }catch(error){respond(res,{message:error.message,code:'P0001'},400);}
});
const ws=new WebSocketServer({server});
ws.on('connection',socket=>{subscriptions.set(socket,[]);socket.on('close',()=>subscriptions.delete(socket));socket.on('message',raw=>{const wire=JSON.parse(String(raw));const m=Array.isArray(wire)?{join_ref:wire[0],ref:wire[1],topic:wire[2],event:wire[3],payload:wire[4]}:wire;if(m.event==='phx_join'){subscriptions.get(socket).push({topic:m.topic});send(socket,{join_ref:m.join_ref,topic:m.topic,event:'phx_reply',ref:m.ref,payload:{status:'ok',response:{postgres_changes:(m.payload.config?.postgres_changes??[]).map((c,i)=>({...c,id:i+1}))}}});}else if(m.event==='heartbeat')send(socket,{join_ref:m.join_ref,topic:m.topic,event:'phx_reply',ref:m.ref,payload:{status:'ok',response:{}}});});});
server.listen(4501,'127.0.0.1',()=>console.log('Isolated lifecycle fixture ready on 4501; two local wallets only.'));
