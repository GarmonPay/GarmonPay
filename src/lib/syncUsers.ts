/**
 * Sync auth.users into public.users. Uses service role (server-side only).
 * Call from API route or server action; do not call from the browser.
 */

import { createAdminClient } from "@/lib/supabase";

export async function syncUsers(): Promise<{ synced: number; error?: string }> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { synced: 0, error: "Service not configured" };
  }

  const allUsers: { id: string; email: string }[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { synced: 0, error: error.message };
    }
    const users = data?.users ?? [];
    allUsers.push(
      ...users.map((u) => ({ id: u.id, email: typeof u.email === "string" ? u.email : "" }))
    );
    if (users.length < perPage) break;
    page += 1;
  }

  for (const u of allUsers) {
    const { data: existing } = await supabase.from("users").select("id").eq("id", u.id).maybeSingle();
    if (existing) {
      await supabase.from("users").update({ email: u.email }).eq("id", u.id);
    } else {
      await supabase.from("users").insert({
        id: u.id,
        email: u.email,
        role: "user",
        balance: 0,
      });
    }
  }

  return { synced: allUsers.length };
}
