import { json } from "@/lib/solana/http";
import { readDevnetMarket } from "@/lib/solana/devnet-market";
import { rateLimitOr429 } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimitOr429(request, "solana-devnet-market", 60);
  if (limited) return limited;
  const mint = new URL(request.url).searchParams.get("mint") ?? "";
  const market = await readDevnetMarket(mint).catch(() => null);
  if (!market) return json({ error: "This Devnet coin could not be read." }, 404);
  return json(market);
}
