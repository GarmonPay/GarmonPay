// Dedicated temporary Members staging only. Never point this at production.
import http from 'node:http';
const origin=new URL(process.env.MEMBER_STAGING_ORIGIN??'');
if(origin.protocol!=='https:'||!origin.hostname.endsWith('.trycloudflare.com')||origin.port||origin.username||origin.password)throw new Error('Expected an isolated HTTPS quick-tunnel origin');
const port=Number(process.env.MEMBER_STAGING_APP_PORT??4327);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local staging port');
const methods=new Map([
 ['/api/solana/auth/challenge',['POST']],['/api/solana/auth/verify',['POST']],
 ['/api/solana/auth/session',['GET']],['/api/solana/auth/logout',['POST']],
 ['/api/solana/members',['GET']],['/api/solana/members/me',['GET','PATCH']],
 ['/api/solana/members/follow',['POST']],
]);
const server=http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.headers.host!==origin.host){res.writeHead(421);res.end('Invalid staging host');return;}
 const path=new URL(req.url,origin).pathname;
 if(path==='/'){res.writeHead(302,{Location:'/solana/members'});res.end();return;}
 const memberPage=/^\/solana\/members(?:\/[a-z][a-z0-9_]{2,23})?$/.test(path);
 const assets=path.startsWith('/_next/static/')||path==='/favicon.ico';
 const allowed=methods.has(path)?methods.get(path).includes(req.method):req.method==='GET'&&(memberPage||assets);
 if(!allowed){res.writeHead(path.startsWith('/api/')?503:404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'This isolated staging site serves Members only. Financial operations remain paused.'}));return;}
 if(!['GET'].includes(req.method)&&req.headers.origin!==origin.origin){res.writeHead(403);res.end('Origin rejected');return;}
 const headers={...req.headers,host:origin.host,'x-forwarded-proto':'https','x-forwarded-host':origin.host,'x-forwarded-for':String(req.headers['cf-connecting-ip']??req.socket.remoteAddress).slice(0,64)};
 const upstream=http.request({host:'127.0.0.1',port,path:req.url,method:req.method,headers},response=>{
  res.writeHead(response.statusCode??502,{...response.headers,'cache-control':'no-store','x-robots-tag':'noindex, nofollow'});response.pipe(res);
 });
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('Staging unavailable');});
 req.pipe(upstream);
});
server.listen(4360,'127.0.0.1',()=>console.log('Members-only HTTPS upstream ready on loopback'));
