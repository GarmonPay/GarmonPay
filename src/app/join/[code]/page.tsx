import { notFound, redirect } from "next/navigation";
import { referralToken } from "@/lib/solana/referral-token";

export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const token = referralToken(code);
  if (!token) notFound();
  redirect(`/solana/members?ref=${token}`);
}
