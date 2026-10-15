import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {io} from 'socket.io-client';
const port=4396,origin=`http://127.0.0.1:${port}`;
// Deliberately omit every production URL, key and credential from the child.
const child=spawn(process.execPath,['server/fight-server.js'],{env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:String(port),ARENA_JOIN_SECRET:randomBytes(32).toString('hex'),RENDER_GIT_COMMIT:'a'.repeat(40)},stdio:['ignore','pipe','pipe']});
let socket;
try{
 let health;
 const deadline=Date.now()+8000;
 while(Date.now()<deadline){try{const response=await fetch(origin+'/health',{signal:AbortSignal.timeout(500)});if(response.ok){health=await response.json();break;}}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
 assert(health,'Local worker did not become ready');
 assert.equal(health.service,'garmonpay-fight-server');assert.equal(health.settlementPaused,true);assert.equal(health.buildRevision,'a'.repeat(40));assert.equal(health.joinSecretConfigured,true);
 socket=io(origin,{transports:['websocket'],forceNew:true,reconnection:false,timeout:2000});
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Local rejection timeout')),2000);socket.emit('join_fight',{fightId:'12345678-1234-1234-1234-123456789012',joinToken:'forged'},response=>{clearTimeout(timer);resolve(response);});});
 assert.equal(result.ok,false);assert.equal(result.message,'Invalid or expired token');
 console.log('Local worker integration passed: Render PORT selection, public revision/pause metadata, no production credentials, Socket.IO connection and forged join rejection. No production WebSocket actions or worker changes.');
}finally{socket?.disconnect();child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
