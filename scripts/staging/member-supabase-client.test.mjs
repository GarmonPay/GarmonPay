import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./member-supabase-client.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export function','function');
const valid={GARMONPAY_MEMBERS_STAGING:'1',GARMONPAY_STAGING_SUPABASE_REF:'bhxheuaoofiklsaurqlu',NEXT_PUBLIC_SUPABASE_URL:'https://bhxheuaoofiklsaurqlu.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_'+ 'x'.repeat(32)};
function client(env){let calls=0;const sandbox={process:{env},createClient:(url,key,options)=>{calls++;return {url,options};}};vm.createContext(sandbox);vm.runInContext(source,sandbox);return {invoke:()=>sandbox.createAdminClient(),calls:()=>calls};}
test('staging connection rejects production, missing credentials and mismatched destinations before SDK use',()=>{
 for(const env of [
  {...valid,GARMONPAY_MEMBERS_STAGING:'0'},
  {...valid,GARMONPAY_STAGING_SUPABASE_REF:'zfnwypoxggqpairmwnja',NEXT_PUBLIC_SUPABASE_URL:'https://zfnwypoxggqpairmwnja.supabase.co'},
  {...valid,NEXT_PUBLIC_SUPABASE_URL:'https://attacker.invalid'},
  {...valid,NEXT_PUBLIC_SUPABASE_URL:valid.NEXT_PUBLIC_SUPABASE_URL+'/extra'},
  {...valid,GARMONPAY_STAGING_SUPABASE_REF:'../invalid'},
  {...valid,GARMONPAY_STAGING_SUPABASE_REF:'abcdefghijklmnopqrst',NEXT_PUBLIC_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co'},
  {...valid,SUPABASE_SERVICE_ROLE_KEY:''},
  {...valid,SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_'+ 'x'.repeat(32)},
  {...valid,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_partial'},
 ]){const guarded=client(env);assert.throws(guarded.invoke,/Verified Phase 1 staging/);assert.equal(guarded.calls(),0);}
});
test('isolated server client disables session persistence and refresh',()=>{
 const guarded=client(valid);const configured=guarded.invoke();assert.equal(guarded.calls(),1);assert.equal(configured.url,valid.NEXT_PUBLIC_SUPABASE_URL);assert.equal(configured.options.auth.persistSession,false);assert.equal(configured.options.auth.autoRefreshToken,false);assert.equal(configured.options.auth.detectSessionInUrl,false);
});
