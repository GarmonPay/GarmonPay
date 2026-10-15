import { buildPublicProfile, searchMembers } from "@/lib/member-platform/dashboard";
import { readLedger } from "@/lib/member-platform/repository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle");
  const state = readLedger();
  if (handle) {
    const profile = buildPublicProfile(state, handle.trim().toLowerCase(), request.headers.get("x-member-staging-id"));
    if (!profile) return Response.json({ error: "Member not found" }, { status: 404 });
    return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ members: searchMembers(state, url.searchParams.get("q") ?? "") }, { headers: { "Cache-Control": "no-store" } });
}
