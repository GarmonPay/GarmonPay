import { createAdminClient } from "@/lib/supabase";
import { json } from "@/lib/solana/http";
import { walletAuthEnabled } from "@/lib/solana/policy";
export const dynamic="force-dynamic";
export async function GET(){
 if(!walletAuthEnabled())return json({tokens:[],recordsStatus:"paused",rankingStatus:"awaiting_verified_indexer"});
 const db=createAdminClient();if(!db)return json({error:"Discovery unavailable"},503);
 const {data,error}=await db.from("gp_sol_launches").select("mint_address,name,symbol,lifecycle").not("provenance_verified_at","is",null).in("lifecycle",["curve","graduating","graduated"]).order("created_at",{ascending:false}).limit(50);
 if(error)return json({error:"Discovery unavailable"},503);
 return json({tokens:(data||[]).map(t=>({mint:t.mint_address,name:t.name,symbol:t.symbol,lifecycle:t.lifecycle})),rankingStatus:"awaiting_verified_indexer"});
}
