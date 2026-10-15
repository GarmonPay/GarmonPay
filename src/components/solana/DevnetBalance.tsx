"use client";
import { useEffect, useState } from "react";

type Provider = { publicKey?: { toString(): string } | null; connect?: () => Promise<{ publicKey?: { toString(): string } }> };

function sol(lamports: number) {
  return `${(lamports / 1_000_000_000).toFixed(9)} SOL`;
}

export function DevnetBalance() {
  const [text, setText] = useState("Checking the platform admin balance on devnet.");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/solana/launches/platform", { cache: "no-store", credentials: "include" }).then(response => response.json()).then(payload => {
      if (cancelled) return;
      if (typeof payload.adminLamports === "number" && typeof payload.admin === "string") {
        setText(`Platform admin ${payload.admin} has ${sol(payload.adminLamports)} on devnet. Sign-in stays paused, and this lookup does not request a signature.`);
      } else setText("The platform admin balance is not available from this server.");
    }).catch(() => { if (!cancelled) setText("Devnet balance is unavailable."); });
    return () => { cancelled = true; };
  }, []);
  async function readConnected() {
    const provider = (window as unknown as { solana?: Provider }).solana;
    if (!provider?.connect) {
      setText("No wallet is available in this browser. Sign-in stays paused.");
      return;
    }
    try {
      const connected = await provider.connect();
      const address = connected?.publicKey?.toString() || provider.publicKey?.toString() || "";
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        setText("The wallet did not share a public address. Nothing was signed.");
        return;
      }
      const response = await fetch(`/api/solana/devnet/balance?address=${address}`, { cache: "no-store", credentials: "include" });
      const payload = await response.json();
      if (!response.ok || payload.confirmed !== true || typeof payload.lamports !== "number") {
        setText(payload.error || "Devnet balance is unavailable.");
        return;
      }
      setText(`Connected wallet ${payload.address} has ${sol(payload.lamports)} on devnet. No sign-in message was requested.`);
    } catch {
      setText("The wallet request was declined. Nothing was signed.");
    }
  }
  return <div className="mt-4">
    <p className="gp-sol-muted" role="status">{text}</p>
    <button type="button" className="gp-button mt-3" onClick={() => void readConnected()}>Read devnet balance from this browser</button>
  </div>;
}
