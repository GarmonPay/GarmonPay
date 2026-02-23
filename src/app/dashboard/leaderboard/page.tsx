"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { getLeaderboard } from "@/lib/api";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const show = local.length <= 2 ? local : local.slice(0, 2) + "***";
  return `${show}@${domain}`;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [topReferrers, setTopReferrers] = useState<Array<{ userId: string; email: string; totalReferrals: number; totalEarningsCents: number }>>([]);
  const [topEarners, setTopEarners] = useState<Array<{ userId: string; email: string; totalEarningsCents: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/leaderboard");
        return;
      }
      setSession({ tokenOrId: s.accessToken ?? s.userId, isToken: !!s.accessToken });
      getLeaderboard(s.accessToken ?? s.userId, !!s.accessToken)
        .then((data) => {
          setTopReferrers(data.topReferrers ?? []);
          setTopEarners(data.topEarners ?? []);
        })
        .catch(() => setError("Failed to load leaderboard"))
        .finally(() => setLoading(false));
    });
  }, [router]);

  const msgStyle: React.CSSProperties = { color: "#9ca3af" };
  if (!session && !loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6" style={{ backgroundColor: "#111827" }}>
        <p className="text-fintech-muted" style={msgStyle}>Redirecting to login…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6" style={{ backgroundColor: "#111827" }}>
        <p className="text-fintech-muted" style={msgStyle}>Loading leaderboard…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="text-sm text-fintech-muted mt-1">Top referrers and earners. Data from database.</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">{error}</div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
          <div className="bg-gradient-to-r from-fintech-accent/20 to-transparent border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-fintech-highlight">🏆</span> Top Referrers
            </h2>
            <p className="text-xs text-fintech-muted mt-1">Sorted by total referrals</p>
          </div>
          <div className="overflow-x-auto">
            {topReferrers.length === 0 ? (
              <p className="p-6 text-fintech-muted">No referrers yet.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-fintech-muted uppercase">
                    <th className="p-3">#</th>
                    <th className="p-3">User</th>
                    <th className="p-3 text-right">Referrals</th>
                    <th className="p-3 text-right">Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {topReferrers.map((r, i) => (
                    <tr key={r.userId} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 font-medium text-fintech-highlight">{i + 1}</td>
                      <td className="p-3 text-white">{maskEmail(r.email)}</td>
                      <td className="p-3 text-right text-white font-medium">{r.totalReferrals}</td>
                      <td className="p-3 text-right text-fintech-money font-medium">{formatCents(r.totalEarningsCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
          <div className="bg-gradient-to-r from-fintech-money/20 to-transparent border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-fintech-money">💰</span> Top Earners
            </h2>
            <p className="text-xs text-fintech-muted mt-1">Sorted by total earnings</p>
          </div>
          <div className="overflow-x-auto">
            {topEarners.length === 0 ? (
              <p className="p-6 text-fintech-muted">No earners yet.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-fintech-muted uppercase">
                    <th className="p-3">#</th>
                    <th className="p-3">User</th>
                    <th className="p-3 text-right">Total Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {topEarners.map((e, i) => (
                    <tr key={e.userId} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 font-medium text-fintech-highlight">{i + 1}</td>
                      <td className="p-3 text-white">{maskEmail(e.email)}</td>
                      <td className="p-3 text-right text-fintech-money font-bold">{formatCents(e.totalEarningsCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
