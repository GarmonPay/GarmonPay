import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { localeInt } from "@/lib/format-number";
import {
  bonusGpayFromGcPackageRow,
  getGoldCoinPackage,
  matchDbPackageToCanonicalId,
  type GoldCoinPackageId,
} from "@/lib/gold-coin-packages";
import { createGoldCoinPackCheckoutSession } from "@/lib/stripe-gold-coin-pack-checkout";

const USER_FACING = "Unable to process purchase. Please refresh and try again.";

/**
 * POST /api/coins/checkout
 * Body: { packageId: string } — Stripe Checkout for a GC package.
 * Accepts either a catalog key (starter | basic | value | pro | elite) or a `gc_packages` row UUID.
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

  const packageIdRaw = typeof body.packageId === "string" ? body.packageId.trim() : "";
  if (!packageIdRaw) {
    return NextResponse.json({ error: "packageId required" }, { status: 400 });
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
  const successUrlGc = `${base}/dashboard/buy-coins?success=1`;
  const cancelUrlGc = `${base}/dashboard/buy-coins?canceled=1`;

  // 1) Fixed catalog (same keys as wallet "Buy Gold Coins" modal)
  const catalogPkg = getGoldCoinPackage(packageIdRaw);
  if (catalogPkg) {
    const pid = catalogPkg.package_id as GoldCoinPackageId;
    const successUrl = `${successUrlGc}&purchased=true&package=${encodeURIComponent(pid)}`;
    const result = await createGoldCoinPackCheckoutSession({
      userId,
      email,
      packageId: pid,
      successUrl,
      cancelUrl: cancelUrlGc,
    });
    if ("error" in result) {
      console.error("[coins/checkout] catalog session:", result.error, { packageId: packageIdRaw });
      return NextResponse.json({ error: USER_FACING }, { status: 500 });
    }
    return NextResponse.json({ url: result.url });
  }

  // 2) Database package (UUID) — select * so both bonus_gpay_coins and legacy bonus_sweeps_coins work
  const { data: rowRaw, error: pkgErr } = await supabase
    .from("gc_packages")
    .select("*")
    .eq("id", packageIdRaw)
    .maybeSingle();

  if (pkgErr) {
    console.error("[coins/checkout] gc_packages select:", pkgErr.message, { packageId: packageIdRaw });
    return NextResponse.json({ error: USER_FACING }, { status: 500 });
  }

  if (rowRaw) {
    const raw = rowRaw as Record<string, unknown>;
    const bonusGpay = bonusGpayFromGcPackageRow(raw);
    const p = {
      id: String(raw.id ?? ""),
      name: String(raw.name ?? "Pack"),
      price_cents: Math.floor(Number(raw.price_cents ?? 0)),
      gold_coins: Math.floor(Number(raw.gold_coins ?? 0)),
      bonus_gpay_coins: bonusGpay,
      is_active: Boolean(raw.is_active),
    };

    // Inactive row but amounts match our catalog — use Stripe catalog checkout so purchase still works
    if (!p.is_active) {
      const inferred = matchDbPackageToCanonicalId(p);
      if (inferred) {
        console.warn("[coins/checkout] gc_packages row inactive; using catalog:", packageIdRaw, "->", inferred);
        const result = await createGoldCoinPackCheckoutSession({
          userId,
          email,
          packageId: inferred,
          successUrl: `${successUrlGc}&purchased=true&package=${encodeURIComponent(inferred)}`,
          cancelUrl: cancelUrlGc,
        });
        if ("url" in result) {
          return NextResponse.json({ url: result.url });
        }
      }
      console.error("[coins/checkout] Package inactive and no catalog match:", packageIdRaw);
      return NextResponse.json({ error: USER_FACING }, { status: 400 });
    }

    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: email,
        client_reference_id: userId,
        metadata: {
          user_id: userId,
          email,
          product_type: "gc_package",
          gc_package_id: p.id,
          gc_package_name: p.name,
          gold_coins: String(p.gold_coins),
          bonus_gpay_coins: String(bonusGpay),
          price_cents: String(p.price_cents),
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: p.price_cents,
              product_data: {
                name: `${p.name} — ${localeInt(p.gold_coins)} Gold Coins`,
              },
            },
          },
        ],
        success_url: successUrlGc,
        cancel_url: cancelUrlGc,
      });

      if (!session.url) {
        return NextResponse.json({ error: USER_FACING }, { status: 500 });
      }

      return NextResponse.json({ url: session.url });
    } catch (e) {
      console.error("[coins/checkout] gc_packages session:", e);
      return NextResponse.json({ error: USER_FACING }, { status: 500 });
    }
  }

  console.error("[coins/checkout] Package not found:", packageIdRaw, "— expected catalog key or gc_packages id");
  return NextResponse.json(
    {
      error: `${USER_FACING} If this continues, pick a different pack or contact support.`,
    },
    { status: 400 }
  );
}
