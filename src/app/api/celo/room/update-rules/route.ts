import {runCeloRoomAction} from "@/lib/celo-actions";
export async function POST(request:Request){return runCeloRoomAction(request,"rules",body=>({name:body.name,minimum_entry_sc:body.minimum_entry_sc,max_players:body.max_players}));}
