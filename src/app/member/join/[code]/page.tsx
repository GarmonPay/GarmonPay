import { notFound, redirect } from "next/navigation";
import { referralToken } from "@/lib/member-platform/invites";
import { lookupWalletInvite } from "@/lib/member-platform/wallet-account";

export const dynamic = "force-dynamic";

/** Wallet invite. The signed login stores the referrer. This page does not create a staging profile. */
export default async function MemberJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const token = referralToken(code);
  if (!token || /^[0-9a-f]{32}$/.test(token)) notFound();
  const member = await lookupWalletInvite(token);
  if (!member) notFound();
  redirect(`/member?ref=${token}`);
}
