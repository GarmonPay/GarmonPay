"use client";

import React, { Suspense } from "react";
import { ArenaLocalEnvironment } from "@/components/arena/ArenaLocalEnvironment";

/**
 * IBL can fail on some GPUs / HDR decode paths; never take down the whole Canvas.
 */
class EnvironmentErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[ArenaOptionalEnvironment] Skipping IBL:", error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function ArenaOptionalEnvironment({ environmentIntensity = 0.75 }: { environmentIntensity?: number }) {
  return (
    <EnvironmentErrorBoundary>
      <Suspense fallback={null}>
        <ArenaLocalEnvironment environmentIntensity={environmentIntensity} />
      </Suspense>
    </EnvironmentErrorBoundary>
  );
}
