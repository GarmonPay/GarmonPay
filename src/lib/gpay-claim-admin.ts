/**
 * Admin-only GPay claim workflow: approve (no ledger), reject (claim_release), complete (claim_settle).
 * Uses gpayLedgerEntry only; separate from USD wallet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getGpayBalanceSnapshot, gpayLedgerEntry } from "@/lib/gpay-ledger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidGpayClaimId(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export interface GpayClaimAdminRow {
  id: string;
  user_id: string;
  amount_minor: number;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  completed_at: string | null;
  reject_reason: string | null;
  reviewer_id: string | null;
  metadata: Record<string, unknown>;
}

export function gpayClaimToResponseJson(row: GpayClaimAdminRow) {
  return {
    id: row.id,
    amountMinor: row.amount_minor,
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    completedAt: row.completed_at,
    rejectReason: row.reject_reason,
  };
}

export async function fetchGpayClaimForAdmin(
  admin: SupabaseClient,
  claimId: string
): Promise<GpayClaimAdminRow | null> {
  const { data, error } = await admin
    .from("gpay_claims")
    .select("id, user_id, amount_minor, status, requested_at, reviewed_at, completed_at, reject_reason, reviewer_id, metadata")
    .eq("id", claimId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    user_id: String(r.user_id ?? ""),
    amount_minor: Math.trunc(Number(r.amount_minor ?? 0)),
    status: String(r.status ?? ""),
    requested_at: String(r.requested_at ?? ""),
    reviewed_at: r.reviewed_at == null ? null : String(r.reviewed_at),
    completed_at: r.completed_at == null ? null : String(r.completed_at),
    reject_reason: r.reject_reason == null ? null : String(r.reject_reason),
    reviewer_id: r.reviewer_id == null ? null : String(r.reviewer_id),
    metadata:
      typeof r.metadata === "object" && r.metadata !== null && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {},
  };
}

function isDuplicateLedgerMessage(msg: string): boolean {
  return msg.toLowerCase().includes("duplicate");
}

function isInsufficientLedgerMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("insufficient") || m.includes("invalid state");
}

/** Approve: pending → approved. No balance movement (reserve already on submit). */
export async function adminApproveGpayClaim(
  admin: SupabaseClient,
  claim: GpayClaimAdminRow,
  reviewerId: string
): Promise<
  | { ok: true; idempotentReplay: boolean; claim: GpayClaimAdminRow; balances: GpayBalancesJson }
  | { ok: false; status: number; message: string }
> {
  if (claim.status === "approved") {
    const fresh = await fetchGpayClaimForAdmin(admin, claim.id);
    const balances = await balancesForUser(claim.user_id);
    return {
      ok: true,
      idempotentReplay: true,
      claim: fresh ?? claim,
      balances,
    };
  }
  if (claim.status !== "pending") {
    return {
      ok: false,
      status: 409,
      message: `Claim cannot be approved from status "${claim.status}" (expected pending)`,
    };
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("gpay_claims")
    .update({
      status: "approved",
      reviewed_at: now,
      reviewer_id: reviewerId,
      updated_at: now,
    })
    .eq("id", claim.id)
    .eq("status", "pending")
    .select("id, user_id, amount_minor, status, requested_at, reviewed_at, completed_at, reject_reason, reviewer_id, metadata")
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: error.message };
  }
  if (!updated) {
    const fresh = await fetchGpayClaimForAdmin(admin, claim.id);
    if (fresh?.status === "approved") {
      const balances = await balancesForUser(claim.user_id);
      return { ok: true, idempotentReplay: true, claim: fresh, balances };
    }
    return { ok: false, status: 409, message: "Claim state changed; could not approve" };
  }

  const row = await fetchGpayClaimForAdmin(admin, claim.id);
  const balances = await balancesForUser(claim.user_id);
  return { ok: true, idempotentReplay: false, claim: row ?? claim, balances };
}

/** Reject: pending or approved → rejected; claim_release restores pending → available. */
export async function adminRejectGpayClaim(
  admin: SupabaseClient,
  claim: GpayClaimAdminRow,
  reviewerId: string,
  rejectReason: string | null
): Promise<
  | { ok: true; idempotentReplay: boolean; claim: GpayClaimAdminRow; balances: GpayBalancesJson }
  | { ok: false; status: number; message: string }
> {
  if (claim.status === "rejected") {
    const fresh = await fetchGpayClaimForAdmin(admin, claim.id);
    const balances = await balancesForUser(claim.user_id);
    return { ok: true, idempotentReplay: true, claim: fresh ?? claim, balances };
  }
  if (claim.status === "completed" || claim.status === "cancelled") {
    return {
      ok: false,
      status: 409,
      message: `Claim cannot be rejected from status "${claim.status}"`,
    };
  }
  if (claim.status !== "pending" && claim.status !== "approved") {
    return {
      ok: false,
      status: 409,
      message: `Claim cannot be rejected from status "${claim.status}"`,
    };
  }

  const amount = claim.amount_minor;
  const releaseRef = `gpay_claim_release:reject:${claim.id}`;
  const ledgerResult = await gpayLedgerEntry(claim.user_id, "claim_release", amount, releaseRef, {
    claim_id: claim.id,
    action: "reject",
  });

  if (!ledgerResult.success) {
    const msg = ledgerResult.message;
    if (isDuplicateLedgerMessage(msg)) {
      // Release already recorded; continue to persist rejected status if needed.
    } else if (isInsufficientLedgerMessage(msg)) {
      return {
        ok: false,
        status: 409,
        message: msg,
      };
    } else {
      return { ok: false, status: 400, message: msg };
    }
  }

  const now = new Date().toISOString();
  const meta = {
    ...claim.metadata,
    ...(ledgerResult.success && { reject_release_ledger_id: ledgerResult.ledger_id }),
  };

  const { data: updated, error } = await admin
    .from("gpay_claims")
    .update({
      status: "rejected",
      reviewed_at: claim.reviewed_at ?? now,
      reviewer_id: reviewerId,
      reject_reason: rejectReason?.trim() || null,
      metadata: meta,
      updated_at: now,
    })
    .eq("id", claim.id)
    .in("status", ["pending", "approved"])
    .select("id, user_id, amount_minor, status, requested_at, reviewed_at, completed_at, reject_reason, reviewer_id, metadata")
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: error.message };
  }
  if (!updated) {
    const fresh = await fetchGpayClaimForAdmin(admin, claim.id);
    if (fresh?.status === "rejected") {
      const balances = await balancesForUser(claim.user_id);
      return {
        ok: true,
        idempotentReplay: true,
        claim: fresh,
        balances,
      };
    }
    return { ok: false, status: 409, message: "Claim state changed; could not reject" };
  }

  const row = await fetchGpayClaimForAdmin(admin, claim.id);
  const balances = await balancesForUser(claim.user_id);
  return {
    ok: true,
    idempotentReplay: false,
    claim: row ?? claim,
    balances,
  };
}

export interface GpayBalancesJson {
  gpayAvailableBalanceMinor: number;
  gpayPendingClaimBalanceMinor: number;
  gpayClaimedBalanceMinor: number;
  gpayLifetimeEarnedMinor: number;
}

async function balancesForUser(userId: string): Promise<GpayBalancesJson> {
  const s = await getGpayBalanceSnapshot(userId);
  return {
    gpayAvailableBalanceMinor: s.available_minor,
    gpayPendingClaimBalanceMinor: s.pending_claim_minor,
    gpayClaimedBalanceMinor: s.claimed_lifetime_minor,
    gpayLifetimeEarnedMinor: s.lifetime_earned_minor,
  };
}

/** Complete: approved → completed; claim_settle moves pending → claimed_lifetime. */
export async function adminCompleteGpayClaim(
  admin: SupabaseClient,
  claim: GpayClaimAdminRow,
  reviewerId: string
): Promise<
  | { ok: true; idempotentReplay: boolean; claim: GpayClaimAdminRow; balances: GpayBalancesJson }
  | { ok: false; status: number; message: string }
> {
  if (claim.status === "completed") {
    const fresh = await fetchGpayClaimForAdmin(admin, claim.id);
    const balances = await balancesForUser(claim.user_id);
    return { ok: true, idempotentReplay: true, claim: fresh ?? claim, balances };
  }
  if (claim.status !== "approved") {
    return {
      ok: false,
      status: 409,
      message: `Claim can only be completed from approved (current: "${claim.status}")`,
    };
  }

  const amount = claim.amount_minor;
  const settleRef = `gpay_claim_settle:complete:${claim.id}`;
  const ledgerResult = await gpayLedgerEntry(claim.user_id, "claim_settle", amount, settleRef, {
    claim_id: claim.id,
    action: "complete",
  });

  if (!ledgerResult.success) {
    const msg = ledgerResult.message;
    if (isDuplicateLedgerMessage(msg)) {
      // Settle already on ledger; ensure row is completed.
    } else if (isInsufficientLedgerMessage(msg)) {
      return { ok: false, status: 409, message: msg };
    } else {
      return { ok: false, status: 400, message: msg };
    }
  }

  const now = new Date().toISOString();
  const meta = {
    ...claim.metadata,
    ...(ledgerResult.success && { complete_settle_ledger_id: ledgerResult.ledger_id }),
  };

  const { data: updated, error } = await admin
    .from("gpay_claims")
    .update({
      status: "completed",
      completed_at: now,
      reviewer_id: claim.reviewer_id ?? reviewerId,
      metadata: meta,
      updated_at: now,
    })
    .eq("id", claim.id)
    .eq("status", "approved")
    .select("id, user_id, amount_minor, status, requested_at, reviewed_at, completed_at, reject_reason, reviewer_id, metadata")
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: error.message };
  }
  if (!updated) {
    const fresh = await fetchGpayClaimForAdmin(admin, claim.id);
    if (fresh?.status === "completed") {
      const balances = await balancesForUser(claim.user_id);
      return {
        ok: true,
        idempotentReplay: true,
        claim: fresh,
        balances,
      };
    }
    return { ok: false, status: 409, message: "Claim state changed; could not complete" };
  }

  const row = await fetchGpayClaimForAdmin(admin, claim.id);
  const balances = await balancesForUser(claim.user_id);
  return {
    ok: true,
    idempotentReplay: false,
    claim: row ?? claim,
    balances,
  };
}
