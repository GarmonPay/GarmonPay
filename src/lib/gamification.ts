import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function getGamificationConfig() {
  const { data, error } = await supabase
    .from("gamification_config")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }
  return data;
}
