"use client";

import { useEffect } from "react";
import { ArenaErrorBoundary } from "@/components/arena/ArenaErrorBoundary";
import { preloadArenaHdri } from "@/components/arena/ArenaLocalEnvironment";

export default function ArenaSectionLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    preloadArenaHdri();
  }, []);

  return <ArenaErrorBoundary>{children}</ArenaErrorBoundary>;
}
