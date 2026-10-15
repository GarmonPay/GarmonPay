import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const origin=process.env.SECURITY_SMOKE_ORIGIN||'http://127.0.0.1:4321';
const checks=[
 ['/api/arena/health-origin','GET',200],
 ['/solana/trade','GET',200],['/solana/earn','GET',200],['/solana/advertise','GET',200],['/solana/referrals','GET',200],['/solana/dashboard','GET',200],['/solana/spotlight','GET',200],
 ['/api/games/budget','GET',503],['/api/admin/gamification','GET',503],['/api/admin/gamification-config','GET',503],
 ['/', 'GET',200],['/games','GET',200],['/solana/launchpad','GET',200],['/solana/watch','GET',200],['/solana/learn','GET',200],['/solana/withdraw','GET',200],
 ['/api/solana/discovery','GET',200],['/api/solana/auth/session','GET',401],['/api/solana/auth/challenge','POST',503],['/api/solana/auth/verify','POST',503],
 ['/api/wallet/deposit','POST',503],['/api/wallet/fund','POST',503],['/api/coins/checkout','POST',503],['/api/coins/redeem','POST',503],
 ['/api/create-checkout-session','POST',503],['/api/create-membership-session','POST',503],['/api/stripe/add-funds','POST',503],['/api/stripe/webhook','POST',503],
 ['/api/webhooks/stripe/pay','POST',503],['/api/webhooks/stripe/subscribe','POST',503],['/api/stripe-connect/transfer','POST',503],
 ['/api/ads/deposit','POST',503],['/api/advertiser/deposit','POST',503],['/api/gpay/claims','POST',503],['/api/gpay/earn','POST',503],
 ['/api/cron/membership-renewal','GET',503],['/api/cron/arena-jackpot','GET',503],['/api/cron/process-referral-commissions','GET',503],
 ['/api/admin/users/credit-usd','POST',503],['/api/admin/recover-stripe-payments','POST',503],['/api/arena/fights/fixture','PATCH',503],
 ['/api/celo/rooms','GET',410],['/api/celo/room/join','POST',410],['/api/wallet','GET',401],['/api/admin/users','GET',403],
 ['/api/solana/launches/validate','POST',200],['/api/leaderboard','GET',200],['/api/referrals/leaderboard','GET',200]
];
if(origin==='https://garmonpay.com')checks.push(['/api/coins/packages','GET',200],['/api/arena/cpu-fighters','GET',200],['/api/ad-packages','GET',200]);
const results=[];
for(const [path,method,expected]of checks){
 const mutation=!['GET','HEAD'].includes(method);
 const response=await fetch(origin+path,{method,redirect:'manual',headers:mutation?{'content-type':'application/json',Origin:origin}:undefined,body:mutation?JSON.stringify(path.includes('validate')?{name:'Security QA',symbol:'QA',description:'Synthetic validation only',website:'',social:''}:{}):undefined});
 const body=await response.text();assert.equal(response.status,expected,`${method} ${path}`);
 if(expected===503){assert.equal(JSON.parse(body).code,'FINANCIAL_OPERATIONS_PAUSED');assert.equal(response.headers.get('cache-control'),'no-store');}
 if(path.includes('leaderboard'))assert.equal(body.includes('"email"'),false,'Private email field must not be public');
 if(path.includes('validate'))assert.equal(JSON.parse(body).launchEnabled,false);
 if(path==='/api/arena/health-origin') { const value=JSON.parse(body).healthOrigin; if(value!==null){const url=new URL(value);assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(url.search,'');assert.equal(url.pathname,'/');} }
 results.push({path,method,status:response.status});
}
writeFileSync(process.env.SECURITY_SMOKE_OUTPUT||'/private/tmp/garmonpay-security-smoke.json',JSON.stringify({origin,results},null,2));
console.log(`${results.length} security smoke checks passed. Empty unauthenticated requests only; no payments, wallet signatures or financial transactions.`);
