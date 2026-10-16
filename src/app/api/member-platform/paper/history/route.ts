import { requireWalletMember } from "@/lib/member-platform/wallet-account";
import { rateLimitOr429 } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const limited = rateLimitOr429(request, "paper-history", 60);
  if (limited) return limited;
  try {
    const actor = await requireWalletMember();
    const url = new URL(request.url), at = url.searchParams.get("before"), id = url.searchParams.get("id");
    if ((at === null) !== (id === null) || (at && (!/^\d{4}-\d{2}-\d{2}T/.test(at) || at.length > 35 || !Number.isFinite(Date.parse(at)))) || (id && !/^[0-9a-f-]{36}$/i.test(id))) {
      return Response.json({ error: "Invalid history cursor" }, { status: 400 });
    }
    const { data, error } = await actor.db.rpc("gp_member_paper_history", { p_hash: actor.hash, p_before_at: at, p_before_id: id });
    if (error || !Array.isArray(data)) return Response.json({ error: "Paper history is unavailable. Nothing was estimated." }, { status: 503 });
    return Response.json({ fills: data }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Connect and sign in with your wallet to read your paper history." }, { status: 401 }); }
}
