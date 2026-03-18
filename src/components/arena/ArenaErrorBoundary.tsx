"use client";

import React from "react";
import Link from "next/link";

type State = { hasError: boolean; message: string };

export class ArenaErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Arena error",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("[ArenaErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "50vh",
            flexDirection: "column",
            gap: 16,
            background: "#0d1117",
            padding: 24,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ fontSize: 64 }}>🥊</div>
          <p style={{ color: "#f87171", textAlign: "center", maxWidth: 360 }}>
            {this.state.message.slice(0, 200) || "Something went wrong in the Arena."}
          </p>
          <Link
            href="/dashboard/arena"
            style={{ color: "#f0a500", fontWeight: 600 }}
          >
            Back to Arena
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}
