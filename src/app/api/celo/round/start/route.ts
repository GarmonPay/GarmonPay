import { runCeloRoomAction } from "@/lib/celo-actions";
export async function POST(request:Request) { return runCeloRoomAction(request,"start"); }
