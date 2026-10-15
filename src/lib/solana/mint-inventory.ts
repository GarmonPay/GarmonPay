import { Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase";
import { decryptMintSecret, inventorySealKey } from "./hosted-mint";

export { decryptMintSecret, encryptMintSecret } from "./hosted-mint";

const RESERVE_MS = 20 * 60 * 1000;
type Row = {
  id: string;
  mint: string;
  secret_ciphertext?: string;
  status: string;
  draft_hash?: string | null;
  consumed_signature?: string | null;
  reserved_wallet?: string | null;
};

function clearReservation() {
  return { status: "available", reserved_wallet: null, draft_hash: null, image_url: null, name: null, symbol: null, reserved_at: null, reservation_expires_at: null };
}

export async function claimInventoryMint(input: { wallet: string; draftHash: string; imageUrl: string; name: string; symbol: string }) {
  const db = createAdminClient();
  if (!db) throw new Error("Mint inventory is unavailable. Your coin details are saved. Retry shortly.");
  const now = new Date();
  await db.from("gp_sol_mint_inventory").update(clearReservation()).eq("status", "reserved").lt("reservation_expires_at", now.toISOString()).is("consumed_signature", null);
  const { data: held, error: heldError } = await db.from("gp_sol_mint_inventory").select("id,mint,secret_ciphertext,status,draft_hash,consumed_signature").eq("reserved_wallet", input.wallet).in("status", ["reserved", "submitting", "uncertain"]).order("reserved_at", { ascending: false }).limit(1).maybeSingle();
  if (heldError) throw new Error("Mint inventory could not be reserved. Retry shortly.");
  const existing = held as Row | null;
  if (existing && (existing.status === "submitting" || existing.status === "uncertain")) {
    return { pending: true as const, id: existing.id, mint: existing.mint, status: existing.status };
  }
  if (existing?.status === "reserved" && existing.draft_hash === input.draftHash && existing.secret_ciphertext) {
    return { pending: false as const, id: existing.id, mint: existing.mint, secret: decryptMintSecret(existing.secret_ciphertext, inventorySealKey()), status: "ready" as const };
  }
  if (existing?.status === "reserved") {
    await db.from("gp_sol_mint_inventory").update(clearReservation()).eq("id", existing.id).eq("status", "reserved").is("consumed_signature", null);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: next } = await db.from("gp_sol_mint_inventory").select("id,mint,secret_ciphertext").eq("status", "available").order("created_at", { ascending: true }).limit(1).maybeSingle();
    const row = next as Row | null;
    if (!row?.secret_ciphertext) return { empty: true as const };
    const expires = new Date(Date.now() + RESERVE_MS).toISOString();
    const { data: won } = await db.from("gp_sol_mint_inventory").update({
      status: "reserved", reserved_wallet: input.wallet, draft_hash: input.draftHash, image_url: input.imageUrl.slice(0, 400),
      name: input.name, symbol: input.symbol, reserved_at: now.toISOString(), reservation_expires_at: expires,
    }).eq("id", row.id).eq("status", "available").select("id,mint,secret_ciphertext").maybeSingle();
    const claimed = won as Row | null;
    if (!claimed?.secret_ciphertext) continue;
    return { pending: false as const, id: claimed.id, mint: claimed.mint, secret: decryptMintSecret(claimed.secret_ciphertext, inventorySealKey()), status: "ready" as const };
  }
  return { empty: true as const };
}

export async function devnetMintLanded(mint: string, signature?: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return false;
  try {
    const connection = new Connection("https://api.devnet.solana.com", { commitment: "confirmed", disableRetryOnRateLimit: true });
    if (await connection.getAccountInfo(new PublicKey(mint), "confirmed")) return true;
    if (!signature) return false;
    const status = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const value = status.value[0];
    return Boolean(value && !value.err);
  } catch {
    return true;
  }
}

export async function releaseUnconfirmedMint(id: string, wallet: string) {
  const db = createAdminClient();
  if (!db) return;
  await db.from("gp_sol_mint_inventory").update({ ...clearReservation(), consumed_signature: null, last_valid_block_height: null }).eq("id", id).eq("reserved_wallet", wallet).in("status", ["reserved", "submitting", "uncertain"]);
}

export async function releaseInventoryMint(id: string, wallet: string) {
  const db = createAdminClient();
  if (!db) return { released: false, status: "unavailable" };
  const { data } = await db.from("gp_sol_mint_inventory").update(clearReservation()).eq("id", id).eq("reserved_wallet", wallet).eq("status", "reserved").is("consumed_signature", null).select("id").maybeSingle();
  if (data) return { released: true, status: "available" };
  const { data: row } = await db.from("gp_sol_mint_inventory").select("status").eq("id", id).eq("reserved_wallet", wallet).maybeSingle();
  return { released: false, status: (row as { status?: string } | null)?.status || "idle" };
}

export async function markInventorySubmission(id: string, wallet: string, state: "submitting" | "uncertain" | "consumed" | "reserved", signature?: string, height?: number) {
  const db = createAdminClient();
  if (!db) return;
  const patch: Record<string, unknown> = { status: state };
  if (signature) patch.consumed_signature = signature;
  if (height) patch.last_valid_block_height = height;
  if (state === "reserved") {
    patch.consumed_signature = null;
    patch.last_valid_block_height = null;
  }
  await db.from("gp_sol_mint_inventory").update(patch).eq("id", id).eq("reserved_wallet", wallet).in("status", ["reserved", "submitting", "uncertain"]);
}

export async function recordLaunchMint(input: { id: string; mint: string; wallet: string; draftHash: string; imageUrl: string; name: string; symbol: string }) {
  const db = createAdminClient();
  if (!db) throw new Error("The launch record could not be saved. Nothing was submitted.");
  await db.from("gp_sol_mint_inventory").update({ status: "cancelled", secret_ciphertext: "retired", reserved_wallet: null, draft_hash: null, image_url: null, name: null, symbol: null, reserved_at: null, reservation_expires_at: null }).eq("reserved_wallet", input.wallet).eq("status", "reserved").is("consumed_signature", null).neq("id", input.id);
  const { data: existing } = await db.from("gp_sol_mint_inventory").select("id").eq("id", input.id).maybeSingle();
  if (existing) return;
  const { error } = await db.from("gp_sol_mint_inventory").insert({
    id: input.id,
    mint: input.mint,
    secret_ciphertext: "retired",
    status: "reserved",
    reserved_wallet: input.wallet,
    draft_hash: input.draftHash,
    image_url: input.imageUrl.slice(0, 400) || null,
    name: input.name,
    symbol: input.symbol,
    reserved_at: new Date().toISOString(),
    reservation_expires_at: new Date(Date.now() + RESERVE_MS).toISOString(),
  });
  if (error) throw new Error("The launch record could not be saved. Nothing was submitted.");
}

export async function listConsumedMints(limit = 12, wallet?: string) {
  const db = createAdminClient();
  if (!db) return [];
  let query = db.from("gp_sol_mint_inventory").select("mint,name,symbol,image_url,reserved_wallet,consumed_signature,created_at").eq("status", "consumed").order("created_at", { ascending: false }).limit(limit);
  if (wallet) query = query.eq("reserved_wallet", wallet);
  const { data } = await query;
  return (data || []) as { mint: string; name: string | null; symbol: string | null; image_url: string | null; reserved_wallet: string | null; consumed_signature: string | null; created_at: string }[];
}

export async function countAvailableMints() {
  const db = createAdminClient();
  if (!db) return 0;
  const { count } = await db.from("gp_sol_mint_inventory").select("id", { count: "exact", head: true }).eq("status", "available");
  return count || 0;
}
