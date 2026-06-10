"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { CoinFlip3D } from "@/components/games/CoinFlip3D";
import { REFERRAL_FLIP_STAKE_GPC } from "@/lib/coin-flip";
import {
  inviteFlipPath,
  persistReferralFlipInvite,
  POST_AUTH_REDIRECT_KEY,
  setReferralCookie,
} from "@/lib/referral-flip-invite";
import { useCoins } from "@/hooks/useCoins";

const API = "/api/coin-flip";
const FLIP_ANIM_MS = 3000;
const RESULT_SETTLE_MS = 400;
const BG = "#0e0118";
const GOLD = "#f5c842";
const BUY_GOLD_URL = "/dashboard/buy-coins";

type InvitePreview = {
  valid: boolean;
  status?: string;
  betAmountMinor?: number;
};

export default function ReferralFlipInvitePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const gameId = typeof params?.gameId === "string" ? params.gameId.trim() : "";
  const refCode = searchParams.get("ref")?.trim() ?? "";

  const { sweepsCoins, formatGPC, refresh, applyServerGpayBalance } = useCoins();
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [side, setSide] = useState<"heads" | "tails">("heads");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyGoldUrl, setBuyGoldUrl] = useState<string | null>(null);

  const [flipGeneration, setFlipGeneration] = useState(0);
  const [targetFace, setTargetFace] = useState<"heads" | "tails" | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [won, setWon] = useState<boolean | null>(null);
  const [lastResult, setLastResult] = useState<{
    result: "heads" | "tails";
    youWon: boolean;
    netMinor: number;
  } | null>(null);
  const pendingRef = useRef<{ youWon: boolean; netMinor: number } | null>(null);
  const balanceAfterFlipRef = useRef<{ gpayCoins: number } | null>(null);

  useEffect(() => {
    if (!gameId) return;
    if (refCode) setReferralCookie(refCode);
    persistReferralFlipInvite(gameId, refCode || undefined);
  }, [gameId, refCode]);

  useEffect(() => {
    if (!gameId) {
      setLoading(false);
      return;
    }
    fetch(`${API}/invite/${encodeURIComponent(gameId)}`)
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setPreview(d as InvitePreview))
      .catch(() => setPreview({ valid: false }))
      .finally(() => setLoading(false));
  }, [gameId]);

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) return;

    const sync = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const u = session?.user as { email_confirmed_at?: string | null } | undefined;
      const isVerified =
        !!session?.user && u?.email_confirmed_at != null && u.email_confirmed_at !== "";
      setVerified(isVerified);
      setToken(isVerified ? session!.access_token : null);
    };
    void sync();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void sync();
    });
    return () => subscription.unsubscribe();
  }, []);

  const authHeaders = useCallback(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const handleCoinResult = useCallback(
    (resultFace: "heads" | "tails") => {
      const p = pendingRef.current;
      const bal = balanceAfterFlipRef.current;
      window.setTimeout(() => {
        if (bal && Number.isFinite(bal.gpayCoins)) {
          applyServerGpayBalance(bal.gpayCoins);
        }
        balanceAfterFlipRef.current = null;
        void refresh();
        setIsFlipping(false);
        setWon(p?.youWon ?? false);
        setLastResult({
          result: resultFace,
          youWon: p?.youWon ?? false,
          netMinor: typeof p?.netMinor === "number" ? p.netMinor : 0,
        });
        pendingRef.current = null;
        setBusy(false);
      }, RESULT_SETTLE_MS);
    },
    [refresh, applyServerGpayBalance]
  );

  async function handleJoin() {
    if (!token || !gameId || busy || isFlipping) return;
    setError(null);
    setBuyGoldUrl(null);
    setLastResult(null);
    setWon(null);
    balanceAfterFlipRef.current = null;
    setTargetFace(null);
    setIsFlipping(true);
    setFlipGeneration((g) => g + 1);
    setBusy(true);

    try {
      const d = await Promise.all([
        (async () => {
          const r = await fetch(`${API}/join`, {
            method: "POST",
            credentials: "include",
            headers: authHeaders(),
            body: JSON.stringify({ gameId, side }),
          });
          const j = (await r.json().catch(() => ({}))) as {
            message?: string;
            code?: string;
            buyGoldUrl?: string;
            result?: string;
            youWon?: boolean;
            netMinor?: number;
            gpayCoins?: number;
            new_balance?: number;
          };
          if (!r.ok) {
            if (j.code === "INSUFFICIENT_GPC" && j.buyGoldUrl) {
              setBuyGoldUrl(j.buyGoldUrl);
            }
            throw new Error(typeof j.message === "string" ? j.message : "Join failed");
          }
          return j;
        })(),
        new Promise<void>((resolve) => setTimeout(resolve, FLIP_ANIM_MS)),
      ]).then(([data]) => data);

      const authoritative =
        typeof d.gpayCoins === "number"
          ? d.gpayCoins
          : typeof d.new_balance === "number"
            ? d.new_balance
            : null;
      if (authoritative != null && Number.isFinite(authoritative)) {
        balanceAfterFlipRef.current = { gpayCoins: Math.max(0, Math.floor(authoritative)) };
      }

      const res: "heads" | "tails" = d.result === "tails" ? "tails" : "heads";
      pendingRef.current = {
        youWon: !!d.youWon,
        netMinor: typeof d.netMinor === "number" ? Math.trunc(d.netMinor) : 0,
      };
      setTargetFace(res);
    } catch (e) {
      balanceAfterFlipRef.current = null;
      setError(e instanceof Error ? e.message : "Join failed");
      setIsFlipping(false);
      setTargetFace(null);
      setBusy(false);
    }
  }

  function goRegister() {
    const path = inviteFlipPath(gameId, refCode || undefined);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, path);
    }
    const q = new URLSearchParams();
    if (refCode) q.set("ref", refCode);
    q.set("flip", gameId);
    router.push(`/register?${q.toString()}`);
  }

  function goLogin() {
    const next = encodeURIComponent(inviteFlipPath(gameId, refCode || undefined));
    router.push(`/login?next=${next}`);
  }

  if (!gameId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/70" style={{ background: BG }}>
        Invalid invite link.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/70" style={{ background: BG }}>
        Loading invite…
      </div>
    );
  }

  if (!preview?.valid) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center"
        style={{ background: BG }}
      >
        <p className="text-lg text-white/90">This coin flip invite is no longer available.</p>
        <p className="text-sm text-white/50">
          It may have been joined, cancelled, or expired.
        </p>
        <Link href="/dashboard/coin-flip" className="text-sm underline" style={{ color: GOLD }}>
          Go to Coin Flip
        </Link>
      </div>
    );
  }

  const canAfford = sweepsCoins >= REFERRAL_FLIP_STAKE_GPC;

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: BG }}>
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold" style={{ color: GOLD }}>
            Coin Flip Invite
          </h1>
          <p className="mt-2 text-sm text-white/70">
            Stake {REFERRAL_FLIP_STAKE_GPC} GPC each · Winner takes 90 GPC (10% platform fee)
          </p>
          {token && (
            <p className="mt-1 text-sm font-medium" style={{ color: GOLD }}>
              Balance: {formatGPC(sweepsCoins)}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 space-y-2">
            <p>{error}</p>
            {buyGoldUrl && (
              <Link
                href={buyGoldUrl || BUY_GOLD_URL}
                className="inline-block font-semibold underline"
                style={{ color: GOLD }}
              >
                Buy Gold Coins →
              </Link>
            )}
          </div>
        )}

        <CoinFlip3D
          flipGeneration={flipGeneration}
          result={targetFace}
          isFlipping={isFlipping}
          playerWon={won}
          onResult={handleCoinResult}
        />

        {lastResult && !isFlipping && (
          <div className="rounded-xl border border-white/10 bg-black/30 px-5 py-4 text-center">
            <p className="text-lg font-semibold" style={{ color: GOLD }}>
              {lastResult.youWon ? "You won" : "You lost"} — {lastResult.result.toUpperCase()}
            </p>
            <p
              className={`text-sm mt-1 font-semibold tabular-nums ${lastResult.netMinor >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {lastResult.netMinor >= 0 ? "+" : "−"}
              {Math.abs(lastResult.netMinor).toLocaleString()} GPC
            </p>
            <Link
              href="/dashboard/coin-flip"
              className="mt-4 inline-block text-sm underline text-white/70"
            >
              Back to Coin Flip
            </Link>
          </div>
        )}

        {!token && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-6 space-y-4 text-center">
            <p className="text-white/80">Sign in or create an account to join this flip.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={goRegister}
                className="rounded-xl border border-[#f5c842]/40 bg-[#f5c842]/10 px-5 py-3 font-semibold text-[#f5c842]"
              >
                Create account
              </button>
              <button
                type="button"
                onClick={goLogin}
                className="rounded-xl border border-white/20 px-5 py-3 font-semibold text-white/80"
              >
                Log in
              </button>
            </div>
          </div>
        )}

        {token && verified && !lastResult && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-6 space-y-4">
            <p className="text-sm text-white/70 text-center">Pick your side — your friend gets the other.</p>
            <div className="flex gap-2">
              {(["heads", "tails"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  disabled={busy || isFlipping}
                  className={`flex-1 rounded-xl py-3 font-semibold capitalize border ${
                    side === s
                      ? "border-[#f5c842] bg-[#f5c842]/15 text-[#f5c842]"
                      : "border-white/10 text-white/60"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {!canAfford && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                You need {REFERRAL_FLIP_STAKE_GPC} GPC to join.{" "}
                <Link href={BUY_GOLD_URL} className="font-semibold underline" style={{ color: GOLD }}>
                  Buy Gold Coins
                </Link>
              </div>
            )}
            <button
              type="button"
              disabled={busy || isFlipping || !canAfford}
              onClick={() => void handleJoin()}
              className="w-full rounded-xl border border-[#f5c842]/40 bg-[#f5c842]/10 py-3.5 font-semibold text-[#f5c842] disabled:opacity-40"
            >
              {busy || isFlipping ? "Flipping…" : `Join & flip (${REFERRAL_FLIP_STAKE_GPC} GPC)`}
            </button>
          </div>
        )}

        {token && !verified && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 text-center">
            Confirm your email before playing. Check your inbox for the verification link.
          </div>
        )}
      </div>
    </div>
  );
}
