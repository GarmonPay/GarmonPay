import { NextResponse } from "next/server";
import { getAdminAuthUserId, isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/launch-checklist */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("launch_checklist")
    .select("id, item_key, label, completed, completed_at, completed_by, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const items = data ?? [];
  const completed = items.filter((i) => (i as { completed?: boolean }).completed).length;
  const total = items.length;

  return NextResponse.json({
    items,
    completed,
    total,
    percentComplete: total ? Math.round((completed / total) * 100) : 0,
  });
}

/** PATCH /api/admin/launch-checklist — toggle item. Body: { itemKey, completed } */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const adminId = await getAdminAuthUserId(request);
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { itemKey?: string; completed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const itemKey = body.itemKey?.trim();
  if (!itemKey) {
    return NextResponse.json({ message: "itemKey required" }, { status: 400 });
  }
  const completed = !!body.completed;

  const { data, error } = await supabase
    .from("launch_checklist")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? adminId : null,
    })
    .eq("item_key", itemKey)
    .select("id, item_key, label, completed, completed_at, completed_by")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, item: data });
}
