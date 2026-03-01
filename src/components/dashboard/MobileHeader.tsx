"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

interface MobileHeaderProps {
  onMenuClick?: () => void;
  balanceCents?: number | null;
}

export function MobileHeader({ onMenuClick, balanceCents }: MobileHeaderProps) {
  const [balance, setBalance] = useState<number | null>(balanceCents ?? null);

  useEffect(() => {
    if (balanceCents !== undefined && balanceCents !== null) {
      setBalance(balanceCents);
      return;
    }
    getSessionAsync().then((s) => {
      if (!s) return;
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      fetch(`${API_BASE}/dashboard`, {
        headers: isToken ? { Authorization: `Bearer ${tokenOrId}` } : {},
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && typeof d.balanceCents === "number" ? setBalance(d.balanceCents) : null))
        .catch(() => {});
    });
  }, [balanceCents]);

  return (
    <header
      className="glass-bar fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-white/[0.06] px-4 safe-area-pt shadow-soft"
      style={{
        paddingTop: "env(safe-area-inset-top, 0)",
        minHeight: "56px",
      }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        className="flex min-h-touch min-w-[48px] items-center justify-center rounded-lg text-white/90 transition-all hover:bg-white/10 hover:text-white active:scale-95"
        style={{ minHeight: "48px" }}
        aria-label="Open menu"
      >
        <span className="text-xl leading-none" aria-hidden>☰</span>
      </button>
      <Link
        href="/dashboard"
        className="text-lg font-bold tracking-tight text-white transition-opacity hover:opacity-90 active:opacity-80"
      >
        GarmonPay
      </Link>
      <Link
        href="/dashboard/finance"
        className="min-h-touch flex min-w-[60px] items-center justify-end rounded-lg px-2 py-2 text-sm font-semibold text-fintech-success transition-all hover:bg-white/10 active:scale-95"
        style={{ minHeight: "48px" }}
      >
        {balance !== null ? formatCents(balance) : "—"}
      </Link>
    </header>
  );
}
