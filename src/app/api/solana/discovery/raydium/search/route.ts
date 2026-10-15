import { json } from "@/lib/solana/http";
import { fetchRaydiumSearch, raydiumQuery, targetFeeMismatch } from "@/lib/solana/raydium-directory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const text = raydiumQuery(new URL(request.url).searchParams.get("text"));
  if (!text) return json({ error: "Enter at least 2 letters or numbers." }, 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const tokens = await fetchRaydiumSearch(text, (input) => fetch(input, { cache: "no-store", signal: controller.signal }));
    return json({ source: "raydium-launchlab", provenance: "external", tradingEnabled: false, recordsStatus: "external_search", tokens, fees: targetFeeMismatch(tokens) });
  } catch {
    return json({ error: "Raydium search unavailable" }, 503);
  } finally {
    clearTimeout(timeout);
  }
}
