import { NextResponse } from "next/server";

/**
 * GET /api/tokens/gpay-price
 * Optional: set GPAY_TOKEN_MINT in env for DexScreener quote.
 */
export async function GET() {
  const mint = process.env.GPAY_TOKEN_MINT?.trim();
  if (!mint) {
    return NextResponse.json({ usd: null, message: "Price not configured" });
  }

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) {
      return NextResponse.json({ usd: null });
    }
    const data = (await res.json()) as {
      pairs?: { priceUsd?: string }[];
    };
    const price = data.pairs?.[0]?.priceUsd;
    const usd = price != null ? Number(price) : null;
    return NextResponse.json({
      usd: Number.isFinite(usd) ? usd : null,
    });
  } catch {
    return NextResponse.json({ usd: null });
  }
}
