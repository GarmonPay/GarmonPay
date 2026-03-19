import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

/** GET /api/admin/garmon-ads/blocked-ips — list blocked IP prefixes. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const { data, error } = await supabase
    .from("garmon_blocked_ips")
    .select("id, ip_prefix, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ blockedIps: data ?? [] });
}

/** POST /api/admin/garmon-ads/blocked-ips — add blocked IP prefix. Body: { ipPrefix, reason? } */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  let body: { ipPrefix?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const prefix = (body.ipPrefix ?? "").trim();
  if (!prefix) return NextResponse.json({ message: "ipPrefix required" }, { status: 400 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const { data, error } = await supabase
    .from("garmon_blocked_ips")
    .insert({ ip_prefix: prefix, reason: body.reason ?? null })
    .select("id, ip_prefix, reason, created_at")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ blockedIp: data });
}

/** DELETE /api/admin/garmon-ads/blocked-ips — remove by id. Query: ?id= */
export async function DELETE(request: Request) {
  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const { error } = await supabase.from("garmon_blocked_ips").delete().eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
