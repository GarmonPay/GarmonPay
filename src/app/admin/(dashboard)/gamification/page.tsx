"use client";

import { useEffect, useState } from "react";
import { getGamificationConfig } from "@/lib/gamification";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function GamificationPage() {
  const [config, setConfig] = useState<any>(null);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    load();
  }, [session]);

  async function load() {
    const data = await getGamificationConfig();
    setConfig(data);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!session || config == null) return;
    const form = e.currentTarget;
    const referralReward = Number((form.elements.namedItem("referral_reward") as HTMLInputElement)?.value);
    const spinReward = Number((form.elements.namedItem("spin_reward") as HTMLInputElement)?.value);
    if (!Number.isFinite(referralReward) || !Number.isFinite(spinReward)) {
      setMessage({ type: "error", text: "Enter valid numbers" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/admin/gamification-config`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...adminApiHeaders(session),
        },
        body: JSON.stringify({ referral_reward: referralReward, spin_reward: spinReward }),
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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-4">Gamification Config</h1>
      {config === null ? (
        <p className="text-amber-400">
          No config found. Run the SQL in <code className="bg-white/10 px-1 rounded">supabase/gamification.sql</code> in
          your Supabase SQL Editor to create the table and seed row.
        </p>
      ) : (
        <>
          <p className="text-[#10b981] text-sm mb-4">Gamification Config Loaded</p>

          <form onSubmit={handleSave} className="mb-6 p-5 rounded-xl bg-[#111827] border border-white/10 max-w-md space-y-4">
            <div>
              <label htmlFor="referral_reward" className="block text-sm text-[#9ca3af] mb-1">
                Referral reward
              </label>
              <input
                id="referral_reward"
                name="referral_reward"
                type="number"
                step="any"
                defaultValue={config.referral_reward ?? 1}
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
              />
            </div>
            <div>
              <label htmlFor="spin_reward" className="block text-sm text-[#9ca3af] mb-1">
                Spin reward
              </label>
              <input
                id="spin_reward"
                name="spin_reward"
                type="number"
                step="any"
                defaultValue={config.spin_reward ?? 0.5}
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
            {JSON.stringify(config, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
