// Launch the isolated Members app with Next's standalone server. Loopback only.
import {cpSync,readFileSync,statSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {parse} from 'dotenv';
const app=process.env.MEMBER_STAGING_APP_DIR??'/private/tmp/garmonpay-member-mobile-stage';
if(!/^\/private\/tmp\/garmonpay-member-[a-z-]+stage$/.test(app)) throw new Error('Dedicated temporary Members app required');
const port=Number(process.env.MEMBER_STAGING_PORT??4327);
if(![4327,4328].includes(port)) throw new Error('Refusing an unexpected staging port');
const envPath=app+'/.env.local';
if(statSync(envPath).mode&0o077) throw new Error('Staging environment file must be private');
const env=parse(readFileSync(envPath));
if(env.GARMONPAY_MEMBERS_STAGING!=='1'||env.GARMONPAY_STAGING_SUPABASE_REF!=='bhxheuaoofiklsaurqlu'||env.NEXT_PUBLIC_SUPABASE_URL!=='https://bhxheuaoofiklsaurqlu.supabase.co'||!/^sb_secret_[A-Za-z0-9_-]{24,}$/.test(env.SUPABASE_SERVICE_ROLE_KEY??'')) throw new Error('Verified Phase 1 staging configuration required');
cpSync(app+'/.next/static',app+'/.next/standalone/.next/static',{recursive:true});
cpSync(app+'/public',app+'/.next/standalone/public',{recursive:true});
const child=spawn(process.execPath,[app+'/.next/standalone/server.js'],{
 cwd:app+'/.next/standalone',
 env:{PATH:process.env.PATH,HOME:process.env.HOME,...env,NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1'},
 stdio:'inherit',
});
child.on('exit',code=>process.exit(code??1));
console.log('Members standalone server starting on 127.0.0.1:'+port);
