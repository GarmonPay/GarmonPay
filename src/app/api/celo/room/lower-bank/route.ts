import { runCeloRoomAction } from "@/lib/celo-actions";
export async function POST(request: Request) { return runCeloRoomAction(request,"lower",body=>({new_bank_sc:body.new_bank_sc})); }
