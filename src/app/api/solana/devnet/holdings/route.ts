import { json } from "@/lib/solana/http";
import { getSolanaSession } from "@/lib/solana/session";
import { readDevnetHoldings } from "@/lib/solana/devnet-holdings";
import { rateLimitOr429 } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimitOr429(request, "solana-devnet-holdings", 30);
  if (limited) return limited;
  const session = await getSolanaSession();
  if (!session) return json({ signedIn: false, holdings: [] });
  return json(await readDevnetHoldings(session.wallet));
}
