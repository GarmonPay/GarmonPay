import { Connection, PublicKey } from "@solana/web3.js";
import { getPdaMetadataKey } from "@raydium-io/raydium-sdk-v2";
import { createAdminClient } from "@/lib/supabase";
import { DEVNET_RPC } from "./launchlab-flow";

export async function readDevnetCoin(mint: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return null;
  const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const account = await connection.getAccountInfo(new PublicKey(mint), "confirmed");
  if (!account) return null;
  const metadata = await connection.getAccountInfo(getPdaMetadataKey(new PublicKey(mint)).publicKey, "confirmed");
  const text = metadata ? Buffer.from(metadata.data).toString("utf8") : "";
  const db = createAdminClient();
  const { data } = db ? await db.from("gp_sol_mint_inventory").select("name,symbol,image_url,reserved_wallet,consumed_signature").eq("mint", mint).eq("status", "consumed").maybeSingle() : { data: null };
  const row = data as { name?: string | null; symbol?: string | null; image_url?: string | null; reserved_wallet?: string | null; consumed_signature?: string | null } | null;
  let creatorName: string | null = null;
  if (db && row?.reserved_wallet) {
    const member = await db.from("gp_sol_members").select("display_name,wallet_public").eq("wallet_address", row.reserved_wallet).maybeSingle();
    const profile = member.data as { display_name?: string | null; wallet_public?: boolean | null } | null;
    if (!member.error && profile?.wallet_public === true && profile.display_name?.trim()) creatorName = profile.display_name.trim();
  }
  const launchedAt = await devnetLaunchTime(connection, row?.consumed_signature);
  return {
    name: row?.name || "Devnet coin",
    symbol: row?.symbol || "",
    imageUrl: row?.image_url?.startsWith("https://") ? row.image_url : null,
    wallet: row?.reserved_wallet || null,
    creatorName,
    signature: row?.consumed_signature || null,
    launchedAt,
    metadataStored: Boolean(row?.name && text.includes(row.name)),
    cluster: "devnet" as const,
  };
}

export async function devnetLaunchTime(connection: Connection, signature?: string | null) {
  if (!signature) return null;
  try {
    const recorded = await connection.getTransaction(signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
    return recorded?.blockTime ? new Date(recorded.blockTime * 1000).toISOString() : null;
  } catch {
    return null;
  }
}
