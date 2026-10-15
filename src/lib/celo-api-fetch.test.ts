import {afterEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {fetchCeloApi} from './celo-api-fetch';
afterEach(()=>vi.unstubAllGlobals());
const session=()=>({auth:{getSession:async()=>({data:{session:{access_token:'verified-fixture-token',expires_at:4102444800,user:{id:'fixture-user'}}}})}} as unknown as SupabaseClient);
describe('C-Lo action retry receipts',()=>{
 it('reuses the nonce after lost responses, then permits a new confirmed action',async()=>{
  const ids:string[]=[];let attempt=0;
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{
   ids.push(new Headers(init.headers).get('x-celo-request-id')!);
   if(attempt++===0)throw new TypeError('Lost response');
   return Response.json({ok:true});
  }));
  const input={method:'POST',body:JSON.stringify({room_id:'retry-fixture',amount:500})};
  await expect(fetchCeloApi(session(),'/api/celo/bank/add',input)).rejects.toThrow('Lost response');
  await fetchCeloApi(session(),'/api/celo/bank/add',input);await fetchCeloApi(session(),'/api/celo/bank/add',input);
  expect(ids[0]).toBe(ids[1]);expect(ids[2]).not.toBe(ids[1]);
 });
 it('keeps an explicitly supplied logical action nonce',async()=>{
  let sent='';vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{sent=new Headers(init.headers).get('x-celo-request-id')!;return Response.json({ok:true});}));
  await fetchCeloApi(session(),'/api/celo/round/roll',{method:'POST',headers:{'x-celo-request-id':'existing-action'},body:'{}'});expect(sent).toBe('existing-action');
 });
});
