import { referralToken } from "@/lib/member-platform/invites";
import { lookupWalletInvite } from "@/lib/member-platform/wallet-account";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = referralToken(new URL(request.url).searchParams.get("code"));
  if (!token || /^[0-9a-f]{32}$/.test(token)) return Response.json({ active: false });
  const member = await lookupWalletInvite(token);
  if (!member) return Response.json({ active: false });
  return Response.json({ active: true, handle: member.handle, displayName: member.displayName }, { headers: { "Cache-Control": "no-store" } });
}
