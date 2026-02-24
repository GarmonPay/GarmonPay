import { supabase } from "./supabaseClient";

export async function getTeams() {
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase.from("teams").select("*");
  if (error) {
    console.error("getTeams error:", error);
    return [];
  }
  return data ?? [];
}
