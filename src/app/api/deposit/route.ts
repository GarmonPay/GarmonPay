import { NextResponse } from "next/server";
import { POST as walletFundHandler } from "@/app/api/wallet/fund/route";

/**
 * Mobile-ready deposit endpoint.
 * Accepts { amountCents } or { amount } (USD dollars) and proxies to wallet funding.
 */
export async function POST(request: Request) {
  let body: { amountCents?: number; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  let amountCents: number | null = null;
  if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) {
    amountCents = Math.round(body.amountCents);
  } else if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    amountCents = Math.round(body.amount * 100);
  }
  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ message: "amountCents or amount is required" }, { status: 400 });
  }

  const forwarded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ amountCents }),
  });
  return walletFundHandler(forwarded);
}
