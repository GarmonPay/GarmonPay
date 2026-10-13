const STAGES = new Set([
  "page-load", "hint-read", "provider-check", "resume-decision", "provider-timeout",
  "connect-start", "connect-ok", "connect-fail", "sign-start", "sign-ok", "sign-fail",
  "challenge-ok", "challenge-fail", "verify-ok", "verify-fail", "session-ok", "session-fail",
  "profile-ok", "profile-fail",
]);
const FAMILIES = new Set(["ios", "android", "desktop", "other"]);
const FORBIDDEN = /wallet|address|signature|token|email|seed|cookie|secret|key/i;

export type AuthEventRecord = {
  stage: string;
  ok: boolean;
  code: string;
  uaFamily: "ios" | "android" | "desktop" | "other";
  insideWallet: boolean;
  hasHint: boolean;
  providerFound: boolean;
  elapsedMs: number;
};

export function uaFamily(userAgent: string): AuthEventRecord["uaFamily"] {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent)) return "desktop";
  return "other";
}

/** Keep only the public stage record. Extra fields, including addresses and signatures, are dropped. */
export function sanitizeAuthEvent(input: unknown): AuthEventRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (typeof body.stage !== "string" || !STAGES.has(body.stage)) return null;
  const code = typeof body.code === "string" && body.code.length <= 40 && !FORBIDDEN.test(body.code) ? body.code : "";
  const family = typeof body.uaFamily === "string" && FAMILIES.has(body.uaFamily) ? body.uaFamily as AuthEventRecord["uaFamily"] : "other";
  const elapsed = typeof body.elapsedMs === "number" && Number.isFinite(body.elapsedMs) ? Math.max(0, Math.min(120000, Math.round(body.elapsedMs))) : 0;
  return {
    stage: body.stage,
    ok: body.ok === true,
    code,
    uaFamily: family,
    insideWallet: body.insideWallet === true,
    hasHint: body.hasHint === true,
    providerFound: body.providerFound === true,
    elapsedMs: elapsed,
  };
}

export function reportAuthEvent(input: AuthEventRecord) {
  try {
    const event = sanitizeAuthEvent(input);
    if (!event || typeof window === "undefined") return;
    const body = JSON.stringify(event);
    const beacon = window.navigator?.sendBeacon;
    if (typeof beacon === "function" && beacon.call(window.navigator, "/api/solana/auth/event", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/solana/auth/event", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* diagnostics must not block sign-in */ }
}
