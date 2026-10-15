"use client";
import { useEffect, useState } from "react";

type Status = {
  configured?: boolean;
  platformExists?: boolean;
  platformId?: string;
  programId?: string;
  admin?: string;
  adminLamports?: number;
  feeRate?: string;
  creatorFeeRate?: string;
  cluster?: string;
  error?: string;
};

export function DevnetPlatformStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/solana/launches/platform", { cache: "no-store", credentials: "include" }).then(async response => {
      const payload = await response.json() as Status;
      if (cancelled) return;
      if (!response.ok && !payload.configured) setError(payload.error || "Devnet platform status is unavailable.");
      setStatus(payload);
    }).catch(() => { if (!cancelled) setError("Devnet platform status is unavailable."); });
    return () => { cancelled = true; };
  }, []);
  const exists = status?.platformExists === true;
  return <section className="card-lux p-5 space-y-2">
    <h2 className="text-lg font-semibold text-white">Raydium LaunchLab on devnet</h2>
    <p className="text-sm text-fintech-muted" role="status">{error || (status ? "" : "Checking the devnet platform account.")}</p>
    {status?.configured ? <dl className="text-sm text-fintech-muted space-y-1">
      <div><dt className="inline">Network: </dt><dd className="inline">Devnet. Mainnet launches stay off.</dd></div>
      <div><dt className="inline">Program: </dt><dd className="inline break-all">{status.programId}</dd></div>
      <div><dt className="inline">Platform account: </dt><dd className="inline break-all">{exists ? `${status.platformId} is confirmed on-chain.` : `${status.platformId} is derived and does not exist yet.`}</dd></div>
      <div><dt className="inline">Approved fees: </dt><dd className="inline">1.20% platform and 0.30% creator. Raydium’s protocol fee adds 0.25% on buys and sells.</dd></div>
      <div><dt className="inline">Admin: </dt><dd className="inline break-all">{status.admin}{typeof status.adminLamports === "number" ? ` · ${(status.adminLamports / 1_000_000_000).toFixed(9)} SOL` : ""}</dd></div>
    </dl> : status ? <p className="text-sm text-fintech-muted">The four platform wallets are not configured on this server. No platform account is claimed.</p> : null}
    <p className="text-xs text-fintech-muted">This report does not submit a transaction or request a seed phrase.</p>
  </section>;
}
