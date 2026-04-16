import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";

/**
 * POST /api/celo/room/close — disabled per GarmonPay rules (no manual close; rooms wind down when entries clear).
 */
export async function POST(_req: Request) {
  const userId = await getAuthUserIdStrict(_req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error:
        "Manual room close is not available. The table stays open until players leave and entries are cleared.",
    },
    { status: 403 }
  );
}
