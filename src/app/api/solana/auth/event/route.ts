import { rateLimitOr429 } from "@/lib/rate-limit";
import { sanitizeAuthEvent } from "@/lib/solana/auth-event";
import { json, sameOrigin, smallJson } from "@/lib/solana/http";
import { walletAuthEnabled } from "@/lib/solana/policy";

export const runtime = "nodejs";
const EVENT_LIMIT = 60;

/** Privacy-safe client stage log. Addresses, signatures, tokens, and emails are not accepted. */
export async function POST(request: Request) {
  if (!walletAuthEnabled()) return json({ error: "Wallet sign-in unavailable" }, 503);
  const limited = rateLimitOr429(request, "solana-auth-event", EVENT_LIMIT);
  if (limited) return limited;
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  try {
    const event = sanitizeAuthEvent(await smallJson(request));
    if (!event) return json({ ok: false }, 400);
    console.info("[garmonpay-auth-client]", event.stage, event.ok ? "ok" : "fail", event.code, event.uaFamily, event.insideWallet ? "inside" : "outside", event.hasHint ? "hint" : "no-hint", event.providerFound ? "provider" : "no-provider", event.elapsedMs);
    return json({ ok: true });
  } catch { return json({ ok: false }, 400); }
}
