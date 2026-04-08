import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { gpayLedgerEntry, listGpayClaimsForUser } from "@/lib/gpay-ledger";

function parsePositiveIntMinor(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function minClaimAmountMinor(): number {
  const raw = process.env.GPAY_MIN_CLAIM_AMOUNT_MINOR?.trim();
  if (raw === undefined || raw === "") return 100;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/** Deterministic ledger reference when idempotency_key is set (global uniqueness in gpay_ledger.reference). */
function claimReserveReference(userId: string, claimId: string, idempotencyKey: string | null): string {
  if (idempotencyKey && idempotencyKey.trim() !== "") {
    const k = idempotencyKey.trim().slice(0, 240);
    return `gpay_claim_reserve:idemp:${userId}:${k}`;
  }
  return `gpay_claim_reserve:${claimId}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function claimJson(ex: Record<string, unknown>) {
  return {
    id: String(ex.id ?? ""),
    amountMinor: Math.trunc(Number(ex.amount_minor ?? 0)),
    status: String(ex.status ?? ""),
    requestedAt: String(ex.requested_at ?? ""),
    reviewedAt: ex.reviewed_at == null ? null : String(ex.reviewed_at),
    completedAt: ex.completed_at == null ? null : String(ex.completed_at),
    rejectReason: ex.reject_reason == null ? null : String(ex.reject_reason),
  };
}

/**
 * GET /api/gpay/claims — signed-in user's claims, newest first (Bearer only).
 */
export async function GET(request: Request) {
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rows = await listGpayClaimsForUser(userId);
  return NextResponse.json({
    claims: rows.map((c) => ({
      id: c.id,
      amountMinor: c.amount_minor,
      status: c.status,
      requestedAt: c.requested_at,
      reviewedAt: c.reviewed_at,
      completedAt: c.completed_at,
      rejectReason: c.reject_reason,
    })),
  });
}

/**
 * POST /api/gpay/claims — submit a claim: reserve available → pending_claim via claim_reserve + pending row.
 * Body: { amount_minor: number, idempotency_key?: string }
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service unavailable" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const amountMinor = parsePositiveIntMinor(body.amount_minor);
  if (amountMinor === null) {
    return NextResponse.json({ ok: false, message: "amount_minor must be a positive integer" }, { status: 400 });
  }

  const minAmt = minClaimAmountMinor();
  if (amountMinor < minAmt) {
    return NextResponse.json(
      { ok: false, message: `amount_minor must be at least ${minAmt} (GPAY_MIN_CLAIM_AMOUNT_MINOR)` },
      { status: 400 }
    );
  }

  let idempotencyKey: string | null = null;
  if (body.idempotency_key != null) {
    if (typeof body.idempotency_key !== "string") {
      return NextResponse.json({ ok: false, message: "idempotency_key must be a string if provided" }, { status: 400 });
    }
    const t = body.idempotency_key.trim();
    if (t.length > 256) {
      return NextResponse.json({ ok: false, message: "idempotency_key max length 256" }, { status: 400 });
    }
    idempotencyKey = t.length > 0 ? t : null;
  }

  if (idempotencyKey) {
    const { data: existing } = await admin
      .from("gpay_claims")
      .select("id, amount_minor, status, requested_at, reviewed_at, completed_at, reject_reason")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        ok: true,
        idempotentReplay: true,
        claim: claimJson(existing as Record<string, unknown>),
      });
    }
  }

  const claimId = crypto.randomUUID();
  const reserveRef = claimReserveReference(userId, claimId, idempotencyKey);

  const meta: Record<string, unknown> = {
    claim_id: claimId,
    flow: "claim_reserve",
  };
  if (idempotencyKey) meta.idempotency_key = idempotencyKey;

  let ledgerResult = await gpayLedgerEntry(userId, "claim_reserve", amountMinor, reserveRef, meta);

  if (!ledgerResult.success) {
    const msg = ledgerResult.message;
    const isDup = msg.toLowerCase().includes("duplicate");
    if (isDup && idempotencyKey) {
      for (let i = 0; i < 20; i++) {
        await sleep(50);
        const { data: raced } = await admin
          .from("gpay_claims")
          .select("id, amount_minor, status, requested_at, reviewed_at, completed_at, reject_reason")
          .eq("user_id", userId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (raced) {
          return NextResponse.json({
            ok: true,
            idempotentReplay: true,
            claim: claimJson(raced as Record<string, unknown>),
          });
        }
      }
      return NextResponse.json(
        { ok: false, message: "Duplicate reserve reference; retry or use a new idempotency_key", duplicate: true },
        { status: 409 }
      );
    }
    const insufficient =
      msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("invalid state");
    return NextResponse.json({ ok: false, message: msg }, { status: 400 });
  }

  const { data: inserted, error: insertError } = await admin
    .from("gpay_claims")
    .insert({
      id: claimId,
      user_id: userId,
      amount_minor: amountMinor,
      status: "pending",
      idempotency_key: idempotencyKey,
      metadata: {
        ledger_id: ledgerResult.ledger_id,
        reserve_reference: reserveRef,
      },
    })
    .select("id, amount_minor, status, requested_at, reviewed_at, completed_at, reject_reason")
    .single();

  if (insertError) {
    const rollback = await gpayLedgerEntry(
      userId,
      "claim_release",
      amountMinor,
      `gpay_claim_release_rollback:${claimId}`,
      { reason: "claim_row_insert_failed", claim_id: claimId }
    );
    if (!rollback.success) {
      console.error("[gpay/claims] rollback failed after insert error:", insertError.message, rollback.message);
    }
    if (insertError.code === "23505" && idempotencyKey) {
      const { data: raced } = await admin
        .from("gpay_claims")
        .select("id, amount_minor, status, requested_at, reviewed_at, completed_at, reject_reason")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) {
        return NextResponse.json({
          ok: true,
          idempotentReplay: true,
          claim: claimJson(raced as Record<string, unknown>),
        });
      }
    }
    return NextResponse.json({ ok: false, message: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    idempotentReplay: false,
    claim: claimJson(inserted as Record<string, unknown>),
    ledgerId: ledgerResult.ledger_id,
    gpayAvailableBalanceMinor: ledgerResult.available_minor,
    gpayPendingClaimBalanceMinor: ledgerResult.pending_claim_minor,
    gpayClaimedBalanceMinor: ledgerResult.claimed_lifetime_minor,
    gpayLifetimeEarnedMinor: ledgerResult.lifetime_earned_minor,
  });
}
