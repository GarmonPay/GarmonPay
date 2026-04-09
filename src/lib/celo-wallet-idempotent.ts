import { walletLedgerEntry, type LedgerEntryError, type LedgerEntryResult } from "@/lib/wallet-ledger";

function isDuplicateLedgerRejection(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("duplicate");
}

export type IdempotentWinResult =
  | LedgerEntryResult
  | { success: true; skipped: true; reason: "duplicate_reference" | "non_positive_amount" };

/**
 * Credit via game_win; if reference already exists in wallet_ledger, treat as no-op success (idempotent).
 */
export async function walletLedgerGameWinIdempotent(
  userId: string,
  amountCents: number,
  reference: string
): Promise<IdempotentWinResult | LedgerEntryError> {
  if (amountCents <= 0) {
    return { success: true, skipped: true, reason: "non_positive_amount" };
  }
  const r = await walletLedgerEntry(userId, "game_win", amountCents, reference);
  if (r.success) return r;
  if (isDuplicateLedgerRejection(r.message)) {
    return { success: true, skipped: true, reason: "duplicate_reference" };
  }
  return r;
}
