import { runCeloRoomAction } from "@/lib/celo-actions";
export async function POST(request: Request) { return runCeloRoomAction(request,"takeover",body=>({round_id:body.round_id,accept:body.accept===true})); }
