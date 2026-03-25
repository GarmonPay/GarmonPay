import { createAdminClient } from "@/core/supabase";

type CompletionResult =
  | { success: true; reason: "ok" }
  | {
      success: false;
      reason:
        | "invalid_token"
        | "mismatch"
        | "too_fast"
        | "duplicate_fingerprint"
        | "velocity_exceeded"
        | "supabase_unavailable"
        | "wallet_credit_failed"
        | "transaction_log_failed";
    };

type TxType = "ad_view" | "referral_join" | "referral_upgrade";

type TxPayload = {
  user_id: string;
  type: TxType;
  amount_cents: number;
  status?: string;
  ad_id?: string | null;
  fingerprint?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown>;
};

type StartToken = {
  adId: string;
  userId: string;
  startedAt: number;
};

function toBase64Url(input: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(input, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(input, "base64url").toString("utf8");
  }
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeToken(payload: StartToken): string {
  return toBase64Url(JSON.stringify(payload));
}

function decodeToken(token: string): StartToken | null {
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as StartToken;
    if (!parsed?.adId || !parsed?.userId || !parsed?.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof window === "undefined") {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(input).digest("hex");
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getBrowserFingerprint(): Promise<string> {
  const payload =
    typeof window === "undefined"
      ? {
          userAgent: "server",
          language: "en",
          screen: "0x0",
          colorDepth: 0,
          timezoneOffset: 0,
          hardwareConcurrency: 0,
          deviceMemory: 0,
          platform: "server",
        }
      : {
          userAgent: navigator.userAgent ?? "",
          language: navigator.language ?? "",
          screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
          colorDepth: window.screen?.colorDepth ?? 0,
          timezoneOffset: new Date().getTimezoneOffset(),
          hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
          deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0,
          platform: navigator.platform ?? "",
        };

  const hash = await sha256Hex(JSON.stringify(payload));
  return hash.slice(0, 32);
}

export function startAdView(adId: string, userId: string): string {
  return encodeToken({
    adId,
    userId,
    startedAt: Date.now(),
  });
}

export async function logTransaction(payload: TxPayload): Promise<boolean> {
  const supabase = createAdminClient();
  if (!supabase) return false;

  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;

  const { error } = await supabase.from("transactions").insert({
    id,
    user_id: payload.user_id,
    type: payload.type,
    amount_cents: payload.amount_cents,
    status: payload.status ?? "pending",
    ad_id: payload.ad_id ?? null,
    fingerprint: payload.fingerprint ?? null,
    ip_address: payload.ip_address ?? null,
    metadata: payload.metadata ?? {},
    created_at: new Date().toISOString(),
  });

  return !error;
}

export async function completeAdView(
  token: string,
  adId: string,
  userId: string,
  rewardCents = 5,
  minWatchSeconds = 15,
): Promise<CompletionResult> {
  const supabase = createAdminClient();
  if (!supabase) return { success: false, reason: "supabase_unavailable" };

  const parsed = decodeToken(token);
  if (!parsed) return { success: false, reason: "invalid_token" };
  if (parsed.adId !== adId || parsed.userId !== userId) return { success: false, reason: "mismatch" };

  const watchMs = Date.now() - parsed.startedAt;
  if (watchMs < minWatchSeconds * 1000) return { success: false, reason: "too_fast" };

  const fingerprint = await getBrowserFingerprint();
  const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: duplicateRows, error: duplicateError } = await supabase
    .from("transactions")
    .select("id")
    .eq("type", "ad_view")
    .eq("fingerprint", fingerprint)
    .eq("ad_id", adId)
    .gte("created_at", sixtyMinutesAgo)
    .limit(1);

  if (duplicateError) return { success: false, reason: "transaction_log_failed" };
  if ((duplicateRows?.length ?? 0) > 0) return { success: false, reason: "duplicate_fingerprint" };

  const { count, error: velocityError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("type", "ad_view")
    .eq("user_id", userId)
    .gte("created_at", fiveMinutesAgo);

  if (velocityError) return { success: false, reason: "transaction_log_failed" };
  if ((count ?? 0) >= 8) return { success: false, reason: "velocity_exceeded" };

  const { error: walletError } = await supabase.rpc("increment_wallet", {
    p_user_id: userId,
    p_amount_cents: rewardCents,
  });

  if (walletError) return { success: false, reason: "wallet_credit_failed" };

  const logged = await logTransaction({
    user_id: userId,
    type: "ad_view",
    amount_cents: rewardCents,
    status: "completed",
    ad_id: adId,
    fingerprint,
    metadata: {
      watch_seconds: Math.floor(watchMs / 1000),
      min_watch_seconds: minWatchSeconds,
      source: "completeAdView",
    },
  });

  if (!logged) return { success: false, reason: "transaction_log_failed" };
  return { success: true, reason: "ok" };
}

export async function creditReferralJoin(
  referrerId: string,
  newUserId: string,
  bonusCents = 200,
): Promise<CompletionResult> {
  const supabase = createAdminClient();
  if (!supabase) return { success: false, reason: "supabase_unavailable" };

  const { error: walletError } = await supabase.rpc("increment_wallet", {
    p_user_id: referrerId,
    p_amount_cents: bonusCents,
  });

  if (walletError) return { success: false, reason: "wallet_credit_failed" };

  const logged = await logTransaction({
    user_id: referrerId,
    type: "referral_join",
    amount_cents: bonusCents,
    status: "completed",
    metadata: {
      new_user_id: newUserId,
      source: "creditReferralJoin",
    },
  });

  if (!logged) return { success: false, reason: "transaction_log_failed" };
  return { success: true, reason: "ok" };
}

export async function creditReferralUpgrade(
  referrerId: string,
  upgradedUserId: string,
  plan: "basic" | "pro" | "elite",
): Promise<CompletionResult> {
  const commissions: Record<"basic" | "pro" | "elite", number> = {
    basic: 500,
    pro: 1500,
    elite: 2500,
  };
  const commission = commissions[plan];

  const supabase = createAdminClient();
  if (!supabase) return { success: false, reason: "supabase_unavailable" };

  const { error: walletError } = await supabase.rpc("increment_wallet", {
    p_user_id: referrerId,
    p_amount_cents: commission,
  });

  if (walletError) return { success: false, reason: "wallet_credit_failed" };

  const logged = await logTransaction({
    user_id: referrerId,
    type: "referral_upgrade",
    amount_cents: commission,
    status: "completed",
    metadata: {
      upgraded_user_id: upgradedUserId,
      plan,
      source: "creditReferralUpgrade",
    },
  });

  if (!logged) return { success: false, reason: "transaction_log_failed" };
  return { success: true, reason: "ok" };
}

/*
-- 1) Create transactions table (first-time setup)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text,
  amount_cents integer default 0,
  status text default 'pending',
  ad_id text,
  fingerprint text,
  ip_address text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 1b) Backfill missing columns for existing transactions tables
alter table public.transactions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.transactions add column if not exists type text;
alter table public.transactions add column if not exists amount_cents integer default 0;
alter table public.transactions add column if not exists status text default 'pending';
alter table public.transactions add column if not exists ad_id text;
alter table public.transactions add column if not exists fingerprint text;
alter table public.transactions add column if not exists ip_address text;
alter table public.transactions add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.transactions add column if not exists created_at timestamptz default now();

-- 2) Indexes
create index if not exists idx_transactions_user_created_at_desc
  on public.transactions (user_id, created_at desc);
create index if not exists idx_transactions_fingerprint_ad_created
  on public.transactions (fingerprint, ad_id, created_at desc);

-- 3) RLS and policy
alter table public.transactions enable row level security;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'transactions'
      and policyname = 'users_can_read_own_transactions'
  ) then
    create policy "users_can_read_own_transactions"
      on public.transactions
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

-- 4) Profiles columns
alter table public.profiles add column if not exists balance_cents integer not null default 0;
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references auth.users(id);
alter table public.profiles add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_referral_code_key'
  ) then
    alter table public.profiles add constraint profiles_referral_code_key unique (referral_code);
  end if;
end
$$;

-- 5) increment_wallet function
create or replace function public.increment_wallet(p_user_id uuid, p_amount_cents integer)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set balance_cents = coalesce(balance_cents, 0) + coalesce(p_amount_cents, 0)
  where user_id = p_user_id;
end;
$$;

-- 6) generate_referral_code function + trigger
create or replace function public.generate_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := 'GARM-' || upper(substr(md5(new.user_id::text), 1, 4));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_generate_referral_code on public.profiles;
create trigger trg_generate_referral_code
before insert on public.profiles
for each row
execute function public.generate_referral_code();
*/
