"use client";

/**
 * Optional: subscribe to Supabase auth state if needed for app-wide side effects.
 * Admin session is no longer stored in localStorage; it is derived from Supabase Auth + public.users.
 */
export function AuthStateProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
