"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

type ChecklistItem = {
  id: string;
  item_key: string;
  label: string;
  completed: boolean;
  completed_at: string | null;
};

function AdminLaunchChecklistInner() {
  const session = useAdminSession();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [percent, setPercent] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/launch-checklist`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load");
      setItems(data.items ?? []);
      setPercent(data.percentComplete ?? 0);
      setCompleted(data.completed ?? 0);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(item: ChecklistItem) {
    setBusy(item.item_key);
    try {
      const res = await fetch(`${API_BASE}/admin/launch-checklist`, {
        method: "PATCH",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: item.item_key, completed: !item.completed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-4 tablet:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-white">Pre-Launch Checklist</h1>
        <p className="text-sm text-fintech-muted mt-1">Track launch readiness before going live.</p>
      </div>

      <div className="card-lux p-6">
        <p className="text-sm text-fintech-muted">Launch readiness</p>
        <p className="text-3xl font-bold text-[#fde047] mt-1">
          {percent}% <span className="text-lg text-white/70">({completed} of {total})</span>
        </p>
        <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-[#7c3aed] transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.item_key}
              className="card-lux p-4 flex items-start gap-3"
            >
              <input
                type="checkbox"
                checked={item.completed}
                disabled={busy === item.item_key}
                onChange={() => void toggle(item)}
                className="mt-1 h-4 w-4 rounded border-white/20"
              />
              <div className="flex-1">
                <p className={`text-sm ${item.completed ? "text-fintech-muted line-through" : "text-white"}`}>
                  {item.label}
                </p>
                {item.completed_at && (
                  <p className="text-xs text-fintech-muted mt-1">
                    Done {new Date(item.completed_at).toLocaleString()}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminLaunchChecklistPage() {
  return (
    <AdminPageGate>
      <AdminLaunchChecklistInner />
    </AdminPageGate>
  );
}
