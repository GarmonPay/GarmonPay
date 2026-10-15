import { json, sameOrigin, smallJson } from "@/lib/solana/http";
const stages = new Set(["load", "tap", "plan", "resume", "connect", "challenge", "sign", "verify", "done", "error", "provider-missing", "wait", "callback-context-missing"]);
const plans = new Set(["injected", "browse", "deeplink", "install", "unavailable", ""]);
const surfaces = new Set(["desktop", "iphone", "android", ""]);
const apps = new Set(["phantom", "solflare", ""]);
export const runtime = "nodejs";
/** Privacy-safe stage trace. Never accepts keys, signatures, cookies, or addresses. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  try {
    const body = await smallJson(request);
    const stage = typeof body.stage === "string" && stages.has(body.stage) ? body.stage : "unknown";
    const plan = typeof body.plan === "string" && plans.has(body.plan) ? body.plan : "";
    const surface = typeof body.surface === "string" && surfaces.has(body.surface) ? body.surface : "";
    const app = typeof body.app === "string" && apps.has(body.app) ? body.app : "";
    console.info("[garmonpay-wallet]", stage, body.provider === true ? "provider" : "no-provider", plan, surface, app);
    return json({ ok: true });
  } catch { return json({ ok: false }, 400); }
}
