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
    const rows = await listAllTransactions();
    return NextResponse.json({ transactions: rows });
  } catch (e) {
    console.error("[admin transactions]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Failed to list transactions" },
      { status: 500 }
    );
  }
}
