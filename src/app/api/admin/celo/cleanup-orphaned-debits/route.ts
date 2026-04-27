import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { creditGpayIdempotent } from "@/lib/coins";

type CleanupBody = {
  roomId?: string;
  userId?: string;
  dryRun?: boolean;
};

const POST_ENTRY_PREFIX = "celo:post-entry:";
const LEGACY_POST_ENTRY_PREFIX = "celo_entry_post_";

function parseRef(reference: string): { roomId: string; userId: string } | null {
  if (reference.startsWith(LEGACY_POST_ENTRY_PREFIX)) {
    const rest = reference.slice(LEGACY_POST_ENTRY_PREFIX.length);
    const sep = rest.lastIndexOf("_");
    if (sep <= 0) return null;
    return {
      roomId: rest.slice(0, sep),
      userId: rest.slice(sep + 1),
    };
  }
  const parts = reference.split(":");
  if (parts.length < 5) return null;
  if (parts[0] !== "celo" || parts[1] !== "post-entry") return null;
  const roomId = parts[2] ?? "";
  const userId = parts[3] ?? "";
  if (!roomId || !userId) return null;
  return { roomId, userId };
}

export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: CleanupBody = {};
  try {
    body = (await request.json()) as CleanupBody;
  } catch {
    body = {};
  }

  const targetRoomId = String(body.roomId ?? "").trim();
  const targetUserId = String(body.userId ?? "").trim();
  const dryRun = body.dryRun === true;
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: debits, error: txErr } = await supabase
    .from("coin_transactions")
    .select("id, user_id, reference, gpay_coins, created_at, description")
    .lt("gpay_coins", 0)
    .or(`reference.ilike.${POST_ENTRY_PREFIX}%,reference.ilike.${LEGACY_POST_ENTRY_PREFIX}%`)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });
  if (txErr) {
    return NextResponse.json({ message: txErr.message ?? "Failed to load debits" }, { status: 500 });
  }

  const cleaned: Array<{
    txId: string;
    roomId: string;
    userId: string;
    amount: number;
    debitReference: string;
    reversalReference: string;
    dryRun: boolean;
  }> = [];
  const skipped: Array<{ txId: string; reason: string; reference: string }> = [];

  for (const row of debits ?? []) {
    const txId = String((row as { id?: string }).id ?? "");
    const reference = String((row as { reference?: string }).reference ?? "");
    const parsed = parseRef(reference);
    if (!parsed) {
      skipped.push({ txId, reason: "unparseable_reference", reference });
      continue;
    }
    if (targetRoomId && parsed.roomId !== targetRoomId) continue;
    if (targetUserId && parsed.userId !== targetUserId) continue;

    const amount = Math.abs(Math.floor(Number((row as { gpay_coins?: number }).gpay_coins ?? 0)));
    if (amount <= 0) {
      skipped.push({ txId, reason: "non_negative_amount", reference });
      continue;
    }

    const { data: seat, error: seatErr } = await supabase
      .from("celo_room_players")
      .select("entry_posted, stake_amount_sc")
      .eq("room_id", parsed.roomId)
      .eq("user_id", parsed.userId)
      .maybeSingle();
    if (seatErr) {
      skipped.push({ txId, reason: `seat_lookup_failed:${seatErr.message}`, reference });
      continue;
    }
    const posted = seat?.entry_posted === true && Number(seat?.stake_amount_sc ?? 0) > 0;
    if (posted) {
      skipped.push({ txId, reason: "entry_already_posted", reference });
      continue;
    }

    const reversalReference = `celo:post-entry-reversal:${txId}`;
    const legacyRefundReference = `celo_entry_refund_${parsed.roomId}_${parsed.userId}`;
    const { data: existingReversal } = await supabase
      .from("coin_transactions")
      .select("id")
      .eq("reference", reversalReference)
      .maybeSingle();
    if (existingReversal) {
      skipped.push({ txId, reason: "already_reversed", reference });
      continue;
    }
    const { data: legacyRefund } = await supabase
      .from("coin_transactions")
      .select("id")
      .eq("reference", legacyRefundReference)
      .gt("gpay_coins", 0)
      .maybeSingle();
    if (legacyRefund) {
      skipped.push({ txId, reason: "already_refunded_legacy", reference });
      continue;
    }
    if (!dryRun) {
      const credit = await creditGpayIdempotent(
        parsed.userId,
        amount,
        "C-Lo orphaned post-entry debit reversal",
        reversalReference,
        "celo_entry_reversal"
      );
      if (!credit.success) {
        skipped.push({ txId, reason: `credit_failed:${credit.message ?? "unknown"}`, reference });
        continue;
      }
      const prevDesc = String((row as { description?: string | null }).description ?? "").trim();
      const marker = `[REVERSED:${reversalReference}]`;
      const nextDesc = prevDesc.includes(marker)
        ? prevDesc
        : (prevDesc.length ? `${prevDesc} ${marker}` : marker);
      const { error: markErr } = await supabase
        .from("coin_transactions")
        .update({
          description: nextDesc,
        })
        .eq("id", txId);
      if (markErr) {
        skipped.push({ txId, reason: `mark_reversed_failed:${markErr.message}`, reference });
        continue;
      }
      // Best-effort structured mark when columns exist in DB.
      await supabase
        .from("coin_transactions")
        .update({
          reversed_at: new Date().toISOString(),
          reversal_reference: reversalReference,
        })
        .eq("id", txId);
    }

    cleaned.push({
      txId,
      roomId: parsed.roomId,
      userId: parsed.userId,
      amount,
      debitReference: reference,
      reversalReference,
      dryRun,
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    sinceIso,
    targetRoomId: targetRoomId || null,
    targetUserId: targetUserId || null,
    cleanedCount: cleaned.length,
    cleaned,
    skipped,
  });
}
