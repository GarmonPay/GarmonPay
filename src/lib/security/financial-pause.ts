import {walletAuthEnabled} from "@/lib/solana/policy";
/** Audit pause: activation requires an explicitly authorized code release. */
export const FINANCIAL_OPERATIONS_PAUSED = true;

const reviewedMutations: Readonly<Record<string, readonly string[]>> = {
  "/api/auth/login": ["POST"],
  "/api/auth/logout": ["POST"],
  "/api/auth/admin/login": ["POST"],
  "/api/auth/admin/logout": ["POST"],
  "/api/profile": ["PATCH"],
  "/api/notifications": ["PATCH"],
  "/api/waitlist": ["POST"],
  "/api/solana/launches/validate": ["POST"],
  "/api/solana/launches/suggest": ["POST"],
  "/api/solana/launches/artwork": ["POST", "DELETE"],
  "/api/solana/launches/draft": ["POST"],
  "/api/solana/launches/vanity": ["POST"],
  "/api/solana/launches/platform": ["POST"],
  "/api/solana/launches/platform/submit": ["POST"],
  "/api/solana/launches/devnet": ["POST"],
  "/api/solana/devnet/trade": ["POST"],
  "/api/solana/auth/logout": ["POST"],
};

// Legacy read handlers reset financial budgets or seed reward pricing configuration.
// Pause every method until those handlers have a verified read-only implementation.
const financialReadsWithSideEffects = new Set([
  "/api/games/budget",
  "/api/admin/gamification",
  "/api/admin/gamification-config",
]);

/** Default-deny mutations includes future endpoints, webhooks, workers and admin credits. */
export function isOperationPaused(rawPath: string, method: string): boolean {
  if (!FINANCIAL_OPERATIONS_PAUSED) return false;
  // Decode and normalize before policy matching; malformed/ambiguous paths fail closed.
  let path: string;
  try { path = decodeURIComponent(rawPath).replace(/\/+$/, "") || "/"; }
  catch { return true; }
  if (path.includes("\\") || path.includes("//") || /[\u0000-\u001f]/.test(path)) return true;
  if (!path.startsWith("/api/")) return false;
  if (financialReadsWithSideEffects.has(path)) return true;
  const family = (prefix: string) => path === prefix || path.startsWith(prefix + "/");
  if (family("/api/cron") || family("/api/stripe") || family("/api/stripe-connect") || family("/api/webhooks") ||
      family("/api/wallet/deposit") || family("/api/wallet/fund")) return true;
  const walletWrites: Readonly<Record<string,string>>={"/api/solana/auth/challenge":"POST","/api/solana/auth/verify":"POST","/api/solana/members/me":"PATCH","/api/solana/members/follow":"POST"};
  if(walletWrites[path]===method.toUpperCase())return !walletAuthEnabled();
  if(family("/api/solana/auth/challenge")||family("/api/solana/auth/verify"))return true;
  const verb = method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(verb)) return false;
  if (path === "/api/solana/auth/event" && verb === "POST") return !walletAuthEnabled();
  return !reviewedMutations[path]?.includes(verb);
}

export function financialPauseResponse(): Response {
  return Response.json({ code: "FINANCIAL_OPERATIONS_PAUSED", message: "Financial operations are paused for security review." },
    { status: 503, headers: { "Cache-Control": "no-store" } });
}
