"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";

const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession {
  const s = useContext(AdminSessionContext);
  if (!s) {
    throw new Error("useAdminSession must be used within AdminPageGate");
  }
  return s;
}

/**
 * Provides resolved admin session to children. Use `useAdminSession()` in page content.
 */
export function AdminPageGate({
  children,
  loadingMessage = "Loading admin session…",
}: {
  children: ReactNode;
  loadingMessage?: string;
}) {
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  if (!session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-white/70">
        {loadingMessage}
      </div>
    );
  }

  return (
    <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>
  );
}
