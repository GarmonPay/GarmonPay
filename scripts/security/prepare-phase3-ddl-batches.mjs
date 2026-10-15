import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const audit=JSON.parse(readFileSync('docs/solana/hybrid-permission-matrix.json','utf8'));
const live=JSON.parse(readFileSync('docs/solana/phase3-acl-snapshot.json','utf8'));
const snapshots=new Map(live.tables.map(row=>[row.relname,row]));
const rights={D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER'};
const roles=new Set(['','anon','authenticated']);
const q=name=>'"'+name.replaceAll('"','""')+'"';
const folder='supabase/security/proposals/phase3-ddl-batches';mkdirSync(folder,{recursive:true});
const entries=[];
for(const entry of audit.entries){
 const row=snapshots.get(entry.table);assert(row&&row.relrowsecurity,`Missing protected table ${entry.table}`);
 const grants=[];
 for(const acl of (row.acl||'').slice(1,-1).split(',')){
  const [role,rest]=acl.split('=');if(!roles.has(role)||!rest)continue;
  const allowed=rest.split('/')[0];
  for(let i=0;i<allowed.length;i++){const privilege=rights[allowed[i]];if(privilege)grants.push({role:role||'PUBLIC',privilege,grantable:allowed[i+1]==='*'});}
 }
 entries.push({...entry,currentAcl:row.acl,currentRls:row.relrowsecurity,currentDdlGrants:grants,productionApplied:false});
}
const pending=entries.filter(entry=>entry.currentDdlGrants.length>0),batches=[];
for(let offset=0;offset<pending.length;offset+=2){
 const group=pending.slice(offset,offset+2),id=String(batches.length+1).padStart(3,'0');
 let proposal='-- Independent approval-only batch. No CRUD, row, policy or default changes.\nBEGIN;\nSET LOCAL lock_timeout = \'5s\';\n';
 let rollback='-- Exact observed DDL grant restoration only; recheck drift before approved use.\nBEGIN;\nSET LOCAL lock_timeout = \'5s\';\n';
 for(const entry of group){
  proposal+=`REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public.${q(entry.table)} FROM PUBLIC,anon,authenticated;\n`;
  for(const grant of entry.currentDdlGrants)rollback+=`GRANT ${grant.privilege} ON TABLE public.${q(entry.table)} TO ${grant.role==='PUBLIC'?'PUBLIC':q(grant.role)}${grant.grantable?' WITH GRANT OPTION':''};\n`;
 }
 const proposalPath=`${folder}/batch-${id}.sql`,rollbackPath=`${folder}/batch-${id}-rollback.sql`;
 writeFileSync(proposalPath,proposal+'COMMIT;\n');writeFileSync(rollbackPath,rollback+'COMMIT;\n');
 batches.push({id,tables:group.map(entry=>entry.table),proposalPath,rollbackPath,productionApplied:false,requiresExplicitApproval:true});
}
writeFileSync('docs/solana/phase3-ddl-batches.json',JSON.stringify({observedDate:'2026-10-12',priorCount:audit.count,currentPendingTables:pending.length,batches,entries,limitations:'Schema and static references only. Each production batch needs drift, external dependency and application review plus explicit approval. No batch is in the migration queue or applied.'},null,2)+'\n');
console.log(`${entries.length} tables reviewed against current ACLs; ${pending.length} still carry DDL grants; ${batches.length} independent batches of at most two tables prepared with exact rollback. No production change.`);
