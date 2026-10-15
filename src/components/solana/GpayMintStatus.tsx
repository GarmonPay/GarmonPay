"use client";
import { useEffect, useState } from "react";

type VanityStatus = {
  status: "idle" | "paused" | "searching" | "ready" | "cancelled" | "failed";
  attempts?: number;
  elapsedMs?: number;
  publicKey?: string | null;
  launchEnabled?: false;
  reason?: string;
  error?: string;
};

export function GpayMintStatus() {
  const [status, setStatus] = useState<VanityStatus | null>(null);
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const response = await fetch("/api/solana/launches/vanity", { credentials: "include" });
    setStatus(await response.json());
  }
  async function start() {
    setBusy(true);
    try {
      const response = await fetch("/api/solana/launches/vanity", { method: "POST", credentials: "include" });
      const payload = await response.json();
      setStatus(response.ok ? payload : { status: "failed", reason: payload.error || "Mint search is unavailable." });
    } catch {
      setStatus({ status: "failed", reason: "Mint search is unavailable. Nothing was launched." });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (status?.status !== "searching") return undefined;
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    return () => window.clearInterval(timer);
  }, [status?.status]);
  const searching = status?.status === "searching" || busy;
  return <section className="gp-sol-readiness" aria-labelledby="gpay-mint-status">
    <h3 id="gpay-mint-status">Mint address</h3>
    <p className="gp-sol-muted" role="status">{status?.reason || "A GarmonPay mint must end in lowercase gpay. The search usually takes several minutes, and its secret is never sent to this page."}</p>
    {status?.status === "searching" ? <p className="gp-sol-muted">Checked {status.attempts ?? 0} addresses in {Math.round((status.elapsedMs ?? 0) / 1000)} seconds.</p> : null}
    {status?.publicKey ? <p><code className="break-all text-xs">{status.publicKey}</code></p> : null}
    <div className="gp-sol-inline-actions">
      <button type="button" className="gp-button" disabled={searching} onClick={() => void start()}>{searching ? "Searching…" : status?.status === "failed" || status?.status === "cancelled" ? "Retry mint search" : "Search for a gpay mint"}</button>
      {status?.status === "searching" ? <button type="button" className="gp-button" onClick={() => void fetch("/api/solana/launches/vanity?action=cancel", { method: "POST", credentials: "include" }).then(response => response.json()).then(setStatus)}>Cancel search</button> : null}
    </div>
  </section>;
}
