import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

type DepositRow = {
  id: string;
  user_id: string;
  amount: number;
  status?: string | null;
  stripe_session?: string | null;
  created_at: string;
  user_email?: string;
};

/** GET /api/admin/deposits — list wallet deposits for admin. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable", deposits: [] }, { status: 503 });
  }

  const { data: deposits, error } = await supabase
    .from("deposits")
    .select("id, user_id, amount, status, stripe_session, created_at")
    .order("created_at", { ascending: false });

  let rows: DepositRow[] = [];

  if (!error) {
    rows = (deposits ?? []).map((d) => ({
      id: String((d as { id: string }).id),
      user_id: String((d as { user_id: string }).user_id),
      amount: Number((d as { amount?: number }).amount ?? 0),
      status: String((d as { status?: string }).status ?? "completed"),
      stripe_session: (d as { stripe_session?: string | null }).stripe_session ?? null,
      created_at: String((d as { created_at: string }).created_at),
    }));
  } else {
    // Fallback: infer deposits from transactions where type='deposit'.
    const txFallback = await supabase
      .from("transactions")
      .select("id, user_id, amount, status, created_at, reference_id, type")
      .eq("type", "deposit")
      .order("created_at", { ascending: false });

    if (txFallback.error) {
      return NextResponse.json(
        { message: txFallback.error.message, deposits: [] },
        { status: 500 }
      );
    }

    rows = (txFallback.data ?? []).map((t) => ({
      id: String((t as { id: string }).id),
      user_id: String((t as { user_id: string }).user_id),
      amount: Number((t as { amount?: number }).amount ?? 0),
      status: String((t as { status?: string }).status ?? "completed"),
      stripe_session: (t as { reference_id?: string | null }).reference_id ?? null,
      created_at: String((t as { created_at: string }).created_at),
    }));
  }

  const uniqueUserIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  const emailById = new Map<string, string>();

  if (uniqueUserIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, email").in("id", uniqueUserIds);
    for (const user of users ?? []) {
      const row = user as { id: string; email: string | null };
      if (row.email) emailById.set(row.id, row.email);
    }
  }

  return NextResponse.json({
    deposits: rows.map((r) => ({
      ...r,
      user_email: emailById.get(r.user_id) ?? null,
    })),
  });
}
