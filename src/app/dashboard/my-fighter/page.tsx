"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getDashboard } from "@/lib/api";

type Fighter = {
  id: string;
  name: string;
  speed: number;
  power: number;
  defense: number;
  stamina?: number;
  experience?: number;
  wins: number;
  losses: number;
  level: number;
  gender?: string | null;
  skin_tone?: string | null;
  gloves?: string | null;
  shorts?: string | null;
  shoes?: string | null;
};

const GENDERS = [{ value: "male", label: "Male" }, { value: "female", label: "Female" }];
const SKIN_TONES = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "dark", label: "Dark" },
];
const GLOVES = [
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
  { value: "black", label: "Black" },
  { value: "gold", label: "Gold" },
];
const SHORTS = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
];
const SHOES = [
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
  { value: "red", label: "Red" },
];

export default function MyFighterPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [savingCustom, setSavingCustom] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/my-fighter");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken });
      Promise.all([
        getDashboard(tokenOrId, isToken).then((d) => setBalanceCents(d.balanceCents ?? 0)),
        fetch("/api/fighters", { credentials: "include" })
          .then((r) => r.json())
          .then((data: { fighters?: Fighter[] }) => setFighters(data.fighters ?? [])),
      ]).catch(() => setError("Failed to load")).finally(() => setLoading(false));
    });
  }, [router]);

  const createFighter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !createName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/fighters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: createName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create fighter");
        return;
      }
      setFighters((prev) => [...prev, data.fighter]);
      setCreateName("");
    } catch {
      setError("Request failed");
    } finally {
      setCreating(false);
    }
  };

  const saveCustomization = async (fighterId: string, payload: Partial<Fighter>) => {
    setSavingCustom(fighterId);
    setError(null);
    try {
      const res = await fetch("/api/fighters/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fighter_id: fighterId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setFighters((prev) => prev.map((f) => (f.id === fighterId ? { ...f, ...data.fighter } : f)));
    } catch {
      setError("Request failed");
    } finally {
      setSavingCustom(null);
    }
  };

  if (!session && !loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-fintech-muted">Redirecting to login…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">My Fighter</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Create and customize your boxer. Cosmetics are saved to your fighter profile.
        </p>
      </div>

      {balanceCents !== null && (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 px-4 py-3">
          <span className="text-fintech-muted">Wallet </span>
          <span className="font-semibold text-fintech-money">${(balanceCents / 100).toFixed(2)}</span>
          <span className="text-fintech-muted ml-2">— use for training and cosmetics</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">{error}</div>
      )}

      <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white mb-4">Create fighter</h2>
        <form onSubmit={createFighter} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm text-fintech-muted">Name</label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Fighter name"
              className="mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-fintech-muted focus:border-amber-500 focus:outline-none w-48"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !createName.trim()}
            className="rounded-lg bg-amber-500/90 px-4 py-2 font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
      </section>

      {fighters.length > 0 && (
        <section className="space-y-6">
          <h2 className="text-lg font-bold text-white">Your fighters</h2>
          {fighters.map((f) => (
            <div
              key={f.id}
              className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden"
            >
              <div className="border-b border-white/10 px-6 py-4 bg-gradient-to-r from-amber-500/10 to-transparent flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{f.name}</h3>
                  <p className="text-sm text-fintech-muted">
                    Lv.{f.level} · W{f.wins} / L{f.losses} · Speed {f.speed} Power {f.power} Defense {f.defense} Stamina {f.stamina ?? 50} · XP {f.experience ?? 0}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/dashboard/training-gym"
                    className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
                  >
                    Train
                  </Link>
                  <Link
                    href="/dashboard/fight-arena"
                    className="rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400"
                  >
                    Fight
                  </Link>
                </div>
              </div>
              <div className="p-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm text-fintech-muted mb-2">Gender (model)</label>
                  <select
                    value={f.gender ?? ""}
                    onChange={(e) => saveCustomization(f.id, { gender: e.target.value || null })}
                    disabled={savingCustom === f.id}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">—</option>
                    {GENDERS.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-fintech-muted mb-2">Skin tone</label>
                  <select
                    value={f.skin_tone ?? ""}
                    onChange={(e) => saveCustomization(f.id, { skin_tone: e.target.value || null })}
                    disabled={savingCustom === f.id}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">—</option>
                    {SKIN_TONES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-fintech-muted mb-2">Gloves</label>
                  <select
                    value={f.gloves ?? ""}
                    onChange={(e) => saveCustomization(f.id, { gloves: e.target.value || null })}
                    disabled={savingCustom === f.id}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">—</option>
                    {GLOVES.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-fintech-muted mb-2">Shorts</label>
                  <select
                    value={f.shorts ?? ""}
                    onChange={(e) => saveCustomization(f.id, { shorts: e.target.value || null })}
                    disabled={savingCustom === f.id}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">—</option>
                    {SHORTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-fintech-muted mb-2">Shoes</label>
                  <select
                    value={f.shoes ?? ""}
                    onChange={(e) => saveCustomization(f.id, { shoes: e.target.value || null })}
                    disabled={savingCustom === f.id}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">—</option>
                    {SHOES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {savingCustom === f.id && (
                <div className="px-6 pb-4 text-sm text-fintech-muted">Saving…</div>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="rounded-xl border border-white/10 p-4 text-sm text-fintech-muted">
        <strong className="text-white">Fighter stats</strong> are improved in the Training Gym. Gender selects the 3D model (male-boxer.glb / female-boxer.glb). Customization options appear in the boxing game.
      </div>
    </div>
  );
}
