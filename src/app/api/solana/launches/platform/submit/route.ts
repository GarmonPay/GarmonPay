import { isAdmin } from "@/lib/admin-auth";
import { json, smallJson, trustedBrowserOrigin } from "@/lib/solana/http";
import { rateLimitOr429 } from "@/lib/rate-limit";
import { submitSignedPlatformTransaction } from "@/lib/solana/platform-submit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdmin(request))) return json({ error: "Admin session required", submitted: false, platformExists: false }, 401);
  const limited = rateLimitOr429(request, "solana-platform-submit", 4);
  if (limited) return limited;
  if (!trustedBrowserOrigin(request)) return json({ error: "Origin rejected", submitted: false, platformExists: false }, 403);
  try {
    const body = await smallJson(request);
    const transaction = typeof body.transaction === "string" ? body.transaction : "";
    const height = body.lastValidBlockHeight;
    if (typeof height !== "number" || !Number.isSafeInteger(height) || height < 0) return json({ error: "Devnet blockhash expiry is missing. Nothing was submitted.", submitted: false, platformExists: false }, 400);
    const result = await submitSignedPlatformTransaction(transaction, height);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Platform transaction was not confirmed";
    return json({ error: message.replace(/[1-9A-HJ-NP-Za-km-z]{80,}/g, "[redacted]").slice(0, 180), submitted: false, platformExists: false }, 400);
  }
}
