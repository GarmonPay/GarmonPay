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
const paths=['/dashboard/games/celo/'+roomid];
try{
 for(const [width,height] of [[390,844],[430,932],[1440,900],[1920,1080]]){
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
   const geometry=await page.locator('.celo-table-stage').boundingBox();assert(geometry.height>=100,'Table collapsed');
   const controls=await page.locator('.celo-controls').boundingBox();assert(controls.y+controls.height<=height-(width<768?65:0),'Betting controls below viewport');
   assert(await page.locator('.celo-dice-canvas canvas').count()===1,'3D renderer missing');
   const roomBox=await page.locator('.gp-celo-room').boundingBox();assert(roomBox.height>height*.7,'Room fails to fill available viewport');
   const filename=path==='/'?'home':path.replaceAll('/','_').replaceAll(roomid,'room');
   await page.screenshot({path:`${out}/${width}-${filename}.png`,fullPage:true});if(['/dashboard','/dashboard/games'].includes(path))await page.screenshot({path:`${out}/${width}-${filename}-viewport.png`});results.push({path,width,height,status:response.status(),overflow:false});
  }
 }
 for(const [width,height] of [[390,844],[430,932],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});
  players[0].entry_posted=true;
  celoRound={...celoRound,id:'00000000-0000-4000-8000-000000000020',room_id:roomid,status:'player_rolling',banker_point:4,banker_dice:[2,2,4],roller_user_id:uid,current_player_seat:1};
  await page.reload({waitUntil:'networkidle'});
  const roll=page.getByRole('button',{name:'Roll dice',exact:true});assert(await roll.isVisible(),'Roll control missing');
  let box=await roll.boundingBox();assert(box.y+box.height<=height-(width<768?65:0),'Roll button obscured');await roll.focus();assert(await roll.evaluate(n=>n===document.activeElement));
  await page.screenshot({path:`${out}/${width}-player-turn.png`});
  celoRound=null;players[0].entry_posted=false;players[0].entry_sc=0;
  await page.reload({waitUntil:'networkidle'});
  const join=page.getByRole('button',{name:/JOIN ROUND/});assert(await join.isVisible(),'Wager control missing');box=await join.boundingBox();assert(box.y+box.height<=height-(width<768?65:0),'Wager button obscured');
  assert(await join.evaluate(n=>{const r=n.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return n===hit||n.contains(hit);}),'Wager button clipped or covered');
  await page.screenshot({path:`${out}/${width}-betting.png`});
  results.push({width,height,playerTurn:true,betting:true});
 }
 assert(errors.length===0,errors.join('\n'));
 await writeFile(out+'/results.json',JSON.stringify({results,errors,blockedHosts:[...new Set(blocked)],blockedWrites:writes,interactionChecks:['WebGL renderer','room fills viewport','no horizontal overflow','player roll button visible and keyboard focusable','wager button visible above navigation'],productionDataUsed:false},null,2));
 console.log(`PASS: ${results.length} responsive page checks, player-turn and betting controls checks, no page errors. External services and all writes intercepted.`);
}finally{await browser.close();}
