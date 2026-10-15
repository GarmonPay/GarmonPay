import { lookupWalletDirectory } from "@/lib/member-platform/wallet-account";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle");
  const result = await lookupWalletDirectory({ handle, query: url.searchParams.get("q") });
  if ("error" in result && result.error) return Response.json({ error: result.error }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const members = result.members ?? [];
  if (handle) {
    const profile = members[0];
    if (!profile?.handle) return Response.json({ error: "Member not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ members }, { headers: { "Cache-Control": "no-store" } });
}
