import { runCeloRoomAction } from "@/lib/celo-actions";
export async function POST(request:Request) { return runCeloRoomAction(request,"create",b=>({name:b.name,max_players:b.max_players,minimum_entry_sc:b.minimum_entry_sc,starting_bank_sc:b.starting_bank_sc})); }
