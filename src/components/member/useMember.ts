"use client";

import { useCallback, useEffect, useState } from "react";
import type { loadMemberSnapshot } from "@/lib/member-platform/wallet-account";

export type MemberSnapshot = Awaited<ReturnType<typeof loadMemberSnapshot>>;

async function loadSnapshot() {
  const response = await fetch("/api/member-platform/snapshot", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Unable to load your member workspace.");
  return body as MemberSnapshot;
}

export function useMember() {
  const [snapshot, setSnapshot] = useState<MemberSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const data = await loadSnapshot();
    setSnapshot(data);
    return data;
  }, []);

  useEffect(() => {
    reload().catch((reason: Error) => setError(reason.message)).finally(() => setReady(true));
  }, [reload]);

  return { id: snapshot?.actorId ?? null, snapshot, ready, error, reload };
}
