import { notFound, redirect } from "next/navigation";
import { referralToken } from "@/lib/member-platform/invites";
import { readLedger } from "@/lib/member-platform/repository";

export const dynamic = "force-dynamic";

/** Staging invite. Does not set the legacy cookie, create a wallet session, or use /join. */
export default async function MemberJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const token = referralToken(code);
  if (!token || /^[0-9a-f]{32}$/.test(token)) notFound();
  const member = readLedger().members.find((item) => item.inviteCode === token);
  if (!member) notFound();
  redirect(`/member/referrals?invite=${token}`);
}
