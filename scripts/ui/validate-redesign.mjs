/** Local browser QA. Fixture responses only; blocks external services and all writes.
 * REDESIGN_PLAYWRIGHT_MODULE points to an existing temporary Playwright installation.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.REDESIGN_PLAYWRIGHT_MODULE));
const base=process.env.REDESIGN_QA_URL||'http://127.0.0.1:4400';
assert(new URL(base).hostname==='127.0.0.1'||new URL(base).hostname==='localhost','QA must run locally');
const out=process.env.REDESIGN_QA_OUTPUT||'/private/tmp/garmonpay-master-qa';await mkdir(out,{recursive:true});
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const roomid='00000000-0000-4000-8000-000000000010';
const user={id:uid,email:'fixture@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',full_name:'QA Member',username:'QA Member',gold_coins:1234,gpay_coins:9876,gpay_tokens:0,membership_tier:'free',total_referrals:2,referral_code:'QA-ONLY',created_at:'2026-01-01T00:00:00Z'};
const empty=()=>Array.from({length:6},()=>Array(7).fill(0));const board=empty();board[5][0]=1;board[5][1]=2;
let dropRoom={id:roomid,creator_id:uid,opponent_id:other,entry_amount_minor:100,status:'active',board_state:board,current_turn:uid,winner_id:null,pot_total_minor:200,platform_fee_minor:20,winner_payout_minor:180,move_seq:2,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',completed_at:null,creator:user,opponent:{id:other,full_name:'QA Opponent'}};
const celoRoom={id:roomid,name:'QA live table',status:'active',room_type:'public',max_players:4,minimum_entry_sc:500,current_bank_sc:2000,starting_bank_sc:2000,banker_id:other,banker:{id:other,full_name:'QA Banker'},created_at:'2026-01-01T00:00:00Z'};
const players=[{id:uid,user_id:uid,room_id:roomid,role:'player',seat_number:1,entry_sc:500,users:user},{id:other,user_id:other,room_id:roomid,role:'banker',seat_number:0,users:{id:other,full_name:'QA Banker'}}];
let celoRound={id:'00000000-0000-4000-8000-000000000020',room_id:roomid,round_number:1,status:'banker_rolling',current_player_seat:1,prize_pool_sc:500,banker_point:null,banker_dice:null,idle_preview_dice:[2,3,5],banker_roll_in_flight:false,roll_processing:false,player_celo_offer:false,player_celo_expires_at:null};
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp:4102444800,role:'authenticated'})).toString('base64url')+'.fixture';
const browser=await chromium.launch({headless:true});const results=[],errors=[],blocked=[],writes=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
await context.addInitScript(({user,jwt})=>{if(sessionStorage.getItem("qa_signed_out"))return;localStorage.setItem('sb-garmonpay-ui-fixture-auth-token',JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_at:4102444800,expires_in:99999999,token_type:'bearer',user}));},{user,jwt});
await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname;
 const json=async(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(url.hostname==='garmonpay-ui-fixture.supabase.co'){
  if(path.startsWith('/auth/'))return json({user,access_token:jwt,expires_at:4102444800});
  if(request.method()!=='GET'){writes.push({path,method:request.method()});return json({message:'Blocked fixture write'},403);}
  const table=path.split('/').pop();let rows=[];
  if(table==='users')rows=[user];if(table==='garmondrop_rooms'&&url.searchParams.has('id'))rows=[dropRoom];
  if(table==='celo_rooms')rows=[celoRoom];if(table==='celo_room_players')rows=players;if(table==='celo_rounds')rows=[celoRound];
  return json(request.headers()['accept']?.includes('object')?(rows[0]??null):rows);
 }
 if(url.origin!==base){blocked.push(url.hostname);return route.abort();}
 if(path.startsWith('/api/')){
  if(request.method()!=='GET'){writes.push({path,method:request.method()});return json({message:'Blocked fixture write'},403);}
  if(path==='/api/earn/feed')return json({videos:[{id:'qa-video',title:'QA creator video',creatorName:'QA Creator',videoUrl:base+'/qa-no-media',thumbnailUrl:null,viewsCount:12,payoutGpc:10,remainingBudgetGpc:100}],payoutGpc:10,dailyCapGpc:50,earnedTodayGpc:0,remainingTodayGpc:50,membershipTier:'free'});
  if(path==='/api/celo/room/state')return json({room:celoRoom,players,activeRound:celoRound,playerRolls:[]});
  if(path==='/api/garmondrop/open')return json({rooms:[]});
  if(path.includes('referral')&&!path.includes('leaderboard'))return json({summary:{totalReferrals:2,activeReferrals:1,monthlyReferralIncomeGpc:0,lifetimeReferralEarningsGpc:0,referralCode:'QA-ONLY'},referralLink:'https://fixture.invalid/r/QA-ONLY',referredUsers:[],earningsHistory:[],commissionRules:[]});
  if(path.includes('games/budget'))return json({remaining:100,noRewardsRemaining:false});
  if(path.includes('advertiser/me'))return json({hasAdvertiser:false,advertiser:null});
  return json({banners:[],plans:[],packages:[],ads:[],notifications:[],leaderboard:[],balanceCents:0,tier:'free',total:0,remaining:100,noRewardsRemaining:false});
 }
 if(path==='/qa-no-media')return route.fulfill({status:404,body:''});
 return route.continue();
});
const page=await context.newPage();page.on('pageerror',error=>{const detail=page.url()+' '+String(error.stack||error);errors.push(detail);console.log(detail);});
const paths=['/','/login','/register','/dashboard','/dashboard/wallet','/dashboard/games','/games','/dashboard/games/garmondrop','/dashboard/games/garmondrop/'+roomid,'/dashboard/games/celo','/dashboard/games/celo/'+roomid,'/dashboard/earn','/dashboard/membership','/dashboard/referrals','/dashboard/advertise','/dashboard/arena','/dashboard/redeem','/dashboard/settings','/dashboard/convert','/advertise','/faq','/about','/admin/login'];
try{
 for(const [width,height] of [[320,812],[390,844],[430,932],[768,1024],[1440,900]]){
  await page.setViewportSize({width,height});
  for(const path of paths){
   const response=await page.goto(base+path,{waitUntil:'networkidle',timeout:30000});await page.waitForTimeout(150);
   assert(response.status()<400,`${path}: HTTP ${response.status()}`);
   const layout=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,heading:document.querySelector('h1')?.textContent,body:document.body.textContent}));
   assert(layout.width<=width+1,`${path} at ${width}px overflows to ${layout.width}px`);
   const clippedControls=await page.locator('form input, form button, form select, form textarea').evaluateAll(elements=>elements.filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&(r.left < -1||r.right > innerWidth+1);}).map(element=>element.getAttribute('name')||element.textContent||element.tagName));
   assert(clippedControls.length===0,`${path} at ${width}px clips form controls: ${clippedControls.join(', ')}`);
   assert(!layout.body.includes('Application error'),`${path} crashed`);
   if(path==='/dashboard'){assert(layout.body.includes('1,234')&&layout.body.includes('9,876'),'Real fixture wallet values did not render');assert(await page.locator('.gp-cinematic-hero').count()===1,'Cinematic hero missing');assert((await page.locator('.gp-cinematic-hero').evaluate(node=>getComputedStyle(node).backgroundImage)).includes('lion-hero.webp'),'Lion artwork missing');}
   if(await page.locator('.gp-game-art').count())await page.waitForFunction(()=>Array.from(document.querySelectorAll('.gp-game-art')).every(image=>image.complete&&image.naturalWidth>0));
   if(path.endsWith(roomid)&&path.includes('garmondrop')){assert(await page.locator('[role=button][aria-label^=Column]').count()===7);assert(await page.locator('.gp-drop-cell').count()===42);assert(await page.locator('.gp-disc-violet').count()>0);}
   if(path==='/dashboard/games'){assert(await page.locator('.gp-game-card').count()===8);assert(await page.locator('.gp-game-soon').count()===5);}
   if(path==='/dashboard/arena')assert(layout.body.includes('COMING SOON'));
   if(path==='/dashboard/earn'){assert(layout.body.includes('QA Creator'));assert(layout.body.includes('Ready for your'));}
   if(path.startsWith('/dashboard') && !path.includes('/games/celo/')) {
     const obscured=await page.evaluate(()=>{const heading=document.querySelector('.dashboard-main h1,.dashboard-main h2');const header=document.querySelector('.gp-topbar');return heading&&header ? heading.getBoundingClientRect().top < header.getBoundingClientRect().bottom-1 : false;});
     assert(!obscured,`${path}: fixed header obscures heading at ${width}px`);
   }
   const filename=path==='/'?'home':path.replaceAll('/','_').replaceAll(roomid,'room');
   await page.screenshot({path:`${out}/${width}-${filename}.png`,fullPage:true});if(['/dashboard','/dashboard/games'].includes(path))await page.screenshot({path:`${out}/${width}-${filename}-viewport.png`});results.push({path,width,height,status:response.status(),overflow:false});
  }
 }
 // Categories filter presentation while keeping existing availability and destinations.
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/dashboard/games',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Multiplayer',exact:true}).click();assert(await page.locator('.gp-game-card').count()===3);assert(await page.locator('.gp-game-soon').count()===0);
 await page.getByRole('button',{name:'Coming Soon',exact:true}).click();assert(await page.locator('.gp-game-card').count()===5);assert(await page.locator('.gp-game-soon').count()===5);
 await page.getByRole('button',{name:'Arcade',exact:true}).click();assert(await page.locator('.gp-game-card').count()===4);assert(await page.locator('.gp-game-soon').count()===4);
 await page.getByRole('button',{name:'All',exact:true}).click();assert(await page.locator('.gp-game-card').count()===8);
 // More navigation opens an accessible sheet, contains real destinations and closes on Escape.
 await page.getByRole('button',{name:'More',exact:true}).click();assert(await page.getByRole('dialog').isVisible());assert(await page.getByRole('link',{name:'Store · Gold Coins',exact:true}).getAttribute('href')==='/dashboard/coins/buy');await page.keyboard.press('Escape');assert(await page.getByRole('dialog').count()===0);
 // Keyboard/selected-column presentation and server-provided turn transition.
 await page.goto(base+'/dashboard/games/garmondrop/'+roomid,{waitUntil:'networkidle'});await page.locator('[aria-label="Column 3"]').hover();assert(await page.locator('[aria-label="Column 3"]').getAttribute('aria-disabled')==='false');
 dropRoom={...dropRoom,current_turn:other};await page.reload({waitUntil:'networkidle'});assert((await page.locator('.gp-drop-turn').innerText())==='OPPONENT TURN');assert((await page.locator('[aria-label="Column 3"]').getAttribute('aria-disabled'))==='true');
 // Server-provided completion animates the actual winning line; fixture only.
 const won=empty();won[5]=[1,1,1,1,0,2,2];dropRoom={...dropRoom,board_state:won,status:'completed',winner_id:uid,current_turn:null,completed_at:'2026-01-02T00:00:00Z'};
 await page.reload({waitUntil:'networkidle'});assert(await page.locator('.gp-disc-winning').count()===4);await page.screenshot({path:out+'/garmondrop-win.png',fullPage:true});
 // Sound is opt-in and can be muted; no game action is submitted.
 await page.goto(base+'/dashboard/games/celo/'+roomid,{waitUntil:'networkidle'});const sound=page.getByRole('button',{name:'Turn dice sound on'});await sound.click();assert(await page.getByRole('button',{name:'Turn dice sound off'}).getAttribute('aria-pressed')==='true');await page.getByRole('button',{name:'Turn dice sound off'}).click();
 // Signed-out view still redirects rather than showing fixture account data.
 const signedOut=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'});
 await signedOut.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:401,contentType:'application/json',body:'{"message":"Unauthorized"}'});return route.continue();});
 const anon=await signedOut.newPage();await anon.goto(base+'/dashboard',{waitUntil:'networkidle'});await anon.waitForURL(/\/login\?next=/);assert(!(await anon.locator('body').innerText()).includes('9,876'));await signedOut.close();

 assert(errors.length===0,errors.join('\n'));
 await writeFile(out+'/results.json',JSON.stringify({results,errors,blockedHosts:[...new Set(blocked)],blockedWrites:writes,interactionChecks:['wallet values','game availability','board geometry','column hover','opponent turn disables input','winning-line animation','sound opt-in/mute','signed-out redirect','category filtering','More menu navigation and keyboard dismissal'],productionDataUsed:false},null,2));
 console.log(`PASS: ${results.length} responsive page checks, 10 interaction checks, no page errors. External services and all writes intercepted.`);
}finally{await browser.close();}
