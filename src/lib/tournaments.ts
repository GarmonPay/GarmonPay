import { supabase } from "./supabaseClient";

export async function getTournaments() {
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase.from("tournaments").select("*");
  if (error) {
    console.error("getTournaments error:", error);
    return [];
  }
  return data ?? [];
}
