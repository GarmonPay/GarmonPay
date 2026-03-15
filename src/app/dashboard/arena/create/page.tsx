"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STYLES = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;
const AVATARS = ["🥊", "👊", "💪", "🔥", "⚡", "🎯", "🦁", "🐺", "🦅", "🐲", "💀", "👑"];
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function CreateFighterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]>("Brawler");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Fighter name must be at least 2 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/arena/fighters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed, style, avatar }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.message as string) || "Failed to create fighter");
        setLoading(false);
        return;
      }
      router.replace("/dashboard/arena");
    } catch {
      setError("Request failed");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-6">
        <h1 className="text-2xl font-bold text-white mb-2">Create your fighter</h1>
        <p className="text-[#9ca3af] text-sm mb-6">One fighter per account. Choose name, style, and avatar.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-1">Fighter name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Iron Mike"
              className="w-full px-4 py-2.5 rounded-lg bg-[#0d1117] border border-white/10 text-white placeholder-[#6b7280]"
              maxLength={50}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-2">Style</label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    style === s ? "bg-[#f0a500] text-black" : "bg-[#0d1117] border border-white/10 text-white hover:bg-white/5"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-2">Avatar</label>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatar(a)}
                  className={`text-2xl w-12 h-12 rounded-lg border transition ${
                    avatar === a ? "border-[#f0a500] bg-[#f0a500]/20" : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-lg bg-[#f0a500] text-black font-bold hover:bg-[#e09500] disabled:opacity-70"
            >
              {loading ? "Creating…" : "Enter the Arena"}
            </button>
            <Link
              href="/dashboard/arena"
              className="px-4 py-3 rounded-lg border border-white/20 text-white font-medium hover:bg-white/5"
            >
              Back
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
