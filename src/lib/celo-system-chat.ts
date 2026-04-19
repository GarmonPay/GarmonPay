import type { SupabaseClient } from "@supabase/supabase-js";

const PREFIX = {
  gold: "__SYS_GOLD__",
  red: "__SYS_RED__",
  green: "__SYS_GREEN__",
} as const;

export type CeloSystemChatVariant = keyof typeof PREFIX;

export function parseCeloSystemChatMessage(message: string): {
  variant: CeloSystemChatVariant | null;
  text: string;
} {
  for (const v of Object.keys(PREFIX) as CeloSystemChatVariant[]) {
    const p = PREFIX[v];
    if (message.startsWith(p)) return { variant: v, text: message.slice(p.length) };
  }
  return { variant: null, text: message };
}

/** Inserts a styled table line (admin client; uses banker as FK for user_id). */
export async function insertCeloSystemChat(
  supabase: SupabaseClient,
  roomId: string,
  anchorUserId: string,
  variant: CeloSystemChatVariant,
  text: string
): Promise<void> {
  const { error } = await supabase.from("celo_chat").insert({
    room_id: roomId,
    user_id: anchorUserId,
    message: `${PREFIX[variant]}${text}`,
  });
  if (error) console.warn("[celo-system-chat] insert failed", error.message);
}

export async function celoDisplayName(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase.from("users").select("full_name, email").eq("id", userId).maybeSingle();
  const u = data as { full_name?: string | null; email?: string | null } | null;
  return u?.full_name?.trim() || u?.email?.split("@")[0] || "Player";
}
