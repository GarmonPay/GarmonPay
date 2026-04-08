import { NextResponse } from "next/server";
import { getAdminAuthUserId } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import {
  adminRejectGpayClaim,
  fetchGpayClaimForAdmin,
  gpayClaimToResponseJson,
  isValidGpayClaimId,
} from "@/lib/gpay-claim-admin";

/**
 * POST /api/admin/gpay/claims/[id]/reject — pending|approved → rejected; claim_release (pending → available).
 * Body (optional): { reject_reason?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reviewerId = await getAdminAuthUserId(request);
  if (!reviewerId) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service unavailable" }, { status: 503 });
  }

  const { id: claimId } = await params;
  if (!isValidGpayClaimId(claimId)) {
    return NextResponse.json({ ok: false, message: "Invalid claim id" }, { status: 400 });
  }

  let rejectReason: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body === "object" && "reject_reason" in body) {
      const r = (body as { reject_reason?: unknown }).reject_reason;
      if (r != null && typeof r !== "string") {
        return NextResponse.json({ ok: false, message: "reject_reason must be a string" }, { status: 400 });
      }
      if (typeof r === "string") {
        rejectReason = r.trim().slice(0, 2000) || null;
      }
    }
  } catch {
    rejectReason = null;
  }

  const claim = await fetchGpayClaimForAdmin(admin, claimId);
  if (!claim) {
    return NextResponse.json({ ok: false, message: "Claim not found" }, { status: 404 });
  }

  const result = await adminRejectGpayClaim(admin, claim, reviewerId, rejectReason);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    idempotentReplay: result.idempotentReplay,
    claim: gpayClaimToResponseJson(result.claim),
    ...result.balances,
  });
}
