"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateUsernameFormat, type UsernameAvailabilityState } from "@/lib/username-validation";

type Opts = {
  excludeUserId?: string | null;
  debounceMs?: number;
};

export function useUsernameAvailability(
  supabase: SupabaseClient | null,
  username: string,
  opts?: Opts
): { state: UsernameAvailabilityState; message: string } {
  const excludeUserId = opts?.excludeUserId ?? null;
  const debounceMs = opts?.debounceMs ?? 400;
  const [state, setState] = useState<UsernameAvailabilityState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      setState("idle");
      setMessage("");
      return;
    }
    const candidate = username.trim();
    if (!candidate) {
      setState("idle");
      setMessage("");
      return;
    }

    const format = validateUsernameFormat(candidate);
    if (!format.ok) {
      setState(format.state ?? "invalid");
      setMessage(format.reason ?? "Invalid username");
      return;
    }

    setState("checking");
    setMessage("Checking...");

    const timeout = window.setTimeout(async () => {
      const args: { candidate: string; p_exclude_user_id?: string } = { candidate };
      if (excludeUserId) args.p_exclude_user_id = excludeUserId;

      const { data, error: rpcError } = await supabase.rpc("check_username_available", args);
      if (rpcError) {
        setState("taken");
        setMessage("Already taken");
        return;
      }
      if (data === true) {
        setState("available");
        setMessage("Available");
      } else {
        setState("taken");
        setMessage("Already taken");
      }
    }, debounceMs);

    return () => window.clearTimeout(timeout);
  }, [username, supabase, excludeUserId, debounceMs]);

  return { state, message };
}
