import { json } from "@/lib/solana/http";
import { fetchRaydiumDirectory, raydiumSort, targetFeeMismatch } from "@/lib/solana/raydium-directory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sort = raydiumSort(new URL(request.url).searchParams.get("sort"));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const tokens = await fetchRaydiumDirectory(sort, (input) => fetch(input, { cache: "no-store", signal: controller.signal }));
    return json({
      source: "raydium-launchlab",
      provenance: "external",
      tradingEnabled: false,
      recordsStatus: "external_directory",
      tokens,
      fees: targetFeeMismatch(tokens),
    });
  } catch {
    return json({ error: "Raydium directory unavailable" }, 503);
  } finally {
    clearTimeout(timeout);
  }
}
