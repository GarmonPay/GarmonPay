import { POST as roundStartPost } from "../../round/start/route";

/** Banker starts a round — forwards to POST /api/celo/round/start with room_id from the path. */
export async function POST(req: Request, context: { params: { roomId: string } }) {
  const roomId = context.params.roomId;
  let extra: Record<string, unknown> = {};
  try {
    extra = (await req.json()) as Record<string, unknown>;
  } catch {
    /* body optional */
  }
  const next = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...extra, room_id: roomId }),
  });
  return roundStartPost(next);
}
