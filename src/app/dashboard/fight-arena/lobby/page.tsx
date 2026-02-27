"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getDashboard } from "@/lib/api";
import {
  getFightArenaFights,
  createFightArenaFight,
  joinFightArenaFight,
  type FightArenaFight,
} from "@/lib/api";

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

const PLATFORM_FEE_PERCENT = 10;

type ConfirmMode = "create" | "join" | null;

export default function FightArenaLobbyPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [fights, setFights] = useState<FightArenaFight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createFee, setCreateFee] = useState("");
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ mode: ConfirmMode; entryFeeCents: number; fightId?: string } | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/fight-arena/lobby");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken });
      Promise.all([
        getDashboard(tokenOrId, isToken).then((d) => setBalanceCents(d.balanceCents ?? 0)),
        getFightArenaFights(tokenOrId, isToken, "open").then((r) => setFights(r.fights ?? [])),
      ]).catch(() => setError("Failed to load")).finally(() => setLoading(false));
    });
  }, [router]);

  const openCreateConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(createFee) * 100);
    if (!Number.isFinite(cents) || cents < 100) {
      setError("Minimum entry is $1.00");
      return;
    }
    setError(null);
    setConfirmModal({ mode: "create", entryFeeCents: cents });
  };

  const openJoinConfirm = (f: FightArenaFight) => {
    if (balanceCents != null && balanceCents < f.entry_fee) {
      setError("Insufficient balance to join this fight");
      return;
    }
    setError(null);
    setConfirmModal({ mode: "join", entryFeeCents: f.entry_fee, fightId: f.id });
  };

  const handleConfirmBet = async () => {
    if (!session || !confirmModal) return;
    const { mode, entryFeeCents, fightId } = confirmModal;
    if (balanceCents != null && balanceCents < entryFeeCents) {
      setError("Insufficient balance");
      setConfirmModal(null);
      return;
    }
    setConfirmModal(null);
    setError(null);
    if (mode === "create") {
      setCreating(true);
      try {
        const res = await createFightArenaFight(session.tokenOrId, session.isToken, entryFeeCents);
        const createdFightId = res?.fight?.id;
        if (!createdFightId) {
          throw new Error("Fight created but match link is unavailable. Please refresh.");
        }
        router.push(`/dashboard/fight-arena/match/${createdFightId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create fight");
      } finally {
        setCreating(false);
      }
    } else if (mode === "join" && fightId) {
      setJoiningId(fightId);
      try {
        const res = await joinFightArenaFight(session.tokenOrId, session.isToken, fightId);
        const joinedFightId = res?.fight?.id;
        if (!joinedFightId) {
          throw new Error("Joined fight but match link is unavailable. Please refresh.");
        }
        router.push(`/dashboard/fight-arena/match/${joinedFightId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join");
      } finally {
        setJoiningId(null);
      }
    }
  };

  const totalPot = confirmModal ? confirmModal.entryFeeCents * 2 : 0;
  const platformFee = confirmModal ? Math.round(totalPot * (PLATFORM_FEE_PERCENT / 100)) : 0;
  const potentialWinnings = confirmModal ? totalPot - platformFee : 0;
  const canAfford = balanceCents != null && confirmModal != null && balanceCents >= confirmModal.entryFeeCents;

  if (!session && !loading) return null;

  return (
    <div className="arena-bg space-y-6 rounded-2xl p-4 tablet:p-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Lobby</h1>
          <p className="text-sm text-fintech-muted">
            Balance: {balanceCents != null ? formatCents(balanceCents) : "—"}
          </p>
        </div>
        <Link
          href="/dashboard/fight-arena"
          className="text-sm font-medium text-amber-400/90 hover:text-amber-300"
        >
          ← Back to Arena
        </Link>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <section className="arena-border card-lux arena-glow rounded-2xl border p-4 tablet:p-6">
        <h2 className="text-lg font-semibold text-amber-400/90">Create Fight</h2>
        <form onSubmit={openCreateConfirm} className="mt-4 flex flex-col gap-3 tablet:flex-row tablet:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-fintech-muted">Entry fee (USD)</label>
            <input
              type="number"
              step="0.01"
              min="1"
              value={createFee}
              onChange={(e) => setCreateFee(e.target.value)}
              placeholder="1.00"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-fintech-muted focus:border-amber-500/50 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !session}
            className="min-h-touch rounded-xl bg-amber-500/90 px-6 py-3 font-semibold text-black transition-opacity hover:bg-amber-400 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Fight"}
          </button>
        </form>
      </section>

      <section className="arena-border card-lux rounded-2xl border p-4 tablet:p-6">
        <h2 className="text-lg font-semibold text-white">Open Fights</h2>
        {loading ? (
          <p className="mt-4 text-fintech-muted">Loading…</p>
        ) : fights.length === 0 ? (
          <p className="mt-4 text-fintech-muted">No open fights. Create one above.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {fights.map((f) => (
              <li
                key={f.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 tablet:flex-row tablet:items-center tablet:justify-between"
              >
                <div>
                  <p className="font-medium text-white">Entry {formatCents(f.entry_fee)}</p>
                  <p className="text-xs text-fintech-muted">Pot: {formatCents(f.total_pot)}</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/fight-arena/match/${f.id}`}
                    className="min-h-touch rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => openJoinConfirm(f)}
                    disabled={joiningId !== null || (balanceCents != null && balanceCents < f.entry_fee)}
                    className="min-h-touch rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50"
                  >
                    {joiningId === f.id ? "Joining…" : "Join"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !creating && !joiningId && setConfirmModal(null)}
        >
          <div
            className="arena-border arena-glow w-full max-w-sm rounded-2xl border bg-fintech-bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white">Confirm Bet</h3>
            <p className="mt-1 text-sm text-fintech-muted">
              {confirmModal.mode === "create" ? "Create fight with this entry." : "Join this fight."}
            </p>
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-fintech-muted">Entry fee</span>
                <span className="font-medium text-white">{formatCents(confirmModal.entryFeeCents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fintech-muted">Platform fee (10%)</span>
                <span className="font-medium text-white">{formatCents(platformFee)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fintech-muted">Potential winnings</span>
                <span className="font-semibold text-amber-400">{formatCents(potentialWinnings)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fintech-muted">Your balance</span>
                <span className={canAfford ? "font-medium text-fintech-success" : "font-medium text-fintech-danger"}>
                  {balanceCents != null ? formatCents(balanceCents) : "—"}
                </span>
              </div>
              {!canAfford && (
                <p className="text-xs text-fintech-danger">Insufficient balance. Add funds to your wallet first.</p>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={creating || joiningId !== null}
                className="min-h-touch flex-1 rounded-xl border border-white/20 py-3 text-white hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBet}
                disabled={!canAfford || creating || joiningId !== null}
                className="min-h-touch flex-1 rounded-xl bg-amber-500/90 py-3 font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {creating || joiningId ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
