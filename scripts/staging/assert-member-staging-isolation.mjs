// Run after configuring the real Supabase staging build, before exposing it.
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {parse} from 'dotenv';
const root=resolve(process.env.MEMBER_STAGING_APP_DIR??'');
if(!/^\/private\/tmp\/garmonpay-member-[a-z-]+stage$/.test(root))throw new Error('Expected a dedicated temporary Members staging directory');
const envFile=join(root,'.env.local'),env=parse(await readFile(envFile));
if((await stat(envFile)).mode&0o077)throw new Error('Staging environment file must be private');
const ref=env.GARMONPAY_STAGING_SUPABASE_REF;
if(env.GARMONPAY_MEMBERS_STAGING!=='1'||ref!=='bhxheuaoofiklsaurqlu'||env.NEXT_PUBLIC_SUPABASE_URL!=='https://bhxheuaoofiklsaurqlu.supabase.co')throw new Error('Production or unverified database configuration rejected');
const secret=env.SUPABASE_SERVICE_ROLE_KEY;if(!/^sb_secret_[A-Za-z0-9_-]{24,}$/.test(secret??''))throw new Error('Privileged staging key not configured');
const expected=await readFile(new URL('./member-supabase-client.ts',import.meta.url));
if(!(await readFile(join(root,'src/lib/supabase.ts'))).equals(expected))throw new Error('Server-only staging client guard missing');
const policy=await readFile(join(root,'src/lib/solana/policy.ts'),'utf8');
for(const flag of ['deposits','tokenLaunches','trading','custody','withdrawals','advertisingFunding','tokenRewards','referralPayouts','paidGames'])if(!new RegExp(`\\b${flag}:\\s*false`).test(policy))throw new Error('Financial feature flag is not disabled');
async function inspect(path){for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())await inspect(file);else if((await readFile(file)).includes(Buffer.from(secret)))throw new Error('Privileged key detected in browser build');}}
await inspect(join(root,'.next/static'));
console.log('Staging isolation verified: correct nonproduction project, private configuration, server-only client, disabled financial flags, no privileged key in browser assets');
