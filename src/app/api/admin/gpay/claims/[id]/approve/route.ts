import { NextResponse } from "next/server";
import { getAdminAuthUserId } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import {
  adminApproveGpayClaim,
  fetchGpayClaimForAdmin,
  gpayClaimToResponseJson,
  isValidGpayClaimId,
} from "@/lib/gpay-claim-admin";

/**
 * POST /api/admin/gpay/claims/[id]/approve — pending → approved; no GPay ledger movement (reserve already on submit).
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

  const claim = await fetchGpayClaimForAdmin(admin, claimId);
  if (!claim) {
    return NextResponse.json({ ok: false, message: "Claim not found" }, { status: 404 });
  }

  const result = await adminApproveGpayClaim(admin, claim, reviewerId);
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
