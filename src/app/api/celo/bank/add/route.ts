import { runCeloRoomAction } from "@/lib/celo-actions";
export async function POST(request:Request) { return runCeloRoomAction(request,"fund",b=>({amount:b.amount_sc})); }
