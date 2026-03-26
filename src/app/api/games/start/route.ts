import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { startEscapeSession } from "@/lib/escape-room-db";

function getHeader(req: Request, key: string): string | null {
  const value = req.headers.get(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.slice(0, 255) : null;
}

/** POST /api/games/start
 * Start Stake & Escape session with server-authoritative timer.
 * Body: { mode: "free" | "stake", stake_cents?: number, device_fingerprint?: string }
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { mode?: "free" | "stake"; stake_cents?: number; device_fingerprint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode;
  if (mode !== "free" && mode !== "stake") {
    return NextResponse.json({ error: "mode must be 'free' or 'stake'" }, { status: 400 });
  }

  try {
    const started = await startEscapeSession({
      userId,
      mode,
      stakeCents: mode === "stake" ? body.stake_cents ?? 0 : 0,
      ipAddress: getHeader(req, "x-forwarded-for"),
      deviceFingerprint: body.device_fingerprint ?? getHeader(req, "x-device-fingerprint"),
      userAgent: getHeader(req, "user-agent"),
    });

    return NextResponse.json({
      ok: true,
      session: {
        id: started.session.id,
        mode: started.session.mode,
        stake_cents: started.session.stake_cents,
        started_at: started.session.started_at,
        countdown_seconds: started.session.countdown_seconds,
        prize_pool_window: started.session.prize_pool_window,
      },
      puzzle: started.puzzle,
      wallet_balance_cents: started.walletBalanceCents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start session";
    const status = /Unauthorized|banned|KYC|required|disabled|Insufficient|Stake/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
