import { NextResponse } from "next/server";
import { POST as withdrawalHandler } from "@/app/api/withdrawals/route";

/**
 * Mobile-ready withdraw endpoint.
 * Accepts:
 * - amountCents or amount (USD)
 * - method (crypto|paypal|bank)
 * - walletAddress or wallet_address
 */
export async function POST(request: Request) {
  let body: {
    amountCents?: number;
    amount?: number;
    method?: string;
    walletAddress?: string;
    wallet_address?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  let amountCents: number | null = null;
  if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) {
    amountCents = Math.round(body.amountCents);
  } else if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    amountCents = body.amount > 1000 ? Math.round(body.amount) : Math.round(body.amount * 100);
  }

  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ message: "amountCents or amount is required" }, { status: 400 });
  }

  const walletAddress =
    typeof body.walletAddress === "string"
      ? body.walletAddress
      : typeof body.wallet_address === "string"
        ? body.wallet_address
        : "";

  const forwarded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      amount: amountCents,
      method: body.method ?? "crypto",
      wallet_address: walletAddress,
    }),
  });
  return withdrawalHandler(forwarded);
}
