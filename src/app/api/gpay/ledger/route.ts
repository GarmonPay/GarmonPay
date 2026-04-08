import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { listGpayLedgerEntries } from "@/lib/gpay-ledger";

function parseLimitOffset(searchParams: URLSearchParams): { limit: number; offset: number } {
  const rawL = searchParams.get("limit");
  const rawO = searchParams.get("offset");
  let limit = rawL == null ? 50 : Math.floor(Number(rawL));
  if (!Number.isFinite(limit)) limit = 50;
  limit = Math.min(Math.max(limit, 1), 100);
  let offset = rawO == null ? 0 : Math.floor(Number(rawO));
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

/**
 * GET /api/gpay/ledger?limit=&offset= — authenticated user reads own ledger only (newest first).
 */
export async function GET(request: Request) {
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const { limit, offset } = parseLimitOffset(searchParams);

  const { rows, hasMore } = await listGpayLedgerEntries(userId, { limit, offset });

  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      amountMinor: r.amount_minor,
      reference: r.reference,
      metadata: r.metadata,
      createdAt: r.created_at,
    })),
    limit,
    offset,
    hasMore,
  });
}
