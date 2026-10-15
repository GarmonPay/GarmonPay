import { json, smallJson } from "@/lib/solana/http";
import { validateTokenMetadata } from "@/lib/solana/token-metadata";
import { SOLANA_POLICY } from "@/lib/solana/policy";
import { assessLaunchSubmission } from "@/lib/solana/launch-readiness";
export async function POST(request: Request) {
  try { const metadata = validateTokenMetadata(await smallJson(request)); return json({ metadata, launchFeeLamports: SOLANA_POLICY.launchFeeLamports, launchEnabled: false, infrastructureCosts: null, totalLamports: null, readiness: assessLaunchSubmission() }); }
  catch (e) { return json({ error: e instanceof Error ? e.message : "Invalid metadata" }, 400); }
}
