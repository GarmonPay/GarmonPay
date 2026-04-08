"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Config = {
  id: string | null;
  spin_cost: number;
  scratch_cost: number;
  mystery_box_cost: number;
  boxing_cost: number;
  pinball_cost: number;
  house_edge: number;
  created_at: string | null;
};

const DEFAULT_CONFIG: Config = {
  id: null,
  spin_cost: 1,
  scratch_cost: 1,
  mystery_box_cost: 2,
  boxing_cost: 1,
  pinball_cost: 1,
  house_edge: 0.1,
  created_at: null,
};

export default function GamificationPage() {
  const [config, setConfig] = useState<Config | null | undefined>(undefined);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/gamification-config`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfig(data.config ?? DEFAULT_CONFIG);
        setLoadError(data.message ?? "Failed to load config");
        return;
      }
      setConfig(data.config ?? DEFAULT_CONFIG);
    } catch {
      setConfig(DEFAULT_CONFIG);
      setLoadError("Request failed");
    }
  }, [session]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!session || !config) return;
    const form = e.currentTarget;
    const spin_cost = Number((form.elements.namedItem("spin_cost") as HTMLInputElement)?.value);
    const scratch_cost = Number((form.elements.namedItem("scratch_cost") as HTMLInputElement)?.value);
    const mystery_box_cost = Number((form.elements.namedItem("mystery_box_cost") as HTMLInputElement)?.value);
    const boxing_cost = Number((form.elements.namedItem("boxing_cost") as HTMLInputElement)?.value);
    const pinball_cost = Number((form.elements.namedItem("pinball_cost") as HTMLInputElement)?.value);
    const house_edge = Number((form.elements.namedItem("house_edge") as HTMLInputElement)?.value);

    if (
      !Number.isFinite(spin_cost) ||
      !Number.isFinite(scratch_cost) ||
      !Number.isFinite(mystery_box_cost) ||
      !Number.isFinite(boxing_cost) ||
      !Number.isFinite(pinball_cost) ||
      !Number.isFinite(house_edge)
    ) {
      setMessage({ type: "error", text: "Enter valid numbers" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/admin/gamification-config`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...adminApiHeaders(session),
        },
        body: JSON.stringify({
          id: config.id,
          spin_cost,
          scratch_cost,
          mystery_box_cost,
          boxing_cost,
          pinball_cost,
          house_edge,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: (data.message as string) || "Save failed" });
        return;
      }
      setMessage({ type: "success", text: "Saved" });
      await load();
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: "error", text: "Request failed" });
    } finally {
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[200px] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  if (config === undefined) {
    return <div className="p-8 text-[#9ca3af]">Loading gamification config...</div>;
  }

  const c = config ?? DEFAULT_CONFIG;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-4">Gamification Config</h1>
      {loadError && (
        <p className="text-amber-400 mb-4">Could not load from server: {loadError}. Showing defaults; save to create/update.</p>
      )}
      <p className="text-[#10b981] text-sm mb-4">Config loaded. Costs are in credits; house_edge is a decimal (e.g. 0.10 = 10%).</p>

      <form onSubmit={handleSave} className="mb-6 p-5 rounded-xl bg-[#111827] border border-white/10 max-w-md space-y-4">
        <div>
          <label htmlFor="spin_cost" className="block text-sm text-[#9ca3af] mb-1">Spin cost</label>
          <input
            id="spin_cost"
            name="spin_cost"
            type="number"
            step="any"
            min={0}
            defaultValue={c.spin_cost}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
          />
        </div>
        <div>
          <label htmlFor="scratch_cost" className="block text-sm text-[#9ca3af] mb-1">Scratch cost</label>
          <input
            id="scratch_cost"
            name="scratch_cost"
            type="number"
            step="any"
            min={0}
            defaultValue={c.scratch_cost}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
          />
        </div>
        <div>
          <label htmlFor="mystery_box_cost" className="block text-sm text-[#9ca3af] mb-1">Mystery box cost</label>
          <input
            id="mystery_box_cost"
            name="mystery_box_cost"
            type="number"
            step="any"
            min={0}
            defaultValue={c.mystery_box_cost}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
          />
        </div>
        <div>
          <label htmlFor="boxing_cost" className="block text-sm text-[#9ca3af] mb-1">Boxing cost</label>
          <input
            id="boxing_cost"
            name="boxing_cost"
            type="number"
            step="any"
            min={0}
            defaultValue={c.boxing_cost}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
          />
        </div>
        <div>
          <label htmlFor="pinball_cost" className="block text-sm text-[#9ca3af] mb-1">Pinball cost</label>
          <input
            id="pinball_cost"
            name="pinball_cost"
            type="number"
            step="any"
            min={0}
            defaultValue={c.pinball_cost}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
          />
        </div>
        <div>
          <label htmlFor="house_edge" className="block text-sm text-[#9ca3af] mb-1">House edge (e.g. 0.10 = 10%)</label>
          <input
            id="house_edge"
            name="house_edge"
            type="number"
            step="0.01"
            min={0}
            max={1}
            defaultValue={c.house_edge}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-[#10b981] text-white font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {message && (
        <p className={`mb-4 text-sm ${message.type === "success" ? "text-[#10b981]" : "text-red-400"}`}>
          {message.text}
        </p>
      )}

      <pre className="p-4 rounded-xl bg-[#111827] border border-white/10 text-[#e5e7eb] text-sm overflow-auto max-w-3xl">
        {JSON.stringify(c, null, 2)}
      </pre>
    </div>
  );
}
