import { lookupUsdPrice } from "@/lib/member-platform/prices";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "SOL";
  const price = await lookupUsdPrice(symbol);
  if (!price) return Response.json({ available: false, symbol: symbol.toUpperCase() }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ available: true, ...price }, { headers: { "Cache-Control": "no-store" } });
}
