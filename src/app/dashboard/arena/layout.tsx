"use client";

import { useEffect } from "react";
import { ArenaErrorBoundary } from "@/components/arena/ArenaErrorBoundary";
import { ARENA_HDRI_FILE, ARENA_HDRI_PATH } from "@/lib/arena-hdri";

export default function ArenaSectionLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    void import("@react-three/drei").then((drei) => {
      if (cancelled) return;
      drei.useEnvironment.preload({ files: ARENA_HDRI_FILE, path: ARENA_HDRI_PATH });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <ArenaErrorBoundary>{children}</ArenaErrorBoundary>;
}
