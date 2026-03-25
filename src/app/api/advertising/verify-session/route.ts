import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { getAdvertiserByUserId } from "@/lib/garmon-ads-db";

type VerifyBody = {
  session_id?: string;
};

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: VerifyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ message: "session_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let advertiserId: string;
  try {
    const advertiser = await getAdvertiserByUserId(userId);
    if (!advertiser) {
      return NextResponse.json(
        {
          message: "Create your advertiser profile first from the advertiser dashboard.",
          needs_advertiser_profile: true,
        },
        { status: 400 }
      );
    }
    advertiserId = advertiser.id;
  } catch (e) {
    console.error("[api/advertising/verify-session] advertiser lookup error", e);
    return NextResponse.json({ message: "Failed to load advertiser profile" }, { status: 500 });
  }

  const { data: existingPurchase, error: existingError } = await supabase
    .from("advertiser_package_purchases")
    .select("id, package_id, amount_paid, status, ad_views")
    .eq("stripe_session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    console.error("[api/advertising/verify-session] existing purchase lookup error", existingError);
    return NextResponse.json({ message: "Failed to verify purchase" }, { status: 500 });
  }

  if (existingPurchase) {
    return NextResponse.json({
      success: true,
      already_processed: true,
      purchase: existingPurchase,
    });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json({ message: "Checkout session is not paid yet" }, { status: 400 });
    }

    const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
    const purchaseType = meta.purchase_type;
    const packageId = meta.package_id?.trim() ?? "";
    const packageNameFromStripe = meta.package_name?.trim() ?? "";
    const adViewsFromStripe = Number(meta.ad_views);
    const userIdFromStripe = meta.user_id?.trim() ?? "";

    if (purchaseType !== "ad_package") {
      return NextResponse.json({ message: "Checkout session is not an ad package purchase" }, { status: 400 });
    }
    if (!packageId) {
      return NextResponse.json({ message: "Missing package metadata on Stripe session" }, { status: 400 });
    }
    if (userIdFromStripe && userIdFromStripe !== userId) {
      return NextResponse.json({ message: "Session does not belong to current user" }, { status: 403 });
    }

    const { data: pkg, error: pkgError } = await supabase
      .from("ad_packages")
      .select("id, name, price_monthly, ad_views, is_active")
      .eq("id", packageId)
      .maybeSingle();
    if (pkgError) {
      console.error("[api/advertising/verify-session] package fetch error", pkgError);
      return NextResponse.json({ message: "Failed to load package" }, { status: 500 });
    }
    if (!pkg) {
      return NextResponse.json({ message: "Package no longer exists" }, { status: 400 });
    }

    const packageName = String(pkg.name ?? packageNameFromStripe);
    const packagePrice = Number(pkg.price_monthly);
    const packageViews = Number(pkg.ad_views);
    const paidAmount = Number((session.amount_total ?? 0) / 100);

    if (!Number.isFinite(packagePrice) || packagePrice <= 0 || !Number.isFinite(packageViews) || packageViews <= 0) {
      return NextResponse.json({ message: "Package has invalid configuration" }, { status: 400 });
    }
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return NextResponse.json({ message: "Invalid paid amount on Stripe session" }, { status: 400 });
    }

    const purchasePayload = {
      user_id: userId,
      advertiser_id: advertiserId,
      package_id: packageId,
      package_name: packageName,
      stripe_session_id: sessionId,
      amount_paid: paidAmount,
      status: "paid",
      ad_views: Number.isFinite(adViewsFromStripe) && adViewsFromStripe > 0 ? adViewsFromStripe : packageViews,
    };

    const { data: insertedPurchase, error: insertError } = await supabase
      .from("advertiser_package_purchases")
      .upsert(purchasePayload, { onConflict: "stripe_session_id" })
      .select("id, package_id, amount_paid, status, ad_views")
      .single();
    if (insertError) {
      console.error("[api/advertising/verify-session] insert purchase error", insertError);
      return NextResponse.json({ message: "Failed to save purchase" }, { status: 500 });
    }

    const { data: existingCampaign, error: campaignLookupError } = await supabase
      .from("garmon_ads")
      .select("id, title, total_budget, remaining_budget, status, is_active")
      .eq("user_id", userId)
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (campaignLookupError) {
      console.error("[api/advertising/verify-session] campaign lookup error", campaignLookupError);
      return NextResponse.json({ message: "Failed to load campaign" }, { status: 500 });
    }

    let campaignId: string;
    if (existingCampaign) {
      const currentTotal = Number((existingCampaign as { total_budget?: number }).total_budget ?? 0);
      const currentRemaining = Number((existingCampaign as { remaining_budget?: number }).remaining_budget ?? 0);
      const nextTotal = currentTotal + packagePrice;
      const nextRemaining = currentRemaining + packagePrice;
      const { data: updatedCampaign, error: updateCampaignError } = await supabase
        .from("garmon_ads")
        .update({
          total_budget: nextTotal,
          remaining_budget: nextRemaining,
          status: "active",
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existingCampaign as { id: string }).id)
        .select("id")
        .single();
      if (updateCampaignError) {
        console.error("[api/advertising/verify-session] update campaign error", updateCampaignError);
        return NextResponse.json({ message: "Failed to attach package to campaign" }, { status: 500 });
      }
      campaignId = (updatedCampaign as { id: string }).id;
    } else {
      const { data: newCampaign, error: createCampaignError } = await supabase
        .from("garmon_ads")
        .insert({
          advertiser_id: advertiserId,
          user_id: userId,
          title: `${packageName} Campaign`,
          description: `Auto-created from ad package purchase (${packageViews.toLocaleString()} views).`,
          ad_type: "banner",
          total_budget: packagePrice,
          remaining_budget: packagePrice,
          status: "active",
          is_active: true,
          cost_per_view: 0.008,
          cost_per_click: 0.025,
          cost_per_follow: 0.05,
          cost_per_share: 0.03,
        })
        .select("id")
        .single();
      if (createCampaignError) {
        console.error("[api/advertising/verify-session] create campaign error", createCampaignError);
        return NextResponse.json({ message: "Failed to create campaign from package" }, { status: 500 });
      }
      campaignId = (newCampaign as { id: string }).id;
    }

    await supabase
      .from("advertiser_package_purchases")
      .update({ campaign_id: campaignId })
      .eq("id", (insertedPurchase as { id: string }).id);

    return NextResponse.json({
      success: true,
      purchase: insertedPurchase,
      campaign_id: campaignId,
      package: {
        id: packageId,
        name: packageName,
        ad_views: packageViews,
      },
    });
  } catch (e) {
    console.error("[api/advertising/verify-session] stripe verify error", e);
    const message = e instanceof Error ? e.message : "Failed to verify Stripe session";
    return NextResponse.json({ message }, { status: 500 });
  }
}
