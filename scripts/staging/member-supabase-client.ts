// Copy only into the isolated Members staging app. Never replace production core clients.
import 'server-only';
import {createClient} from '@supabase/supabase-js';

export function createAdminClient(){
 const ref=process.env.GARMONPAY_STAGING_SUPABASE_REF;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(process.env.GARMONPAY_MEMBERS_STAGING!=='1'||ref!=='bhxheuaoofiklsaurqlu'||url!=='https://bhxheuaoofiklsaurqlu.supabase.co'||!key||!/^sb_secret_[A-Za-z0-9_-]{24,}$/.test(key))throw new Error('Verified Phase 1 staging database configuration required');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
