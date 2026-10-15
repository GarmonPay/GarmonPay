import { json } from "@/lib/solana/http";
import { readLaunchMetadata } from "@/lib/solana/artwork-store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: "Not found" }, 404);
  try {
    const metadata = await readLaunchMetadata(id);
    if (!metadata) return json({ error: "Not found" }, 404);
    return json({
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description ?? "",
      image: metadata.image,
      external_url: metadata.external_url,
    });
  } catch {
    return json({ error: "Metadata is unavailable" }, 503);
  }
}
