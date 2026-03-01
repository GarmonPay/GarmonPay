import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

const REQUIRED_TABLES = [
  "users",
  "transactions",
  "deposits",
  "withdrawals",
  "earnings",
  "admin_logs",
] as const;

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ connected: false, message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        connected: false,
        message: "Supabase admin client not configured",
        tables: REQUIRED_TABLES.map((name) => ({ name, ok: false })),
      },
      { status: 503 }
    );
  }

  const checks = await Promise.all(
    REQUIRED_TABLES.map(async (name) => {
      const { error } = await supabase.from(name).select("id", { head: true, count: "exact" });
      return {
        name,
        ok: !error,
        error: error?.message ?? null,
      };
    })
  );

  const missing = checks.filter((c) => !c.ok);
  return NextResponse.json(
    {
      connected: true,
      requiredTablesOk: missing.length === 0,
      tables: checks,
    },
    { status: missing.length === 0 ? 200 : 500 }
  );
}
