"use client";

import React from "react";

const fallbackStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
  background: "#0a0e17",
  color: "#f9fafb",
  fontFamily: "system-ui, -apple-system, sans-serif",
  textAlign: "center",
};

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Something went wrong",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("[AppErrorBoundary]", error);
  }

  render() {
    if (this.state?.hasError) {
      const message =
        typeof this.state.message === "string"
          ? this.state.message.slice(0, 300)
          : "Something went wrong. Please try again.";
      return (
        <div style={fallbackStyle}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#9ca3af", marginBottom: "1rem" }}>{message}</p>
          <a
            href="/"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: "#2563eb",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Go home
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
