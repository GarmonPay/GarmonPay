import { runCeloRoomAction } from "@/lib/celo-actions";
export async function POST(request: Request) { return runCeloRoomAction(request,"setup",body=>({name:body.name,minimum_entry_sc:body.minimum_entry_sc,max_players:body.max_players,funding_amount_sc:body.funding_amount_sc})); }
