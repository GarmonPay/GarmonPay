import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";

/**
 * POST /api/admin/recover-payments
 * Deprecated: use POST /api/admin/recover-stripe-payments instead.
 */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      message: "Use POST /api/admin/recover-stripe-payments to recover and credit Stripe payments.",
      deprecated: true,
      replacement: "/api/admin/recover-stripe-payments",
    },
    { status: 410 }
  );
}
