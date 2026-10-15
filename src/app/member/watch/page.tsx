"use client";

import { useEffect, useState } from "react";
import { finishVerifiedView, openVerifiedView, pulseVerifiedView } from "@/app/member/actions";
import { useMember } from "@/components/member/useMember";

export default function WatchPage() {
  const { id, snapshot, ready, reload } = useMember();
  const [watchId, setWatchId] = useState<string | null>(null);
  const [required, setRequired] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!watchId || !id) return;
    const timer = window.setInterval(() => { void pulseVerifiedView({ memberId: id, watchId }); }, 4000);
    return () => window.clearInterval(timer);
  }, [watchId, id]);

  async function start(campaignId: string) {
    if (!id) return;
    setError("");
    const result = await openVerifiedView({ memberId: id, campaignId });
    if (!result.ok) { setError(result.error); return; }
    setWatchId(result.watchId);
    setRequired(result.requiredSeconds);
    setMessage(`View open. Keep this page open for ${result.requiredSeconds} seconds. The server records the time.`);
  }

  async function finish() {
    if (!id || !watchId) return;
    const result = await finishVerifiedView({ memberId: id, watchId, webdriver: navigator.webdriver === true });
    if (!result.ok) { setError(result.error); return; }
    setWatchId(null);
    setMessage(result.status === "verified" ? "View server-verified. The reward is not funded and was not paid." : result.reason ?? "The view was not verified.");
    await reload();
  }

  if (!ready || !snapshot) return <p className="text-violet-200">Loading Watch & Earn…</p>;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-amber-300">Watch & Earn</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">A view counts only after the server has seen it stay open for the package time, with a heartbeat, once per member and campaign. Automated browsers are rejected. Rewards are not paid.</p>
      </header>
      {snapshot.watchable.length === 0 ? <p className="rounded-2xl border border-white/10 bg-[#150d24] p-4 text-sm text-violet-200">No other member’s campaign is available. You cannot verify a view on your own draft.</p> : (
        <ul className="space-y-3">
          {snapshot.watchable.map((item) => (
            <li key={item.id} className="rounded-2xl border border-white/10 bg-[#150d24] p-4">
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-violet-200">{item.verified} of {item.views} views verified · {item.tier}</p>
              <button type="button" className="mt-3 rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black" onClick={() => void start(item.id)}>Start verified view</button>
            </li>
          ))}
        </ul>
      )}
      {watchId && <button type="button" className="rounded-xl border border-amber-300/40 px-4 py-3 text-amber-200" onClick={() => void finish()}>Submit view after {required} seconds</button>}
      {message && <p className="text-sm text-violet-100">{message}</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
