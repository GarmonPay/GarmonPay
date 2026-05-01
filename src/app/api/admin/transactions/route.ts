import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { listAllTransactions } from "@/lib/transactions-db";

/** GET /api/admin/transactions — list all transactions with user email (admin only). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (!createAdminClient()) {
    return NextResponse.json({ transactions: [] });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "100");
    const offset = Number(searchParams.get("offset") ?? "0");
    const rows = await listAllTransactions({
      limit: Number.isFinite(limit) ? limit : 100,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return NextResponse.json({
      transactions: rows,
      limit: Number.isFinite(limit) ? limit : 100,
      offset: Number.isFinite(offset) ? offset : 0,
    });
  } catch (e) {
    console.error("[admin transactions]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Failed to list transactions" },
      { status: 500 }
    );
  }
}
