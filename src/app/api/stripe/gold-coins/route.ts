import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { getGoldCoinPackage, GOLD_COIN_PACKAGES, type GoldCoinPackageId } from "@/lib/gold-coin-packages";
import { createGoldCoinPackCheckoutSession } from "@/lib/stripe-gold-coin-pack-checkout";

const USER_FACING = "Unable to process purchase. Please refresh and try again.";

/**
 * POST /api/stripe/gold-coins
 * Body: { packageId: GoldCoinPackageId } — Stripe Checkout for Gold Coins only.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserIdBearerOrCookie(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { packageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawId = typeof body.packageId === "string" ? body.packageId.trim() : "";
  const pkg = getGoldCoinPackage(rawId);
  if (!pkg) {
    console.error("[stripe/gold-coins] Package not found:", rawId, "Available:", Object.keys(GOLD_COIN_PACKAGES));
    return NextResponse.json(
      { error: `${USER_FACING} (invalid pack: ${rawId || "missing"})` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: userRow } = await supabase.from("users").select("email").eq("id", userId).maybeSingle();
  const email = (userRow as { email?: string } | null)?.email;
  if (!email) {
    return NextResponse.json({ error: "User email not found" }, { status: 400 });
  }

  const base = getCheckoutBaseUrl(request);
  const packageId = pkg.package_id as GoldCoinPackageId;
  const successUrl = `${base}/dashboard/wallet?purchased=true&package=${encodeURIComponent(packageId)}`;
  const cancelUrl = `${base}/dashboard/wallet?canceled=1`;

  const result = await createGoldCoinPackCheckoutSession({
    userId,
    email,
    packageId,
    successUrl,
    cancelUrl,
  });

  if ("error" in result) {
    console.error("[stripe/gold-coins]", result.error);
    return NextResponse.json({ error: USER_FACING }, { status: 500 });
  }

  return NextResponse.json({ url: result.url });
}
