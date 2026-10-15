"use client";

import { useCallback, useEffect, useState } from "react";
import type { buildSnapshot } from "@/lib/member-platform/dashboard";

const KEY = "garmonpay-member-staging-id";
export type MemberSnapshot = ReturnType<typeof buildSnapshot>;

async function loadSnapshot(id: string | null) {
  const headers: Record<string, string> = {};
  if (id) headers["x-member-staging-id"] = id;
  const response = await fetch("/api/member-platform/snapshot", { headers, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load your member workspace.");
  return response.json() as Promise<MemberSnapshot>;
}

export function useMember() {
  const [id, setId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MemberSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async (nextId?: string | null) => {
    const current = nextId === undefined ? localStorage.getItem(KEY) : nextId;
    const data = await loadSnapshot(current);
    setSnapshot(data);
    return data;
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    setId(stored);
    reload(stored).catch((reason: Error) => setError(reason.message)).finally(() => setReady(true));
  }, [reload]);

  async function saveId(next: string) {
    localStorage.setItem(KEY, next);
    setId(next);
    await reload(next);
  }

  return { id, snapshot, ready, error, reload: () => reload(id), saveId };
}
