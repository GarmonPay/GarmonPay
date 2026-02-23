/*
 * CORE FILE — DO NOT MODIFY WITHOUT EXPLICIT INSTRUCTION.
 * CRITICAL FOR PLATFORM SECURITY.
 */

/**
 * Protected admin service. Handle ONLY: checkAdmin, checkSuperAdmin, adminControls.
 * No UI code.
 */

import { findUserById, hasAdminAccess, isSuperAdmin } from "@/lib/auth-store";
import { createAdminClient } from "@/core/supabase";
import { getOwnerFlags, updateOwnerFlags } from "@/lib/god-mode-db";

/** Check if user has admin access (admin role or super admin). */
export function checkAdmin(userId: string): boolean {
  const user = findUserById(userId);
  return !!(user && hasAdminAccess(user));
}

/** Check if user is super admin. Uses auth-store first, then Supabase users.is_super_admin. */
export async function checkSuperAdmin(userId: string): Promise<boolean> {
  const user = findUserById(userId);
  if (user && isSuperAdmin(user)) return true;
  const supabase = createAdminClient();
  if (supabase) {
    const { data } = await supabase.from("users").select("is_super_admin").eq("id", userId).maybeSingle();
    if ((data as { is_super_admin?: boolean } | null)?.is_super_admin) return true;
  }
  return false;
}

export interface OwnerFlags {
  pause_ads: boolean;
  pause_withdrawals: boolean;
  maintenance_mode: boolean;
}

/** Get owner control flags (god-mode). */
export async function getAdminControls(): Promise<OwnerFlags> {
  return getOwnerFlags();
}

/** Update owner control flags (god-mode). Only super admin should call. */
export async function setAdminControls(flags: Partial<OwnerFlags>): Promise<OwnerFlags> {
  return updateOwnerFlags(flags);
}
