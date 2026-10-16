import { checkRateLimit } from "@/lib/rate-limit";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";
import { memberSessionHash } from "@/lib/solana/members";
import { normalizeDisplayName, normalizeHandle } from "@/lib/solana/profile-name";
import { assertCampaignDraft } from "./advertising";
import { buildSnapshot } from "./dashboard";
import { memberIdentityContract } from "./identity";
import { PAPER_ASSETS, PAPER_SYMBOLS, displayToMicroUnits, virtualAmount, virtualPrice, type PaperSymbol } from "./paper";
import { lookupUsdPrice } from "./prices";
import { parseSolToLamports } from "./economics";
import { emptyLedger, type CampaignDraft, type LedgerState, type Member, type PaperFill } from "./types";
import { assertUsernameChange } from "./username-cooldown";
import { assertSessionActor, PAPER_PERSISTENCE_MESSAGE, reviewedSchemaMissing } from "./wallet-guard";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

type SolMe = {
  id: string;
  username: string;
  displayName: string;
  biography: string;
  picture: string | null;
  walletPublic: boolean;
  wallet: string;
  referralSlug: string | null;
  referralCode: string;
  referrals: number;
};

type Workspace = {
  ready?: boolean;
  schemaVersion?: string;
  valuation?: { available: boolean; equityLamports?: string; unrealizedLamports?: string; realizedLamports?: string; reason?: string };
  history?: { available: boolean; at?: string; equityLamports?: string }[];
  cashLamports?: string;
  fillCount?: number;
  positions?: { symbol: string; microUnits: string }[];
  fills?: { id: string; virtualLamports: string; microUnits: string; priceMicrousd: string; solPriceMicrousd: string; symbol: string; side: "buy" | "sell"; at: string; priceSource: string; realizedLamports: string }[];
  drafts?: { id: string; title: string; url: string; tier: CampaignDraft["tier"]; views: number; paymentEnabled: false }[];
  activity?: { text: string; at: string }[];
};

const ACTIVITY_TEXT: Record<string, string> = {
  paper_fill: "Paper fill recorded. Virtual SOL only.",
  ad_draft: "Advertising draft saved. Payment is off.",
};

function stubMember(input: { id: string; handle: string; displayName: string; referredBy: string | null; createdAt: string; cash?: string; positions?: Member["positions"] }): Member {
  return {
    id: input.id,
    handle: input.handle,
    displayName: input.displayName,
    biography: "",
    inviteCode: input.id.replace(/-/g, "").slice(0, 8).padEnd(8, "a"),
    referredBy: input.referredBy,
    verified: false,
    profilePublic: true,
    createdAt: input.createdAt,
    paperCashLamports: input.cash ?? "0",
    positions: input.positions ?? {},
  };
}

export async function requireWalletMember() {
  const hash = await memberSessionHash();
  const db = createAdminClient();
  if (!hash || !db) throw new Error("Connect and sign in with your wallet. A saved browser ID is not a member account.");
  const client = db;
  const { data, error } = await client.rpc("gp_sol_member_me", { p_hash: hash });
  if (error || !data?.id) throw new Error("The signed wallet session was not recognized.");
  const member = data as SolMe;
  assertSessionActor({ sessionMemberId: member.id });
  return { hash: hash as string, db: client, member };
}

export function bindClaim(sessionMemberId: string, claimedMemberId?: string | null, stagingId?: string | null) {
  return assertSessionActor({ sessionMemberId, claimedMemberId, stagingId });
}

async function referralRows(db: Admin, memberId: string) {
  const { data, error } = await db.from("gp_sol_members").select("username, display_name, created_at").eq("referred_by", memberId).order("created_at", { ascending: true }).limit(100);
  if (error) throw new Error("Your referral records could not be loaded. Nothing was estimated.");
  return (data ?? []) as { username: string; display_name: string; created_at: string }[];
}

async function followerCounts(db: Admin, hash: string, username: string) {
  const { data, error } = await db.rpc("gp_sol_member_directory", { p_query: null, p_username: username, p_hash: hash });
  if (error) throw new Error("Member connections could not be loaded. Retry in a moment.");
  const row = Array.isArray(data) ? data[0] : null;
  return { followers: Number(row?.followers ?? 0), following: Number(row?.following ?? 0) };
}

function ledgerFor(member: SolMe, referrals: { username: string; display_name: string; created_at: string }[], workspace: Workspace | null, counts: { followers: number; following: number }): LedgerState {
  const cash = workspace?.cashLamports ?? "0";
  const positions: Member["positions"] = {};
  for (const position of workspace?.positions ?? []) positions[position.symbol] = { microUnits: position.microUnits, costLamports: "0" };
  const self = stubMember({
    id: member.id,
    handle: member.username,
    displayName: member.displayName || "Member",
    referredBy: null,
    createdAt: new Date(0).toISOString(),
    cash,
    positions,
  });
  self.biography = member.biography ?? "";
  self.inviteCode = member.referralSlug && /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/.test(member.referralSlug) ? member.referralSlug : member.referralCode;
  self.profilePublic = member.walletPublic !== false;
  const directs = referrals.map((item, index) => stubMember({
    id: `${member.id}-ref-${index}`,
    handle: item.username,
    displayName: item.display_name || item.username,
    referredBy: member.id,
    createdAt: item.created_at,
  }));
  const fills: PaperFill[] = (workspace?.fills ?? []).filter(fill => fill.id && fill.virtualLamports && fill.microUnits && fill.priceMicrousd && fill.solPriceMicrousd).map((fill) => ({
    id: fill.id,
    memberId: member.id,
    symbol: fill.symbol,
    side: fill.side,
    virtualLamports: fill.virtualLamports,
    microUnits: fill.microUnits,
    priceMicrousd: fill.priceMicrousd,
    solPriceMicrousd: fill.solPriceMicrousd,
    priceSource: fill.priceSource,
    realizedLamports: fill.realizedLamports,
    at: fill.at,
  }));
  const campaigns: CampaignDraft[] = (workspace?.drafts ?? []).map((draft) => ({
    id: draft.id,
    ownerId: member.id,
    title: draft.title,
    url: draft.url,
    tier: draft.tier,
    views: draft.views,
    status: "draft",
    paymentEnabled: false,
    createdAt: new Date(0).toISOString(),
  }));
  return {
    members: [self, ...directs],
    activity: (workspace?.activity ?? []).map((item, index) => ({
      id: `${member.id}-act-${index}`,
      memberId: member.id,
      at: item.at,
      text: ACTIVITY_TEXT[item.text] ?? "Member activity recorded.",
      public: false,
    })),
    follows: [
      ...Array.from({ length: counts.followers }, (_, index) => ({ followerId: `follower-${index}`, targetId: member.id, at: self.createdAt })),
      ...Array.from({ length: counts.following }, (_, index) => ({ followerId: member.id, targetId: `following-${index}`, at: self.createdAt })),
    ],
    campaigns,
    watches: [],
    paperFills: fills,
    commissions: [],
  };
}

export async function loadMemberSnapshot() {
  const hash = await memberSessionHash();
  const db = createAdminClient();
  if (!hash || !db) {
    const snapshot = buildSnapshot(emptyLedger(), null);
    return { ...snapshot, actorId: null as string | null, walletConnected: false, paper: null, identity: memberIdentityContract(false), referralTotal: null, paperValuation: null, paperHistory: [] as NonNullable<Workspace["history"]>, paperPersistence: "signed-out" as const };
  }
  const { data, error } = await db.rpc("gp_sol_member_me", { p_hash: hash });
  if (error) throw new Error("Your signed wallet could not be checked. Retry in a moment.");
  if (!data?.id) {
    const snapshot = buildSnapshot(emptyLedger(), null);
    return { ...snapshot, actorId: null as string | null, walletConnected: false, paper: null, identity: memberIdentityContract(false), referralTotal: null, paperValuation: null, paperHistory: [] as NonNullable<Workspace["history"]>, paperPersistence: "signed-out" as const };
  }
  const member = data as SolMe;
  const [referrals, counts, workspaceResult] = await Promise.all([
    referralRows(db, member.id),
    followerCounts(db, hash, member.username),
    db.rpc("gp_member_workspace", { p_hash: hash }),
  ]);
  const persistenceReady = !workspaceResult.error && workspaceResult.data?.ready === true && workspaceResult.data?.schemaVersion === "paper-v1-equity";
  if (workspaceResult.error && !reviewedSchemaMissing(workspaceResult.error)) {
    throw new Error("Member workspace could not be loaded.");
  }
  const workspace = persistenceReady ? workspaceResult.data as Workspace : null;
  const snapshot = buildSnapshot(ledgerFor(member, referrals, workspace, counts), member.id);
  return {
    ...snapshot,
    actorId: member.id,
    walletConnected: true,
    identity: memberIdentityContract(true),
    paper: persistenceReady ? { ...snapshot.paper!, fillCount: workspace?.fillCount ?? null } : null,
    referralTotal: member.referrals,
    paperValuation: workspace?.valuation ?? null,
    paperHistory: (workspace?.history ?? []).filter(point => point?.available && point.equityLamports && point.at),
    paperPersistence: persistenceReady ? "ready" as const : "awaiting-review" as const,
  };
}

export async function saveWalletProfile(input: { memberId?: string | null; displayName: string; biography: string; walletPublic: boolean; handle?: string }) {
  const actor = await requireWalletMember();
  bindClaim(actor.member.id, input.memberId);
  const displayName = normalizeDisplayName(input.displayName);
  const handle = input.handle?.trim() ? normalizeHandle(input.handle) : null;
  if (typeof input.biography !== "string" || input.biography.length > 280 || typeof input.walletPublic !== "boolean") {
    throw new Error("Biography must be 280 characters or fewer.");
  }
  // A column alone cannot prove that the database enforces the cooldown.
  const policy = handle && handle !== actor.member.username
    ? await actor.db.rpc("gp_sol_username_policy") : null;
  if (policy && (policy.error || policy.data !== "seven-day-atomic-v1")) {
    throw new Error("Public username changes stay locked until the reviewed seven-day database policy is installed. Your current username was not changed.");
  }
  const current = await actor.db.from("gp_sol_members").select("username, wallet_address, username_changed_at").eq("id", actor.member.id).maybeSingle();
  if (handle && handle !== actor.member.username) {
    if (current.error || !current.data) throw new Error("The username history could not be confirmed. Nothing was changed.");
    assertUsernameChange({ currentHandle: current.data.username, nextHandle: handle,
      walletAddress: actor.member.wallet, recordedWalletAddress: current.data.wallet_address,
      lastChangedAt: current.data.username_changed_at, nowMs: Date.now() });
  }
  const { error } = await actor.db.rpc("gp_sol_member_save", {
    p_hash: actor.hash,
    p_username: handle,
    p_bio: input.biography,
    p_picture: actor.member.picture ?? null,
    p_public: input.walletPublic,
    p_display: displayName,
  });
  if (error) throw new Error("Unable to save that profile. The public handle may already be taken.");

}

export async function followWalletHandle(input: { memberId?: string | null; handle: string; follow: boolean }) {
  const actor = await requireWalletMember();
  bindClaim(actor.member.id, input.memberId);
  const username = normalizeHandle(input.handle);
  const { data, error } = await actor.db.rpc("gp_sol_member_directory", { p_query: null, p_username: username, p_hash: actor.hash });
  const target = Array.isArray(data) ? data[0] : null;
  if (error || !target?.id) throw new Error("That member was not found.");
  const saved = await actor.db.rpc("gp_sol_member_follow", { p_hash: actor.hash, p_target: target.id, p_follow: input.follow });
  if (saved.error) throw new Error(saved.error.message?.includes("Invalid member") ? "You cannot follow yourself." : "That follow could not be saved.");
}

export async function saveWalletDraft(input: { memberId?: string | null; title: string; url: string; tier: string; views: number }) {
  const actor = await requireWalletMember();
  bindClaim(actor.member.id, input.memberId);
  const draft = assertCampaignDraft(input);
  const { data, error } = await actor.db.rpc("gp_member_save_ad_draft", {
    p_hash: actor.hash,
    p_title: draft.title,
    p_url: draft.url,
    p_tier: draft.tier,
    p_views: draft.views,
  });
  if (reviewedSchemaMissing(error)) throw new Error(PAPER_PERSISTENCE_MESSAGE);
  if (error || !data) throw new Error("That advertising draft could not be saved. Nothing was charged.");
  return { id: String(data), paymentEnabled: false as const };
}

export async function recordWalletPaperFill(input: { memberId?: string | null; symbol: string; side: "buy" | "sell"; amount: string; requestId: string }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error("A valid paper request ID is required.");
  const symbol = input.symbol.toUpperCase();
  if (input.side !== "buy" && input.side !== "sell") throw new Error("Invalid paper side.");
  if (!PAPER_SYMBOLS.includes(symbol as PaperSymbol)) throw new Error("Choose a supported paper asset. Other assets have no verified price here.");
  const actor = await requireWalletMember();
  bindClaim(actor.member.id, input.memberId);
  const spend = input.side === "buy" ? parseSolToLamports(input.amount) : null;
  const sell = input.side === "sell" ? displayToMicroUnits(input.amount) : null;
  if (input.side === "buy" && !spend) throw new Error("Enter a virtual SOL amount.");
  if (input.side === "sell" && !sell) throw new Error("Enter a paper token amount.");
  const previous = await actor.db.rpc("gp_member_paper_request", {
    p_hash: actor.hash, p_request_id: input.requestId, p_symbol: symbol, p_side: input.side,
    p_spend_lamports: spend ? virtualAmount(spend) : null,
    p_sell_micro_units: sell ? virtualAmount(sell) : null,
  });
  if (reviewedSchemaMissing(previous.error)) throw new Error(PAPER_PERSISTENCE_MESSAGE);
  if (previous.error) throw new Error(safeDbMessage(previous.error, "The paper request could not be checked. Nothing new was recorded."));
  if (previous.data?.virtual) return { cashLamports: String(previous.data.cashLamports), priceSource: "stored observation", virtual: true as const };
  if (!checkRateLimit(actor.member.id, "member-paper-order", 20).allowed) throw new Error("Too many paper orders. Wait one minute before trying again.");
  const [sol, token] = await Promise.all([lookupUsdPrice("SOL"), lookupUsdPrice(symbol)]);
  if (!sol || !token) throw new Error("A live price is unavailable. No paper fill was recorded.");
  // Separate server-only credential with the gp_member_price_publisher role.
  // Never fall back to the general service role or accept browser quote fields.
  const publisherToken = process.env.MEMBER_PRICE_PUBLISHER_JWT;
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!publisherToken || !apiKey || !url) throw new Error("Verified paper pricing is not configured. Nothing was recorded.");
  const publisher = createClient(url, apiKey, {
    global: { headers: { Authorization: `Bearer ${publisherToken}`, Prefer: "return=minimal" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const observationId = randomUUID();
  // The server already knows observationId. Do not chain .select() or ask PostgREST
  // to return the row: the publisher credential is INSERT-only.
  const published = await publisher.from("gp_member_price_observations").insert({
    id: observationId, symbol, asset_id: PAPER_ASSETS[symbol as PaperSymbol], source: "coingecko",
    token_microusd: virtualPrice(BigInt(token.microusd)), sol_microusd: virtualPrice(BigInt(sol.microusd)),
    observed_at: new Date(token.observedAt).toISOString(), sol_observed_at: new Date(sol.observedAt).toISOString(),
  });
  if (published.error) throw new Error("Verified price observation was rejected. Nothing was recorded.");
  const { data, error } = await actor.db.rpc("gp_member_record_paper_fill", {
    p_hash: actor.hash,
    p_symbol: symbol,
    p_side: input.side,
    p_spend_lamports: spend ? virtualAmount(spend) : null,
    p_sell_micro_units: sell ? virtualAmount(sell) : null,
    p_request_id: input.requestId,
    p_observation_id: observationId,
  });
  if (reviewedSchemaMissing(error)) throw new Error(PAPER_PERSISTENCE_MESSAGE);
  if (error || !data?.virtual) throw new Error(safeDbMessage(error, "That paper order was rejected. Nothing was recorded."));
  return { cashLamports: String(data.cashLamports), priceSource: token.source, virtual: true as const };
}

export async function loadPaperRankings(period: "daily" | "weekly" | "monthly", archiveStart?: string) {
  const db = createAdminClient();
  if (!db) return { rows: [], persistence: "unavailable" as const };
  const { data: response, error } = archiveStart
    ? await db.rpc("gp_member_rank_archive", { p_period: period, p_start: archiveStart })
    : await db.rpc("gp_member_paper_rankings", { p_period: period });
  const data = archiveStart ? response?.rows : response;
  if (reviewedSchemaMissing(error)) return { rows: [], persistence: "awaiting-review" as const };
  if (error || !Array.isArray(data)) return { rows: [], persistence: "unavailable" as const };
  if (data.some(row => row.formula !== "net-liquidation-sol-v1" || !row.memberId || !Number.isFinite(Number(row.returnBps)))) {
    return { rows: [], persistence: "awaiting-review" as const };
  }
  return {
    rows: data.map((row: { handle: string; displayName: string; realizedLamports: string; fills: number; memberId: string; unrealizedLamports: string; equityLamports: string; returnBps: string }, index: number) => ({
      rank: index + 1,
      memberId: row.memberId,
      unrealizedLamports: row.unrealizedLamports,
      equityLamports: row.equityLamports,
      returnBps: row.returnBps,
      handle: row.handle,
      displayName: row.displayName,
      realizedLamports: row.realizedLamports,
      fills: row.fills,
    })),
    persistence: "ready" as const,
  };
}

export async function lookupWalletInvite(token: string) {
  const db = createAdminClient();
  if (!db) return null;
  const { data, error } = await db.from("gp_sol_members").select("username, display_name").eq("referral_slug", token).maybeSingle();
  if (error || !data?.username) return null;
  return { handle: data.username as string, displayName: (data.display_name as string) || (data.username as string) };
}

export async function lookupWalletDirectory(input: { handle?: string | null; query?: string | null }) {
  const db = createAdminClient();
  if (!db) return { error: "Directory unavailable" as const };
  const hash = await memberSessionHash();
  const handle = input.handle?.trim().toLowerCase() || null;
  const query = input.query?.trim().slice(0, 32) || null;
  if (query && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query)) return { members: [] as PublicMember[] };
  const { data, error } = await db.rpc("gp_sol_member_directory", { p_query: handle ? null : query, p_username: handle, p_hash: hash });
  if (error) return { error: "Directory unavailable" as const };
  const rows = (Array.isArray(data) ? data : []) as DirectoryRow[];
  return { members: rows.map(toPublicMember) };
}

type DirectoryRow = { id?: string; username?: string; displayName?: string; biography?: string; followers?: number; following?: number; isFollowing?: boolean; wallet?: string | null };
type PublicMember = { handle: string; displayName: string; biography: string; followers: number; following: number; isFollowing: boolean; profilePublic: true; privateNote: null; activity: [] };

function safeDbMessage(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (!message || message.length > 180 || /wallet_address|token_hash|gp_sol_|staging/i.test(message)) return fallback;
  return message.replace(/^.*ERROR:\s*/i, "");
}

function toPublicMember(row: DirectoryRow): PublicMember {
  return {
    handle: row.username ?? "",
    displayName: row.displayName || row.username || "Member",
    biography: row.biography ?? "",
    followers: Number(row.followers ?? 0),
    following: Number(row.following ?? 0),
    isFollowing: row.isFollowing === true,
    profilePublic: true,
    privateNote: null,
    activity: [],
  };
}
