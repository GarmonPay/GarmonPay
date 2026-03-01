import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export async function getGamificationConfig() {
  if (!supabase) return null;
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
