"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import {
  memberPayoutCeilingUsd,
  advertiserBurnCeilingUsd,
  AD_PACKAGE_MEMBER_EARN_PER_VIEW,
  AD_PACKAGE_MEMBER_EARN_PER_CLICK,
  type AdPackageRow,
} from "@/lib/ad-packages";

const API_BASE = getApiRoot();

type AdminPkg = AdPackageRow & { included_clicks?: number; sort_order?: number };

function toNum(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return Math.round(v);
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function AdminAdPackagesPageInner() {
  const session = useAdminSession();
  const [packages, setPackages] = useState<AdminPkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newViews, setNewViews] = useState("");
  const [newClicks, setNewClicks] = useState("");
  const [newSort, setNewSort] = useState("100");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/admin/ad-packages`, { credentials: "include", headers: adminApiHeaders(session) })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { packages?: AdminPkg[]; message?: string };
        if (!r.ok) throw new Error(data.message ?? "Failed to load");
        setPackages(Array.isArray(data.packages) ? data.packages : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  async function saveRow(pkg: AdminPkg, draft: Record<string, string>) {
    setError(null);
    setSuccess(null);
    const res = await fetch(`${API_BASE}/admin/ad-packages`, {
      method: "PATCH",
      credentials: "include",
      headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pkg.id,
        name: draft.name,
        price_monthly: parseFloat(draft.price_monthly),
        ad_views: parseInt(draft.ad_views, 10),
        included_clicks: parseInt(draft.included_clicks || "0", 10),
        sort_order: parseInt(draft.sort_order || "0", 10),
        is_active: draft.is_active === "true",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      setError(data.message ?? "Save failed");
      return;
    }
    setSuccess(`Saved ${pkg.id}`);
    load();
  }

  async function createPackage(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    const res = await fetch(`${API_BASE}/admin/ad-packages`, {
      method: "POST",
      credentials: "include",
      headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newId.trim(),
        name: newName.trim(),
        price_monthly: parseFloat(newPrice),
        ad_views: parseInt(newViews, 10),
        included_clicks: parseInt(newClicks || "0", 10),
        sort_order: parseInt(newSort || "0", 10),
        is_active: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setCreating(false);
    if (!res.ok) {
      setError(data.message ?? "Create failed");
      return;
    }
    setSuccess(`Created ${newId.trim()}`);
    setNewId("");
    setNewName("");
    setNewPrice("");
    setNewViews("");
    setNewClicks("");
    setNewSort("100");
    load();
  }

  return (
    <div className="py-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white mb-2">Ad packages</h1>
        <p className="text-sm text-slate-400 mt-1">
          Prices and allotments sync to <code className="text-violet-300">public.ad_packages</code>. Each save rebuilds
          marketing copy from economics. Live campaigns bill advertisers{" "}
          <strong className="text-white">2×</strong> member payout per event, so price must cover{" "}
          <strong className="text-white">2×</strong> the member pool (
          {AD_PACKAGE_MEMBER_EARN_PER_VIEW}/view + {AD_PACKAGE_MEMBER_EARN_PER_CLICK}/click).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          {packages.map((pkg) => (
            <PackageEditor key={pkg.id} pkg={pkg} onSave={saveRow} />
          ))}
        </div>
      )}

      <form
        onSubmit={createPackage}
        className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
      >
        <h2 className="text-lg font-semibold text-white">Add package</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="text-slate-400">id</span>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
              placeholder="e.g. summer_blitz"
              required
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-400">Name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
              placeholder="Display name"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Sort order</span>
            <input
              value={newSort}
              onChange={(e) => setNewSort(e.target.value)}
              type="number"
              className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Price (USD)</span>
            <input
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              type="number"
              step="0.01"
              min="0.01"
              className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Views</span>
            <input
              value={newViews}
              onChange={(e) => setNewViews(e.target.value)}
              type="number"
              min="1"
              className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Click credits</span>
            <input
              value={newClicks}
              onChange={(e) => setNewClicks(e.target.value)}
              type="number"
              min="0"
              className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:bg-fintech-accent/90 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create package"}
        </button>
      </form>
    </div>
  );
}

export default function AdminAdPackagesPage() {
  return (
    <AdminPageGate>
      <AdminAdPackagesPageInner />
    </AdminPageGate>
  );
}

function PackageEditor({
  pkg,
  onSave,
}: {
  pkg: AdminPkg;
  onSave: (pkg: AdminPkg, draft: Record<string, string>) => void;
}) {
  const [draft, setDraft] = useState({
    name: pkg.name,
    price_monthly: String(toNum(pkg.price_monthly)),
    ad_views: String(toInt(pkg.ad_views)),
    included_clicks: String(toInt(pkg.included_clicks)),
    sort_order: String(toInt(pkg.sort_order)),
    is_active: pkg.is_active === false ? "false" : "true",
  });

  useEffect(() => {
    setDraft({
      name: pkg.name,
      price_monthly: String(toNum(pkg.price_monthly)),
      ad_views: String(toInt(pkg.ad_views)),
      included_clicks: String(toInt(pkg.included_clicks)),
      sort_order: String(toInt(pkg.sort_order)),
      is_active: pkg.is_active === false ? "false" : "true",
    });
  }, [pkg]);

  const views = parseInt(draft.ad_views, 10) || 0;
  const clicks = parseInt(draft.included_clicks, 10) || 0;
  const price = parseFloat(draft.price_monthly) || 0;
  const memberCeil = memberPayoutCeilingUsd({ ad_views: views, included_clicks: clicks });
  const burn = advertiserBurnCeilingUsd({ ad_views: views, included_clicks: clicks });
  const margin = Math.round((price - burn) * 100) / 100;
  const ok = price + 1e-6 >= burn;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="text-violet-300 text-sm">{pkg.id}</code>
        <span className={`text-xs font-medium ${ok ? "text-emerald-400" : "text-red-400"}`}>
          Pool ${memberCeil.toFixed(2)} · Max burn ${burn.toFixed(2)} · Margin ${margin.toFixed(2)}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block text-sm lg:col-span-2">
          <span className="text-slate-400">Name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Price</span>
          <input
            value={draft.price_monthly}
            onChange={(e) => setDraft((d) => ({ ...d, price_monthly: e.target.value }))}
            type="number"
            step="0.01"
            className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Views</span>
          <input
            value={draft.ad_views}
            onChange={(e) => setDraft((d) => ({ ...d, ad_views: e.target.value }))}
            type="number"
            min="1"
            className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Clicks</span>
          <input
            value={draft.included_clicks}
            onChange={(e) => setDraft((d) => ({ ...d, included_clicks: e.target.value }))}
            type="number"
            min="0"
            className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Sort</span>
          <input
            value={draft.sort_order}
            onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))}
            type="number"
            className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Active</span>
          <select
            value={draft.is_active}
            onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.value }))}
            className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={() => onSave(pkg, draft)}
        disabled={!ok}
        className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:bg-fintech-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Save & sync copy
      </button>
    </div>
  );
}
