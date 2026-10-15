/** Two independent local sessions use real Next routes and actual SQL; no intercepted game actions. */
import {chromium,webkit} from '/private/tmp/pwcelo/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.CELO_QA_URL??'http://127.0.0.1:4500',out=process.env.CELO_BROWSER==='webkit'?'/private/tmp/garmonpay-lifecycle-webkit':'/private/tmp/garmonpay-lifecycle-browser';await mkdir(out,{recursive:true});
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
const jwt=id=>Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,exp:4102444800,aud:'authenticated',role:'authenticated'})).toString('base64url')+'.fixture';
const browser=await (process.env.CELO_BROWSER==='webkit'?webkit:chromium).launch({headless:true});let checks=0;const pages=[],errors=[];
try{
 for(const [i,id]of ids.entries()){
  const context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block',viewport:i?{width:390,height:844}:{width:1440,height:900},...(i?{isMobile:true,hasTouch:true}: {})});
  await context.addInitScript(({id,token})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:4102444800,expires_in:99999999,token_type:'bearer',user:{id,email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',email:`${id}@fixture.invalid`,user_metadata:{}}})),{id,token:jwt(id)});
  await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});
  await context.addInitScript(()=>{
   window.__celoEarlyResults=[];
   new MutationObserver(()=>{const dice=document.querySelector('.celo-real-dice');const label=document.querySelector('.celo-roll-name');if(dice&&dice.dataset.celoPhase!=='rest'&&label&&Number(getComputedStyle(label).opacity)>.01)window.__celoEarlyResults.push(label.textContent);}).observe(document,{subtree:true,childList:true,attributes:true});
  });
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR STACK',e.stack);});
 }
 const api=async(i,path,body,request=crypto.randomUUID())=>{const r=await fetch(base+'/api/celo/'+path,{method:'POST',headers:{Authorization:'Bearer '+jwt(ids[i]),'Content-Type':'application/json','x-celo-request-id':request},body:JSON.stringify(body)});const data=await r.json();assert(r.ok,JSON.stringify(data));checks++;return data;};
 for(const path of ['post-entry','round/start','round/roll','bank/add','room/delete','banker-takeover']){
  const rejected=await fetch(base+'/api/celo/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':ids[0],'x-celo-request-id':crypto.randomUUID()},body:JSON.stringify({room_id:crypto.randomUUID()})});assert.equal(rejected.status,401,'spoofed identity rejected '+path);checks++;
 }
 const created=await api(0,'room/create',{name:'Two session lifecycle',minimum_entry_sc:500,starting_bank_sc:2000,max_players:4});const room=created.room.id;
 await api(1,'room/join',{room_id:room,role:'player'});
 await Promise.all(pages.map(p=>p.goto(base+'/dashboard/games/celo/'+room,{waitUntil:'domcontentloaded'})));
 await pages[1].waitForTimeout(4000);
 assert.deepEqual(errors,[],'both game pages render without runtime errors');
 for(const [i,p]of pages.entries()){await p.locator('.gp-celo-room').waitFor();await p.screenshot({path:out+`/initial-${i}.png`});console.log('BODY',i,(await p.locator('body').innerText()).slice(-1800));}
 await pages[1].locator('input[type=number]').first().fill('500');
 const entryResponse=pages[1].waitForResponse(r=>r.url().endsWith('/api/celo/post-entry')&&r.request().method()==='POST');
 await pages[1].getByRole('button',{name:/JOIN ROUND/}).click();assert((await entryResponse).ok(),'player entry button reaches server');checks++;
 await pages[0].getByRole('button',{name:'Start round',exact:true}).waitFor({state:'visible'});
 const startResponse=pages[0].waitForResponse(r=>r.url().endsWith('/api/celo/round/start')&&r.request().method()==='POST');
 await pages[0].getByRole('button',{name:'Start round',exact:true}).click();const startRes=await startResponse;assert(startRes.ok());const started=await startRes.json();const round=started.round.id;checks++;
 const duplicated=await Promise.all([api(0,'round/start',{room_id:room}),api(0,'round/start',{room_id:room})]);assert(duplicated.every(s=>s.round.id===round),'concurrent starts retain one round');checks++;

 for(let n=0;n<20;n++){
  const state=await (await fetch(base+'/api/celo/room/state?room_id='+room,{headers:{Authorization:'Bearer '+jwt(ids[0])}})).json();const r=state.activeRound;if(r.status==='completed')break;
  const actor=r.status==='banker_rolling'?0:1;
  const rollButton=pages[actor].getByRole('button',{name:'Roll dice',exact:true});await rollButton.waitFor();
  const rollResponse=pages[actor].waitForResponse(response=>response.url().endsWith('/api/celo/round/roll')&&response.request().method()==='POST');
  await rollButton.click();await pages[actor].waitForTimeout(100);
  const duplicateRoll=await fetch(base+'/api/celo/round/roll',{method:'POST',headers:{Authorization:'Bearer '+jwt(ids[actor]),'Content-Type':'application/json','x-celo-request-id':crypto.randomUUID()},body:JSON.stringify({room_id:room,round_id:round,roll_seq:r.roll_seq})});assert.equal(duplicateRoll.status,409,'concurrent roll is rejected');checks++;
  const response=await rollResponse;const rolled=await response.json();assert(response.ok(),JSON.stringify(rolled));checks++;console.log('ROLL',rolled.dice,rolled.outcome);
  await Promise.all(pages.map(p=>p.locator('.celo-real-dice[data-celo-phase=rest] output').waitFor({state:'visible',timeout:10000})));
  const faces=await Promise.all(pages.map(p=>p.locator('.celo-server-faces').innerText()));assert.equal(faces[0],faces[1],'both clients show identical server dice');checks++;
  if(rolled.roundComplete)break;
 }
 for(const [i,p]of pages.entries()){await p.screenshot({path:out+`/settled-${i}.png`});console.log('DICE DOM',i,await p.locator('.celo-real-dice').evaluate(e=>({phase:e.dataset.celoPhase,box:e.getBoundingClientRect().toJSON(),faces:e.querySelector('output')?.textContent})));console.log('FINAL',i,(await p.locator('body').innerText()).slice(-1600));}
 for(const viewport of [{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:1440,height:900},{width:1920,height:1080}]){
  const p=pages[1];await p.setViewportSize(viewport);await p.waitForTimeout(500);
  const layout=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.celo-controls input,.celo-controls button')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent,box:e.getBoundingClientRect().toJSON()}))}));
  assert(layout.scroll<=layout.width,'no horizontal scrolling');for(const c of layout.controls){assert(c.box.top>=0&&c.box.bottom<=viewport.height,'essential controls fit viewport '+JSON.stringify(c));}checks++;
  await p.screenshot({path:out+`/viewport-${viewport.width}.png`});
 }
 // The banker also gets usable start/funding controls at mobile widths.
 await pages[0].setViewportSize({width:390,height:844});await api(1,'post-entry',{room_id:room,amount:500});
 await pages[0].getByRole('button',{name:'Start round',exact:true}).waitFor();
 const bankerControl=await pages[0].getByRole('button',{name:'Start round',exact:true}).boundingBox();assert(bankerControl.y+bankerControl.height<=844);checks++;
 await pages[0].screenshot({path:out+'/banker-mobile-ready.png'});
 await pages[1].setViewportSize({width:390,height:844});await pages[1].getByRole('button',{name:'Chat',exact:true}).click();await pages[1].getByRole('dialog',{name:'Table chat'}).waitFor();await pages[1].getByRole('button',{name:/Close chat/}).click();checks++;
 for(const p of pages)assert.deepEqual(await p.evaluate(()=>window.__celoEarlyResults),[],'result names wait for settled dice');checks++;
 assert.deepEqual(errors,[],'lifecycle and viewports have no browser errors');
 await pages[1].reload();await pages[1].locator('.gp-celo-room').waitFor();await pages[1].waitForTimeout(2000);checks++;
 await writeFile(out+'/results.json',JSON.stringify({checks,room,round},null,2));assert.deepEqual(errors,[]);console.log('PASS local API lifecycle and two independent rendered sessions',checks);
}finally{await browser.close();}
