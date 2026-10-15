import { readFileSync, writeFileSync } from 'node:fs';
const audit=JSON.parse(readFileSync('docs/solana/security-catalog-before.json','utf8'));
const permissions=JSON.parse(readFileSync('docs/solana/security-permissions-before.json','utf8'));
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const privileges={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN'};
function grants(acl,object){
 return (acl||'').slice(1,-1).split(',').filter(Boolean).flatMap(x=>{
  const [grantee,rest]=x.split('=');
  if(!['anon','authenticated',''].includes(grantee))return [];
  const rights=[...rest.split('/')[0]].filter(c=>privileges[c]).map(c=>privileges[c]);
  return rights.length?[`GRANT ${rights.join(',')} ON TABLE public.${quote(object)} TO ${grantee?quote(grantee):'PUBLIC'};`]:[];
 });
}
let sql='-- Emergency only. Restores the inspected pre-migration permissions, including vulnerabilities.\n-- Does NOT revert the two previously deployed production security fixes.\nBEGIN;\n';
for(const t of permissions.tables)sql+=grants(t.relacl,t.relname).join('\n')+'\n';
for(const c of permissions.columns)if(c.attacl)sql+=`GRANT UPDATE (${quote(c.attname)}) ON public.${quote(c.relname)} TO authenticated;\n`;
for(const v of audit.views){sql+=grants(v.relacl,v.relname).join('\n')+'\n';sql+=`ALTER VIEW public.${quote(v.relname)} RESET (security_invoker);\n`;}
for(const f of audit.functions){
 if(!f.proconfig)sql+=`ALTER FUNCTION public.${f.signature} RESET search_path;\n`;
 if(f.prosecdef && f.anon_exec && !['check_username_available(text)','celo_user_in_room(uuid)'].includes(f.signature)){
  for(const a of (f.proacl||'').slice(1,-1).split(',')){
   const [grantee,rest]=a.split('=');
   if(['anon','authenticated',''].includes(grantee)&&rest?.startsWith('X'))sql+=`GRANT EXECUTE ON FUNCTION public.${f.signature} TO ${grantee?quote(grantee):'PUBLIC'};\n`;
  }
 }
}
for(const p of audit.policies.filter(p=>p.tablename==='users'&&['Authenticated can read users for leaderboard','Celo lobby read banker profiles'].includes(p.policyname)))sql+=`CREATE POLICY ${quote(p.policyname)} ON public.users FOR SELECT TO authenticated USING (${p.qual});\n`;
sql+='ALTER POLICY "Service role full access analytics_events" ON public.analytics_events TO PUBLIC USING (true) WITH CHECK (true);\n';
sql+='ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;\nALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;\nALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;\nCOMMIT;\n';
writeFileSync('supabase/security/solana-security-lockdown-rollback.sql',sql);
