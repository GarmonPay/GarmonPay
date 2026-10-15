import { assertCampaignDraft, quoteCampaignSol } from "@/lib/member-platform/advertising";
import { lookupUsdPrice } from "@/lib/member-platform/prices";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const views = Number(url.searchParams.get("views"));
  try {
    const draft = assertCampaignDraft({
      title: "Quote",
      url: "https://garmonpay.com",
      tier: url.searchParams.get("tier") ?? "",
      views,
    });
    const price = await lookupUsdPrice("SOL");
    if (!price) return Response.json({ purchaseMicrousd: draft.purchaseMicrousd, solAvailable: false, paymentEnabled: false });
    const quote = quoteCampaignSol({
      tier: draft.tier,
      views: draft.views,
      solPriceMicrousd: price.microusd,
      rateObservedAt: price.observedAt,
      now: Date.now(),
    });
    return Response.json({ ...quote, solAvailable: true, illustrative: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to quote that package." }, { status: 400 });
  }
}
