import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import {
  rebuildAdPackageFeatures,
  advertiserBurnCeilingUsd,
  type AdPackageRow,
} from "@/lib/ad-packages";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function int(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function assertProfitable(row: {
  price_monthly: number;
  ad_views: number;
  included_clicks: number;
}): string | null {
  const burn = advertiserBurnCeilingUsd(row);
  if (row.price_monthly + 1e-6 < burn) {
    return `Price must cover max ad-budget use $${burn.toFixed(2)} (2× member pool at $0.01/view + $0.05/click).`;
  }
  return null;
}

/** GET /api/admin/ad-packages — all rows (incl. inactive). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("ad_packages")
    .select("id, name, price_monthly, ad_views, included_clicks, sort_order, features, is_active")
    .order("sort_order", { ascending: true })
    .order("price_monthly", { ascending: true });
  if (error) {
    console.error("[admin/ad-packages GET]", error);
    return NextResponse.json({ message: "Failed to load packages" }, { status: 500 });
  }
  return NextResponse.json({ packages: data ?? [] });
}

/**
 * POST /api/admin/ad-packages — create package.
 * Body: { id, name, price_monthly, ad_views, included_clicks?, sort_order?, is_active? }
 */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const price = num(body.price_monthly);
  const views = int(body.ad_views);
  const clicks = int(body.included_clicks) ?? 0;
  const sortOrder = int(body.sort_order) ?? 0;
  const active = typeof body.is_active === "boolean" ? body.is_active : true;

  if (!id || !/^[a-z0-9_]+$/.test(id)) {
    return NextResponse.json(
      { message: "id is required (lowercase letters, numbers, underscores)" },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json({ message: "name is required" }, { status: 400 });
  }
  if (price == null || price <= 0) {
    return NextResponse.json({ message: "price_monthly must be a positive number" }, { status: 400 });
  }
  if (views == null || views < 1) {
    return NextResponse.json({ message: "ad_views must be at least 1" }, { status: 400 });
  }
  if (clicks < 0) {
    return NextResponse.json({ message: "included_clicks must be >= 0" }, { status: 400 });
  }

  const row = { price_monthly: price, ad_views: views, included_clicks: clicks };
  const bad = assertProfitable(row);
  if (bad) return NextResponse.json({ message: bad }, { status: 400 });

  const features = rebuildAdPackageFeatures(row);
  const { error } = await supabase.from("ad_packages").insert({
    id,
    name,
    price_monthly: price,
    ad_views: views,
    included_clicks: clicks,
    sort_order: sortOrder,
    is_active: active,
    features,
  });
  if (error) {
    console.error("[admin/ad-packages POST]", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}

/**
 * PATCH /api/admin/ad-packages — update one package by id.
 * Body: { id, name?, price_monthly?, ad_views?, included_clicks?, sort_order?, is_active?, preserve_features?: boolean }
 */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const { data: existing, error: fetchErr } = await supabase
    .from("ad_packages")
    .select("id, name, price_monthly, ad_views, included_clicks, sort_order, is_active, features")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ message: "Package not found" }, { status: 404 });
  }

  const cur = existing as AdPackageRow & { included_clicks?: number; sort_order?: number };

  let name = typeof body.name === "string" ? body.name.trim() : cur.name;
  if (!name) return NextResponse.json({ message: "name cannot be empty" }, { status: 400 });

  const p = num(body.price_monthly);
  const price_monthly = p ?? (typeof cur.price_monthly === "string" ? parseFloat(cur.price_monthly) : Number(cur.price_monthly));

  const v = int(body.ad_views);
  const ad_views = v ?? (typeof cur.ad_views === "string" ? parseInt(cur.ad_views, 10) : Math.round(Number(cur.ad_views)));

  const c = int(body.included_clicks);
  const included_clicks =
    c ?? (typeof cur.included_clicks === "number" ? cur.included_clicks : parseInt(String(cur.included_clicks ?? 0), 10) || 0);

  const so = int(body.sort_order);
  const sort_order = so ?? (typeof cur.sort_order === "number" ? cur.sort_order : 0);

  let is_active = cur.is_active !== false;
  if (typeof body.is_active === "boolean") is_active = body.is_active;

  if (!Number.isFinite(price_monthly) || price_monthly <= 0) {
    return NextResponse.json({ message: "Invalid price_monthly" }, { status: 400 });
  }
  if (!Number.isFinite(ad_views) || ad_views < 1) {
    return NextResponse.json({ message: "Invalid ad_views" }, { status: 400 });
  }
  if (included_clicks < 0) {
    return NextResponse.json({ message: "included_clicks must be >= 0" }, { status: 400 });
  }

  const row = { price_monthly, ad_views, included_clicks };
  const bad = assertProfitable(row);
  if (bad) return NextResponse.json({ message: bad }, { status: 400 });

  const features =
    body.preserve_features === true ? cur.features : rebuildAdPackageFeatures(row);

  const { error } = await supabase
    .from("ad_packages")
    .update({
      name,
      price_monthly,
      ad_views,
      included_clicks,
      sort_order,
      is_active,
      features,
    })
    .eq("id", id);

  if (error) {
    console.error("[admin/ad-packages PATCH]", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
