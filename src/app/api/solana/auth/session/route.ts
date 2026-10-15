import { getSolanaSession } from "@/lib/solana/session";
import { json } from "@/lib/solana/http";
export const dynamic = "force-dynamic";
export async function GET() { const session = await getSolanaSession(); return json(session || { wallet: null }, session ? 200 : 401); }
