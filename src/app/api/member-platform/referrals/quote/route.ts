import { parseSolToLamports } from "@/lib/member-platform/economics";
import { quoteReferral } from "@/lib/member-platform/referrals";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const purchase = parseSolToLamports(url.searchParams.get("purchase") ?? "");
  const earning = parseSolToLamports(url.searchParams.get("earning") ?? "0", true);
  const prior = Number(url.searchParams.get("prior") ?? "0");
  if (!purchase || earning === null || !Number.isInteger(prior) || prior < 0) {
    return Response.json({ error: "Enter a purchase amount in SOL. Verified earnings can be zero." }, { status: 400 });
  }
  return Response.json(quoteReferral({ purchaseLamports: purchase, verifiedEarningLamports: earning, priorQualifyingPurchases: prior }), { headers: { "Cache-Control": "no-store" } });
}
