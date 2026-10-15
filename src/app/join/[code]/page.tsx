import { notFound, redirect } from "next/navigation";
import { referralToken } from "@/lib/member-platform/invites";
import { readLedger } from "@/lib/member-platform/repository";

export const dynamic = "force-dynamic";

/** Wallet invite. Does not set the legacy garmonpay_ref cookie or redirect to /register. */
export default function JoinPage({ params }: { params: { code: string } }) {
  const token = referralToken(params.code);
  if (!token || /^[0-9a-f]{32}$/.test(token)) notFound();
  const member = readLedger().members.find((item) => item.inviteCode === token);
  if (!member) notFound();
  redirect(`/member/referrals?invite=${token}`);
}
