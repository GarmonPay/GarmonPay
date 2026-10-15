import { Connection, PublicKey } from "@solana/web3.js";
import { isAdmin } from "@/lib/admin-auth";
import { json } from "@/lib/solana/http";
import { CLUSTER_GENESIS } from "@/lib/solana/platform-setup";
import { DEVNET_RPC } from "@/lib/solana/launchlab-flow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) return json({ error: "Admin session required", cluster: "devnet" }, 401);
  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return json({ error: "A public address is required", cluster: "devnet" }, 400);
  try {
    const wallet = new PublicKey(address);
    const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const genesis = await connection.getGenesisHash();
    if (genesis !== CLUSTER_GENESIS.devnet) return json({ error: "RPC is not Solana devnet", cluster: "devnet" }, 503);
    const lamports = await connection.getBalance(wallet, "confirmed");
    return json({ cluster: "devnet", address: wallet.toBase58(), lamports, confirmed: true });
  } catch {
    return json({ error: "Devnet balance is unavailable", cluster: "devnet" }, 503);
  }
}
