"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { loadMemberSnapshot } from "@/lib/member-platform/wallet-account";

export type MemberSnapshot = Awaited<ReturnType<typeof loadMemberSnapshot>>;

async function loadSnapshot(signal: AbortSignal) {
  const response = await fetch("/api/member-platform/snapshot", { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Unable to load your member workspace.");
  return body as MemberSnapshot;
}

export function useMember() {
  const [snapshot, setSnapshot] = useState<MemberSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const data = await loadSnapshot(controller.signal);
      if (request === generation.current) { setSnapshot(data); setError(""); setReady(true); }
      return data;
    } catch (reason) {
      if (request === generation.current) {
        setSnapshot(null);
        setError(controller.signal.aborted ? "The member workspace timed out. Reconnect your wallet or refresh to retry." : reason instanceof Error ? reason.message : "Unable to load your member workspace.");
        setReady(true);
      }
      throw reason;
    } finally { clearTimeout(timeout); }
  }, []);

  useEffect(() => {
    const refresh = () => {
      // Clear private data immediately before requesting the new session.
      setSnapshot(null); setReady(false); setError("");
      void reload().catch(() => {});
    };
    refresh();
    window.addEventListener("garmonpay-session-change", refresh);
    const timer = window.setInterval(() => { void reload().catch(() => {}); }, 60000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("garmonpay-session-change", refresh);
      ++generation.current; active.current?.abort();
    };
  }, [reload]);

  return { id: snapshot?.actorId ?? null, snapshot, ready, error, reload };
}
