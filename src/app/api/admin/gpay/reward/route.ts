import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { gpayLedgerEntry, type GpayLedgerEventType } from "@/lib/gpay-ledger";

/** Allowed credit event types for this ingest route only (earn path). */
const REWARD_CREDIT_EVENT_TYPES: readonly GpayLedgerEventType[] = [
  "reward_earn",
  "referral_reward",
  "game_reward",
  "ad_reward",
  "manual_credit",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function parsePositiveIntMinor(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/**
 * Trusted GPay reward credit ingest.
 * - Admin session or Bearer admin JWT (see isAdmin), OR
 * - Header `x-gpay-ingest-secret` matching env `GPAY_REWARD_INGEST_SECRET` (server-to-server).
 * `manual_credit` is admin-only (never via ingest secret).
 */
async function canIngestGpayReward(request: Request, eventType: GpayLedgerEventType): Promise<boolean> {
  if (await isAdmin(request)) return true;
  if (eventType === "manual_credit") return false;
  const secret = process.env.GPAY_REWARD_INGEST_SECRET?.trim();
  if (!secret) return false;
  const h = request.headers.get("x-gpay-ingest-secret");
  return h === secret;
}

/**
 * POST /api/admin/gpay/reward
 * Body: { user_id, event_type, amount_minor, reference, metadata? }
 * Server-side only; not for public browsers without admin/service credentials.
 */
export async function POST(request: Request) {
  if (!createAdminClient()) {
    return NextResponse.json({ ok: false, message: "Service unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!userId || !isValidUuid(userId)) {
    return NextResponse.json({ ok: false, message: "Invalid user_id" }, { status: 400 });
  }

  const eventTypeRaw = typeof body.event_type === "string" ? body.event_type.trim() : "";
  if (!REWARD_CREDIT_EVENT_TYPES.includes(eventTypeRaw as GpayLedgerEventType)) {
    return NextResponse.json(
      { ok: false, message: "Invalid or unsupported event_type for reward ingest" },
      { status: 400 }
    );
  }
  const eventType = eventTypeRaw as GpayLedgerEventType;

  if (!(await canIngestGpayReward(request, eventType))) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const amountMinor = parsePositiveIntMinor(body.amount_minor);
  if (amountMinor === null) {
    return NextResponse.json({ ok: false, message: "amount_minor must be a positive integer (minor units)" }, { status: 400 });
  }

  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!reference || reference.length > 512) {
    return NextResponse.json({ ok: false, message: "reference is required (non-empty, max 512 chars)" }, { status: 400 });
  }

  let metadata: Record<string, unknown> | null = null;
  if (body.metadata != null) {
    if (typeof body.metadata !== "object" || Array.isArray(body.metadata)) {
      return NextResponse.json({ ok: false, message: "metadata must be an object if provided" }, { status: 400 });
    }
    metadata = body.metadata as Record<string, unknown>;
  }

  const result = await gpayLedgerEntry(userId, eventType, amountMinor, reference, metadata);

  if (!result.success) {
    const msg = result.message;
    const isDup = msg.toLowerCase().includes("duplicate");
    return NextResponse.json(
      {
        ok: false,
        message: msg,
        duplicate: isDup,
      },
      { status: isDup ? 409 : 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    ledgerId: result.ledger_id,
    gpayAvailableBalanceMinor: result.available_minor,
    gpayPendingClaimBalanceMinor: result.pending_claim_minor,
    gpayClaimedBalanceMinor: result.claimed_lifetime_minor,
    gpayLifetimeEarnedMinor: result.lifetime_earned_minor,
  });
}
