/**
 * Sync all auth.users into public.users.
 * Run: npx tsx --env-file=.env.local src/scripts/sync-all-users.ts
 * Or: npm run sync-users
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function syncUsers() {
  const allUsers: { id: string; email?: string }[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("listUsers error:", error);
      process.exit(1);
    }
    const users = data?.users ?? [];
    allUsers.push(...users.map((u) => ({ id: u.id, email: u.email ?? undefined })));
    if (users.length < perPage) break;
    page += 1;
  }

  for (const user of allUsers) {
    await supabase.from("users").upsert({
      id: user.id,
      email: user.email ?? "",
      balance: 0,
      role: "user",
    });
  }

  console.log("All users synced.");
}

syncUsers().catch((e) => {
  console.error(e);
  process.exit(1);
});
