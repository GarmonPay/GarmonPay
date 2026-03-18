"use client";

import { ArenaErrorBoundary } from "@/components/arena/ArenaErrorBoundary";

export default function ArenaSectionLayout({ children }: { children: React.ReactNode }) {
  return <ArenaErrorBoundary>{children}</ArenaErrorBoundary>;
}
