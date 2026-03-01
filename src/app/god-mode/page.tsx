"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

const GOLD = "#d4af37";
const GOLD_DARK = "#b8960c";
const BLACK = "#0a0a0a";
const OFF_BLACK = "#111111";

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

type Stats = {
  totalUserBalanceCents: number;
  totalAdCreditBalanceCents: number;
  totalWithdrawalsPendingCents: number;
  totalWithdrawalsCompletedCents: number;
  totalPlatformProfitCents: number;
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  recentRegistrations: { id: string; email: string; created_at: string }[];
  recentAdEarnings: { user_id: string; amount: number; created_at: string }[];
  recentWithdrawals: { id: string; user_id: string; amount: number; status: string; created_at: string }[];
};

type Flags = { pause_ads: boolean; pause_withdrawals: boolean; maintenance_mode: boolean };

export default function GodModePage() {
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [flags, setFlags] = useState<Flags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.replace("/admin/login");
      setAllowed(false);
      setLoading(false);
      return;
    }
    if (!session.isSuperAdmin) {
      router.replace("/dashboard");
      setAllowed(false);
      return;
    }
    setAllowed(true);
    fetch(`${API_BASE}/god-mode`, { headers: adminApiHeaders(session) })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data) => {
        setStats(data.stats ?? null);
        setFlags(data.flags ?? null);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [router, session]);

  async function toggleFlag(key: keyof Flags) {
    if (!session?.isSuperAdmin || !flags) return;
    setToggling(key);
    const next = !flags[key];
    try {
      const res = await fetch(`${API_BASE}/god-mode/controls`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminApiHeaders(session) },
        body: JSON.stringify({ [key]: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.flags) setFlags(data.flags);
    } finally {
      setToggling(null);
    }
  }

  if (allowed === null || allowed === false) {
    return (
      <div style={{ minHeight: "100vh", background: BLACK, color: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {allowed === false ? "Redirecting…" : "Loading…"}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BLACK, color: "#e5e5e5" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <header style={{ borderBottom: `2px solid ${GOLD}`, paddingBottom: "1rem", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: GOLD, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            God Mode
          </h1>
          <p style={{ color: "#888", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Owner-only dashboard · Platform control
          </p>
        </header>

        {error && (
          <div style={{ padding: "1rem", background: "rgba(220,38,38,0.2)", color: "#fca5a5", borderRadius: 8, marginBottom: "1.5rem" }}>
            {error}
          </div>
        )}

        {loading || !stats ? (
          <p style={{ color: GOLD }}>Loading…</p>
        ) : (
          <>
            <section style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: GOLD, marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Platform financial data
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
                <Card title="Total platform profit" value={formatCents(stats.totalPlatformProfitCents)} />
                <Card title="Total user balance" value={formatCents(stats.totalUserBalanceCents)} />
                <Card title="Total advertiser balance" value={formatCents(stats.totalAdCreditBalanceCents)} />
                <Card title="Withdrawals pending" value={formatCents(stats.totalWithdrawalsPendingCents)} />
                <Card title="Withdrawals completed" value={formatCents(stats.totalWithdrawalsCompletedCents)} />
              </div>
            </section>

            <section style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: GOLD, marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                User stats
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
                <Card title="Total users" value={String(stats.totalUsers)} />
                <Card title="Active users" value={String(stats.activeUsers)} />
                <Card title="New users today" value={String(stats.newUsersToday)} />
              </div>
            </section>

            <section style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: GOLD, marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Live activity feed
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
                <ActivityBlock title="Recent registrations" items={stats.recentRegistrations.slice(0, 8).map((r) => ({ id: r.id, text: r.email, sub: formatDate(r.created_at) }))} />
                <ActivityBlock title="Recent ad earnings" items={stats.recentAdEarnings.slice(0, 8).map((e) => ({ id: e.user_id + e.created_at, text: formatCents(e.amount), sub: formatDate(e.created_at) }))} />
                <ActivityBlock title="Recent withdrawals" items={stats.recentWithdrawals.slice(0, 8).map((w) => ({ id: w.id, text: `${formatCents(w.amount)} · ${w.status}`, sub: formatDate(w.created_at) }))} />
              </div>
            </section>

            <section>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: GOLD, marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Owner controls
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
                <ControlButton
                  label={flags?.pause_ads ? "Resume Ad System" : "Pause Ad System"}
                  active={!!flags?.pause_ads}
                  onClick={() => toggleFlag("pause_ads")}
                  loading={toggling === "pause_ads"}
                />
                <ControlButton
                  label={flags?.pause_withdrawals ? "Resume Withdrawals" : "Pause Withdrawals"}
                  active={!!flags?.pause_withdrawals}
                  onClick={() => toggleFlag("pause_withdrawals")}
                  loading={toggling === "pause_withdrawals"}
                />
                <ControlButton
                  label={flags?.maintenance_mode ? "Disable Maintenance Mode" : "Enable Maintenance Mode"}
                  active={!!flags?.maintenance_mode}
                  onClick={() => toggleFlag("maintenance_mode")}
                  loading={toggling === "maintenance_mode"}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ background: OFF_BLACK, border: `1px solid ${GOLD}40`, borderRadius: 8, padding: "1rem" }}>
      <p style={{ fontSize: "0.75rem", color: "#888", marginBottom: "0.25rem", textTransform: "uppercase" }}>{title}</p>
      <p style={{ fontSize: "1.25rem", fontWeight: 700, color: GOLD }}>{value}</p>
    </div>
  );
}

function ActivityBlock({ title, items }: { title: string; items: { id: string; text: string; sub: string }[] }) {
  return (
    <div style={{ background: OFF_BLACK, border: `1px solid ${GOLD}40`, borderRadius: 8, padding: "1rem", maxHeight: 320, overflow: "auto" }}>
      <p style={{ fontSize: "0.75rem", color: GOLD, marginBottom: "0.75rem", textTransform: "uppercase", fontWeight: 600 }}>{title}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.length === 0 ? (
          <li style={{ padding: "0.5rem 0", color: "#666", fontSize: "0.875rem" }}>No activity</li>
        ) : (
          items.map((item) => (
            <li key={item.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid rgba(212,175,55,0.15)", fontSize: "0.875rem" }}>
              <span style={{ color: "#e5e5e5" }}>{item.text}</span>
              <span style={{ color: "#666", marginLeft: "0.5rem", fontSize: "0.75rem" }}>{item.sub}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function ControlButton({
  label,
  active,
  onClick,
  loading,
}: { label: string; active: boolean; onClick: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        padding: "0.75rem 1.25rem",
        borderRadius: 8,
        border: `2px solid ${active ? GOLD_DARK : GOLD}`,
        background: active ? `${GOLD}22` : "transparent",
        color: GOLD,
        fontWeight: 700,
        fontSize: "0.875rem",
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "…" : label}
    </button>
  );
}
