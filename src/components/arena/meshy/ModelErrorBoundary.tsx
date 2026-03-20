"use client";

import React from "react";

type S = { failed: boolean };

/**
 * Catches GLB/network/decode errors so the canvas keeps running with a fallback mesh.
 */
export class ModelErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  S
> {
  state: S = { failed: false };

  static getDerivedStateFromError(): S {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.warn("[Meshy GLB]", err);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
