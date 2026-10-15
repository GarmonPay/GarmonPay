import { buildSnapshot } from "@/lib/member-platform/dashboard";
import { readLedger } from "@/lib/member-platform/repository";

export async function GET(request: Request) {
  const id = request.headers.get("x-member-staging-id");
  const snapshot = buildSnapshot(readLedger(), id);
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
