"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getApiRoot } from "@/lib/api";
import { getFightServerHealthUrl } from "@/lib/keepAlive";
import { BoxingRing } from "@/components/arena/BoxingRing";
import type { FighterData } from "@/lib/arena-fighter-types";

type FightServerStatus = "connecting" | "connected" | "offline";

export default function ArenaHubPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fighter, setFighter] = useState<FighterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fightServerStatus, setFightServerStatus] = useState<FightServerStatus>("connecting");

  useEffect(() => {
    const base = getFightServerHealthUrl();
    if (!base) {
      setFightServerStatus("offline");
      return;
    }
    setFightServerStatus("connecting");
    fetch(`${base}/health`, { method: "GET" })
      .then((r) => (r.ok ? "connected" : "offline") as FightServerStatus)
      .catch(() => "offline" as FightServerStatus)
      .then((status) => setFightServerStatus(status));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
    }, 12000);

    getSessionAsync()
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          setLoading(false);
          router.replace("/login?next=/dashboard/arena");
          return;
        }
        setSession(s);
        const token = s.accessToken ?? s.userId;
        const isToken = !!s.accessToken;
        const root = getApiRoot();
        return fetch(`${root}/arena/me`, {
          headers: isToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token },
          credentials: "include",
        })
          .then((r) => {
            if (cancelled) return null;
            if (r.status === 401) {
              router.replace("/login?next=/dashboard/arena");
              return null;
            }
            return r.ok ? r.json() : null;
          })
          .then((data) => {
            if (cancelled) return;
            if (data?.fighter) setFighter(data.fighter);
          })
          .catch(() => {})
          .finally(() => {
            if (!cancelled) {
              clearTimeout(timeout);
              setLoading(false);
            }
          });
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          setLoading(false);
        }
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [router]);

  if (loading) {
    return (
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        <p className="text-[#9ca3af]">Loading GarmonPay Arena…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        <p className="text-[#9ca3af]">Redirecting to login…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl bg-[#161b22] border border-white/10 overflow-hidden">
        <div className="bg-gradient-to-r from-[#f0a500]/20 to-transparent border-b border-white/10 px-6 py-6">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <span className="text-[#f0a500]">🥊</span> GARMONPAY ARENA
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              title={
                fightServerStatus === "connected"
                  ? "Fight server connected"
                  : fightServerStatus === "connecting"
                    ? "Connecting…"
                    : "Fight server offline"
              }
              style={{
                backgroundColor:
                  fightServerStatus === "connected"
                    ? "#22c55e"
                    : fightServerStatus === "connecting"
                      ? "#eab308"
                      : "#ef4444",
              }}
              aria-hidden
            />
          </h1>
          <p className="text-[#9ca3af] mt-2">One fighter per account. Train, fight, earn.</p>
        </div>
        <div className="p-6">
          {fighter ? (
            <div className="flex flex-col md:flex-row md:items-stretch gap-6">
              <div className="min-h-[220px] md:min-w-[280px] md:max-w-[340px] rounded-lg overflow-hidden border border-white/10">
                <BoxingRing mode="profile" fighterA={fighter} animation="idle" />
              </div>
              <div className="flex-1 flex flex-col justify-center gap-4">
                <div>
                  <p className="text-[#9ca3af] text-sm">Your fighter</p>
                  <p className="text-xl font-bold text-white">{fighter.name}</p>
                  <p className="text-[#f0a500]">{fighter.style}</p>
                  <p className="text-sm text-white mt-1">Record: {fighter.wins ?? 0}W – {fighter.losses ?? 0}L</p>
                </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard/arena/fighter"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#3b82f6] text-white font-semibold hover:bg-[#2563eb]"
                >
                  My Fighter
                </Link>
                <Link
                  href="/dashboard/arena/train"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#161b22] border border-white/20 text-white font-semibold hover:bg-white/5"
                >
                  Training Gym
                </Link>
                <Link
                  href="/dashboard/arena/fight"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#f0a500] text-black font-semibold hover:bg-[#e09500]"
                >
                  Find Fight
                </Link>
                <Link
                  href="/dashboard/arena/store"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-semibold hover:bg-white/5"
                >
                  Store
                </Link>
                <Link
                  href="/dashboard/arena/spectate"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-semibold hover:bg-white/5"
                >
                  Watch Live
                </Link>
                <Link
                  href="/dashboard/arena/tournaments"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-semibold hover:bg-white/5"
                >
                  Tournaments
                </Link>
                <Link
                  href="/dashboard/arena/season-pass"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-semibold hover:bg-white/5"
                >
                  Season Pass
                </Link>
                <Link
                  href="/dashboard/arena/daily"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-semibold hover:bg-white/5"
                >
                  Daily
                </Link>
                <Link
                  href="/dashboard/arena/achievements"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-semibold hover:bg-white/5"
                >
                  Achievements
                </Link>
                <Link
                  href="/dashboard/arena/legal"
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-white/20 text-[#9ca3af] font-medium hover:bg-white/5 text-sm"
                >
                  Fair Play & Legal
                </Link>
              </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[#9ca3af] mb-4">You don’t have a fighter yet. Create one to enter the Arena.</p>
              <Link
                href="/dashboard/arena/create"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-[#f0a500] text-black font-bold hover:bg-[#e09500]"
              >
                Create Fighter — Enter the Arena
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
