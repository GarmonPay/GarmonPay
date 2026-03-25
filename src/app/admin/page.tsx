"use client";

import { useMemo, useState } from "react";

type AdminTab = "overview" | "transactions" | "members" | "campaigns" | "flags";

type FlagItem = {
  id: string;
  username: string;
  risk: "High" | "Medium";
  timestamp: string;
  reason: string;
};

const transactionsSeed = [
  { id: "TX-2001", user: "amy@garmonpay.com", type: "withdrawal", amount: -2500, status: "pending", time: "2m ago", ip: "154.21.80.2", flagged: true },
  { id: "TX-2000", user: "leo@garmonpay.com", type: "ad_view", amount: 5, status: "completed", time: "5m ago", ip: "31.44.12.98", flagged: false },
  { id: "TX-1998", user: "kai@garmonpay.com", type: "referral_upgrade", amount: 1500, status: "completed", time: "14m ago", ip: "88.10.52.14", flagged: false },
  { id: "TX-1991", user: "nia@garmonpay.com", type: "chargeback", amount: -4900, status: "failed", time: "50m ago", ip: "188.1.9.223", flagged: true },
];

const membersSeed = [
  { id: "USR-39", name: "Amy Cruz", email: "amy@garmonpay.com", plan: "Pro", earned: 223441, refs: 48, joined: "2026-02-03", status: "active" },
  { id: "USR-11", name: "Leo Shah", email: "leo@garmonpay.com", plan: "Basic", earned: 82420, refs: 17, joined: "2026-01-21", status: "active" },
  { id: "USR-08", name: "Nia Ford", email: "nia@garmonpay.com", plan: "Elite", earned: 662090, refs: 135, joined: "2025-12-11", status: "suspended" },
];

const campaignsSeed = [
  { id: "AD-98", advertiser: "Peak Digital", views: 120240, clicks: 18110, budget: 2500, spent: 1440, status: "running" },
  { id: "AD-97", advertiser: "North Labs", views: 94200, clicks: 9300, budget: 1800, spent: 1262, status: "pending" },
  { id: "AD-96", advertiser: "Nova Commerce", views: 15000, clicks: 2400, budget: 600, spent: 590, status: "paused" },
];

const initialFlags: FlagItem[] = [
  {
    id: "FL-11",
    username: "nia@garmonpay.com",
    risk: "High",
    timestamp: "5 minutes ago",
    reason: "Velocity burst: 11 ad_view completions in under 5 minutes from rotating user agents.",
  },
  {
    id: "FL-10",
    username: "wolfpack_media",
    risk: "Medium",
    timestamp: "22 minutes ago",
    reason: "VPN network overlap with 4 previously banned accounts and repeated fingerprint collisions.",
  },
];

function statusBadge(status: string) {
  if (status === "completed" || status === "active" || status === "running") return "gp-badge-gold";
  if (status === "failed" || status === "suspended") return "bg-red-500/20 text-red-300 border border-red-400/40 rounded-full px-2 py-1 text-xs font-semibold";
  if (status === "pending") return "gp-badge";
  if (status === "paused") return "bg-orange-500/20 text-orange-300 border border-orange-400/40 rounded-full px-2 py-1 text-xs font-semibold";
  return "gp-badge";
}

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [txQuery, setTxQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [flags, setFlags] = useState(initialFlags);
  const [members, setMembers] = useState(membersSeed);

  const filteredTx = useMemo(() => {
    const q = txQuery.trim().toLowerCase();
    if (!q) return transactionsSeed;
    return transactionsSeed.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.user.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.ip.toLowerCase().includes(q),
    );
  }, [txQuery]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q),
    );
  }, [memberQuery, members]);

  function toggleMemberStatus(id: string) {
    setMembers((current) =>
      current.map((member) =>
        member.id === id
          ? { ...member, status: member.status === "suspended" ? "active" : "suspended" }
          : member,
      ),
    );
  }

  function resolveFlag(id: string) {
    setFlags((current) => current.filter((item) => item.id !== id));
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-20 pt-10 md:px-6">
      <header className="gp-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-cinzel gp-gradient-text text-4xl">Admin Panel</h1>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="gp-btn-outline">Export CSV</button>
            <button type="button" className="gp-btn-gold">New Ad Package</button>
          </div>
        </div>
      </header>

      <section className="gp-card p-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <button type="button" className={tab === "overview" ? "gp-btn-gold" : "gp-btn-outline"} onClick={() => setTab("overview")}>Overview</button>
          <button type="button" className={tab === "transactions" ? "gp-btn-gold" : "gp-btn-outline"} onClick={() => setTab("transactions")}>Transactions</button>
          <button type="button" className={tab === "members" ? "gp-btn-gold" : "gp-btn-outline"} onClick={() => setTab("members")}>Members</button>
          <button type="button" className={tab === "campaigns" ? "gp-btn-gold" : "gp-btn-outline"} onClick={() => setTab("campaigns")}>Ad Campaigns</button>
          <button type="button" className={tab === "flags" ? "gp-btn-gold" : "gp-btn-outline"} onClick={() => setTab("flags")}>
            Security Flags
            <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white">
              {flags.length}
            </span>
          </button>
        </div>
      </section>

      {tab === "overview" && (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["Total Members", "10,421", "text-[#f5c842]"],
              ["Total Paid Out", "$1,202,115", "text-[#34d399]"],
              ["Active Ads", "48", "text-[#e5d8ff]"],
              ["Flagged Accounts", String(flags.length), "text-red-400"],
              ["Revenue this Month", "$212,983", "text-[#e5d8ff]"],
              ["Pending Withdrawals", "$18,200", "text-[#e5d8ff]"],
            ].map(([label, value, color]) => (
              <article key={label} className="gp-card p-4">
                <p className="text-xs text-[#cbb9e3]">{label}</p>
                <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
              </article>
            ))}
          </div>

          <div className="gp-card overflow-x-auto p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-cinzel text-2xl text-[#f5df9f]">Recent Transactions</h2>
              <button type="button" className="gp-btn-outline">View All</button>
            </div>
            <table className="gp-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {transactionsSeed.slice(0, 4).map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.id}</td>
                    <td>{tx.user}</td>
                    <td>{tx.type}</td>
                    <td className={tx.amount >= 0 ? "text-[#34d399]" : "text-[#f87171]"}>
                      {tx.amount >= 0 ? "+" : "-"}${Math.abs(tx.amount / 100).toFixed(2)}
                    </td>
                    <td><span className={statusBadge(tx.status)}>{tx.status}</span></td>
                    <td>{tx.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "transactions" && (
        <section className="gp-card overflow-x-auto p-4">
          <div className="mb-3">
            <input
              className="gp-input max-w-md"
              placeholder="Search by id, user, type, ip..."
              value={txQuery}
              onChange={(event) => setTxQuery(event.target.value)}
            />
          </div>
          <table className="gp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Time</th>
                <th>IP Address</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {filteredTx.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.id}</td>
                  <td>{tx.user}</td>
                  <td>{tx.type}</td>
                  <td className={tx.amount >= 0 ? "text-[#34d399]" : "text-[#f87171]"}>
                    {tx.amount >= 0 ? "+" : "-"}${Math.abs(tx.amount / 100).toFixed(2)}
                  </td>
                  <td><span className={statusBadge(tx.status)}>{tx.status}</span></td>
                  <td>{tx.time}</td>
                  <td>{tx.ip}</td>
                  <td>{tx.flagged ? "🚩" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "members" && (
        <section className="gp-card overflow-x-auto p-4">
          <div className="mb-3">
            <input
              className="gp-input max-w-md"
              placeholder="Search members..."
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
            />
          </div>
          <table className="gp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Earned</th>
                <th>Refs</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => (
                <tr key={member.id}>
                  <td>{member.id}</td>
                  <td>{member.name}</td>
                  <td>{member.email}</td>
                  <td><span className="gp-badge">{member.plan}</span></td>
                  <td className="text-[#34d399]">${(member.earned / 100).toFixed(2)}</td>
                  <td>{member.refs}</td>
                  <td>{member.joined}</td>
                  <td><span className={statusBadge(member.status)}>{member.status}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="gp-btn-outline">View</button>
                      <button type="button" className="gp-btn-outline" onClick={() => toggleMemberStatus(member.id)}>
                        {member.status === "suspended" ? "Restore" : "Suspend"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "campaigns" && (
        <section className="gp-card overflow-x-auto p-4">
          <table className="gp-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Advertiser</th>
                <th>Views</th>
                <th>Clicks</th>
                <th>Budget</th>
                <th>Spent</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaignsSeed.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.id}</td>
                  <td>{campaign.advertiser}</td>
                  <td>{campaign.views.toLocaleString()}</td>
                  <td>{campaign.clicks.toLocaleString()}</td>
                  <td>${campaign.budget.toFixed(2)}</td>
                  <td className="text-[#f5c842]">${campaign.spent.toFixed(2)}</td>
                  <td><span className={statusBadge(campaign.status)}>{campaign.status}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="gp-btn-outline">Pause</button>
                      <button type="button" className="gp-btn-outline">Approve</button>
                      <button type="button" className="gp-btn-outline">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "flags" && (
        <section className="grid gap-3">
          {flags.length === 0 && (
            <div className="gp-card p-5 text-[#d5c4ea]">No active flags. All clear.</div>
          )}
          {flags.map((flag) => (
            <article key={flag.id} className="gp-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#f2e8ff]">{flag.username}</p>
                  <p className="text-sm text-[#c9b8df]">{flag.timestamp}</p>
                </div>
                <span className={flag.risk === "High"
                  ? "rounded-full border border-red-400/50 bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300"
                  : "rounded-full border border-orange-400/50 bg-orange-500/20 px-3 py-1 text-xs font-bold text-orange-300"}>
                  {flag.risk} Risk
                </span>
              </div>
              <p className="mt-3 text-sm text-[#d0c0e7]">{flag.reason}</p>
              <div className="mt-4 flex gap-2">
                <button type="button" className="gp-btn-outline">Suspend</button>
                <button type="button" className="gp-btn-gold" onClick={() => resolveFlag(flag.id)}>Resolve</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
