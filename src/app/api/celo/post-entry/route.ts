import { runCeloRoomAction } from "@/lib/celo-actions";
export async function POST(request:Request) { return runCeloRoomAction(request,"entry",b=>({amount:b.amount??b.entry_sc})); }
