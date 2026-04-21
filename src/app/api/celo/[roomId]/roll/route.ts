import { POST as roundRollPost } from "../../round/roll/route";

/** Roll dice — forwards to POST /api/celo/round/roll with room_id from the path. */
export async function POST(req: Request, context: { params: { roomId: string } }) {
  const roomId = context.params.roomId;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return roundRollPost(
      new Request(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify({ room_id: roomId }),
      })
    );
  }
  const next = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...body, room_id: roomId }),
  });
  return roundRollPost(next);
}
