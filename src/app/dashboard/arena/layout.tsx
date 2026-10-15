"use client";

import { ArenaErrorBoundary } from "@/components/arena/ArenaErrorBoundary";

export default function ArenaSectionLayout({ children }: { children: React.ReactNode }) {
  // The unavailable arena does not need to initialize a 3D renderer or load HDR assets.
  return <ArenaErrorBoundary>{children}</ArenaErrorBoundary>;
}
