"use client";

import { AppErrorBoundary } from "@/components/AppErrorBoundary";

/**
 * Wraps the app with an error boundary so runtime errors show fallback UI
 * instead of crashing the entire screen.
 */
export function ClientErrorBoundary({ children }: { children: React.ReactNode }) {
  return <AppErrorBoundary>{children}</AppErrorBoundary>;
}
