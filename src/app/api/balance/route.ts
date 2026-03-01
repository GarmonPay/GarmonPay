import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getWalletSnapshot } from "@/lib/wallet-ledger";

/** Mobile-ready balance endpoint. Requires Bearer token. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const wallet = await getWalletSnapshot(userId);
  if (!wallet) {
    return NextResponse.json({ message: "Wallet not found" }, { status: 404 });
  }
  if (wallet.isBanned) {
    return NextResponse.json({ message: "Account is suspended" }, { status: 403 });
  }

  return NextResponse.json({
    userId: wallet.userId,
    balanceCents: wallet.balanceCents,
    totalDepositsCents: wallet.totalDepositsCents,
    totalWithdrawalsCents: wallet.totalWithdrawalsCents,
    totalEarningsCents: wallet.totalEarningsCents,
    withdrawableCents: wallet.withdrawableCents,
  });
}
