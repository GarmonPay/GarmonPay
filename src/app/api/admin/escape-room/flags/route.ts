import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";
import { createClient } from "@supabase/supabase-js";
import { creditEscapePayout } from "@/lib/escape-room-db";

async function adminUserId(request: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  let token: string | null = null;
  try {
    token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? null;
  } catch {
    /* ignore */
  }
  if (!token) {
    const h = request.headers.get("authorization");
    token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  }
  if (!token) return null;
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const status = new URL(request.url).searchParams.get("status") ?? "pending";
  const { data, error } = await supabase
    .from("escape_room_flags")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flags: data ?? [] });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" ? body.status : "";
  const notes = typeof body.notes === "string" ? body.notes : null;
  if (!id || !["legit", "cheated", "voided", "pending"].includes(status)) {
    return NextResponse.json({ error: "id and valid status required" }, { status: 400 });
  }
  const reviewer = await adminUserId(request);

  const { data: flag } = await supabase.from("escape_room_flags").select("*").eq("id", id).maybeSingle();
  if (!flag) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const f = flag as { session_id: string; player_id: string };

  await supabase
    .from("escape_room_flags")
    .update({
      status,
      notes,
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (status === "legit") {
    const { data: session } = await supabase
      .from("escape_room_sessions")
      .select("*")
      .eq("id", f.session_id)
      .maybeSingle();
    const s = session as Record<string, unknown> | null;
    if (s && s.result === "win" && s.mode === "stake") {
      const payout = Number(s.payout_cents ?? 0);
      const suspicious = !!s.suspicious;
      if (payout > 0 && suspicious) {
        const pay = await creditEscapePayout(String(s.player_id), f.session_id, payout);
        if (pay.ok) {
          await supabase
            .from("escape_room_sessions")
            .update({
              payout_status: "paid",
              payout_reference: `escape_win_${f.session_id}`,
              suspicious: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", f.session_id);
          const { data: prow } = await supabase
            .from("escape_room_payouts")
            .select("id")
            .eq("session_id", f.session_id)
            .maybeSingle();
          const paidPayload = {
            amount_cents: payout,
            status: "paid" as const,
            paid_at: new Date().toISOString(),
            error_message: null as string | null,
          };
          if (prow) {
            await supabase.from("escape_room_payouts").update(paidPayload).eq("session_id", f.session_id);
          } else {
            await supabase.from("escape_room_payouts").insert({
              session_id: f.session_id,
              player_id: String(s.player_id),
              ...paidPayload,
            });
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
