import { loadMemberSnapshot } from "@/lib/member-platform/wallet-account";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await loadMemberSnapshot();
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load your member workspace.";
    return Response.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
