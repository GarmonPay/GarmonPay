/**
 * Teams: create, join via invite, one team per user.
 * total_score = sum of all members' tournament scores (refreshed on score change).
 * Team rewards from tournament prize_pool only (profit-safe).
 */

import { createAdminClient } from "@/lib/supabase";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export type TeamMemberRole = "owner" | "member";

export interface TeamRow {
  id: string;
  name: string;
  owner_user_id: string;
  total_score: number;
  created_at: string;
}

export interface TeamMemberRow {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  joined_at: string;
}

/** Create team; caller becomes owner. Fails if user is already in a team. */
export async function createTeam(ownerUserId: string, name: string): Promise<{ success: boolean; team?: TeamRow; message?: string }> {
  const existing = await getTeamForUser(ownerUserId);
  if (existing) return { success: false, message: "You are already in a team" };
  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "Team name required" };
  const sb = supabase();
  const { data: team, error: teamErr } = await sb
    .from("teams")
    .insert({ name: trimmed, owner_user_id: ownerUserId })
    .select()
    .single();
  if (teamErr) {
    if (teamErr.code === "23505") return { success: false, message: "Team name already taken" };
    return { success: false, message: teamErr.message };
  }
  const { error: memberErr } = await sb.from("team_members").insert({
    team_id: (team as { id: string }).id,
    user_id: ownerUserId,
    role: "owner",
  });
  if (memberErr) {
    await sb.from("teams").delete().eq("id", (team as { id: string }).id);
    return { success: false, message: memberErr.message };
  }
  return {
    success: true,
    team: team as TeamRow,
  };
}

/** Get team by id. */
export async function getTeam(teamId: string): Promise<TeamRow | null> {
  const { data, error } = await supabase().from("teams").select("*").eq("id", teamId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    owner_user_id: r.owner_user_id as string,
    total_score: Number(r.total_score ?? 0),
    created_at: r.created_at as string,
  };
}

/** Get team by name. */
export async function getTeamByName(name: string): Promise<TeamRow | null> {
  const { data, error } = await supabase().from("teams").select("*").ilike("name", name.trim()).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    owner_user_id: r.owner_user_id as string,
    total_score: Number(r.total_score ?? 0),
    created_at: r.created_at as string,
  };
}

/** Get the team the user is in (if any). One team per user. */
export async function getTeamForUser(userId: string): Promise<TeamRow | null> {
  const { data: member, error } = await supabase()
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!member) return null;
  return getTeam((member as { team_id: string }).team_id);
}

/** List members of a team with emails. */
export async function getTeamMembers(teamId: string): Promise<(TeamMemberRow & { email?: string })[]> {
  const { data, error } = await supabase()
    .from("team_members")
    .select("*")
    .eq("team_id", teamId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as TeamMemberRow[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const emails = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
    (users ?? []).forEach((u: { id: string; email: string }) => emails.set(u.id, u.email));
  }
  return rows.map((r) => ({ ...r, email: emails.get(r.user_id) ?? "—" }));
}

/** Join team via invite (user must not be in any team). */
export async function joinTeam(userId: string, teamId: string): Promise<{ success: boolean; message?: string }> {
  const existing = await getTeamForUser(userId);
  if (existing) return { success: false, message: "You are already in a team" };
  const team = await getTeam(teamId);
  if (!team) return { success: false, message: "Team not found" };
  const { error } = await supabase().from("team_members").insert({
    team_id: teamId,
    user_id: userId,
    role: "member",
  });
  if (error) {
    if (error.code === "23505") return { success: false, message: "You are already in a team" };
    return { success: false, message: error.message };
  }
  return { success: true };
}

/** Leave team (or owner removes member). Owner cannot leave until they transfer or disband. */
export async function leaveTeam(userId: string): Promise<{ success: boolean; message?: string }> {
  const { data: member, error: fetchErr } = await supabase()
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!member) return { success: false, message: "Not in a team" };
  const m = member as { team_id: string; role: string };
  if (m.role === "owner") {
    const { data: count } = await supabase().from("team_members").select("id", { count: "exact", head: true }).eq("team_id", m.team_id);
    const total = (count as unknown as number) ?? 0;
    if (total > 1) return { success: false, message: "Owner must transfer ownership or remove all members first" };
    await supabase().from("team_members").delete().eq("team_id", m.team_id);
    await supabase().from("teams").delete().eq("id", m.team_id);
    return { success: true };
  }
  const { error } = await supabase().from("team_members").delete().eq("user_id", userId);
  if (error) return { success: false, message: error.message };
  await refreshTeamTotalScore(m.team_id);
  return { success: true };
}

/** Remove a member (owner only). Cannot remove self if owner. */
export async function removeMember(teamId: string, ownerUserId: string, targetUserId: string): Promise<{ success: boolean; message?: string }> {
  const team = await getTeam(teamId);
  if (!team || team.owner_user_id !== ownerUserId) return { success: false, message: "Not the team owner" };
  if (targetUserId === ownerUserId) return { success: false, message: "Use Leave team to leave" };
  const { error } = await supabase().from("team_members").delete().eq("team_id", teamId).eq("user_id", targetUserId);
  if (error) return { success: false, message: error.message };
  await refreshTeamTotalScore(teamId);
  return { success: true };
}

/** Recompute team total_score from all members' tournament_players scores and update teams row. */
export async function refreshTeamTotalScore(teamId: string): Promise<void> {
  const { data: members } = await supabase().from("team_members").select("user_id").eq("team_id", teamId);
  const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (userIds.length === 0) {
    await supabase().from("teams").update({ total_score: 0 }).eq("id", teamId);
    return;
  }
  const { data: scores } = await supabase()
    .from("tournament_players")
    .select("user_id, score")
    .in("user_id", userIds);
  let total = 0;
  (scores ?? []).forEach((r: { user_id: string; score: number }) => {
    total += Number(r.score ?? 0);
  });
  await supabase().from("teams").update({ total_score: total }).eq("id", teamId);
}

/** Called when a player's tournament score changes: refresh their team's total_score. */
export async function refreshTeamTotalScoreForUser(userId: string): Promise<void> {
  const team = await getTeamForUser(userId);
  if (team) await refreshTeamTotalScore(team.id);
}

/** Global team leaderboard: rank by total_score DESC. */
export async function getTeamLeaderboard(limit = 50): Promise<
  { rank: number; team_id: string; team_name: string; members_count: number; total_score: number }[]
> {
  const { data, error } = await supabase()
    .from("teams")
    .select("id, name, total_score")
    .order("total_score", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const teams = (data ?? []) as { id: string; name: string; total_score: number }[];
  const teamIds = teams.map((t) => t.id);
  const counts = new Map<string, number>();
  if (teamIds.length > 0) {
    const { data: agg } = await supabase().from("team_members").select("team_id").in("team_id", teamIds);
    (agg ?? []).forEach((r: { team_id: string }) => counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1));
  }
  return teams.map((t, i) => ({
    rank: i + 1,
    team_id: t.id,
    team_name: t.name,
    members_count: counts.get(t.id) ?? 0,
    total_score: Number(t.total_score ?? 0),
  }));
}

/** Per-tournament team leaderboard: sum of member scores in this tournament, ranked. */
export async function getTournamentTeamLeaderboard(tournamentId: string): Promise<
  { rank: number; team_id: string; team_name: string; members_count: number; total_score: number }[]
> {
  const { data: players, error } = await supabase()
    .from("tournament_players")
    .select("user_id, score")
    .eq("tournament_id", tournamentId);
  if (error) throw error;
  const byUser = new Map<string, number>();
  (players ?? []).forEach((p: { user_id: string; score: number }) => {
    byUser.set(p.user_id, (byUser.get(p.user_id) ?? 0) + Number(p.score ?? 0));
  });
  const userIds = Array.from(byUser.keys());
  if (userIds.length === 0) return [];
  const { data: members } = await supabase().from("team_members").select("team_id, user_id").in("user_id", userIds);
  const teamScores = new Map<string, number>();
  const teamUserCount = new Map<string, Set<string>>();
  (members ?? []).forEach((m: { team_id: string; user_id: string }) => {
    const score = byUser.get(m.user_id) ?? 0;
    teamScores.set(m.team_id, (teamScores.get(m.team_id) ?? 0) + score);
    if (!teamUserCount.has(m.team_id)) teamUserCount.set(m.team_id, new Set());
    teamUserCount.get(m.team_id)!.add(m.user_id);
  });
  const teamIds = Array.from(teamScores.keys());
  if (teamIds.length === 0) return [];
  const { data: teamRows } = await supabase().from("teams").select("id, name").in("id", teamIds);
  const names = new Map<string, string>();
  (teamRows ?? []).forEach((t: { id: string; name: string }) => names.set(t.id, t.name));
  const list = teamIds
    .map((id) => ({
      team_id: id,
      team_name: names.get(id) ?? "—",
      members_count: teamUserCount.get(id)?.size ?? 0,
      total_score: teamScores.get(id) ?? 0,
    }))
    .sort((a, b) => b.total_score - a.total_score);
  return list.map((t, i) => ({ rank: i + 1, ...t }));
}

/** Distribute prize pool share to team members (evenly or by score contribution). From prize pool only. */
export async function distributeTeamPrize(
  teamId: string,
  tournamentId: string,
  amountCents: number,
  mode: "even" | "by_contribution"
): Promise<{ success: boolean; message?: string }> {
  if (amountCents <= 0) return { success: true };
  const members = await getTeamMembers(teamId);
  if (members.length === 0) return { success: false, message: "No members" };
  const sb = supabase();
  const tournament = await sb.from("tournament_players").select("user_id, score").eq("tournament_id", tournamentId).in("user_id", members.map((m) => m.user_id));
  const scores = (tournament.data ?? []) as { user_id: string; score: number }[];
  const totalScore = scores.reduce((s, r) => s + Number(r.score ?? 0), 0);

  const payouts: { user_id: string; amountCents: number }[] = [];
  if (mode === "even") {
    const perMember = Math.floor(amountCents / members.length);
    members.forEach((m) => payouts.push({ user_id: m.user_id, amountCents: perMember }));
  } else {
    if (totalScore <= 0) {
      const perMember = Math.floor(amountCents / members.length);
      members.forEach((m) => payouts.push({ user_id: m.user_id, amountCents: perMember }));
    } else {
      scores.forEach((r) => {
        const share = totalScore > 0 ? (Number(r.score) / totalScore) * amountCents : 0;
        payouts.push({ user_id: r.user_id, amountCents: Math.floor(share) });
      });
    }
  }

  const team = await getTeam(teamId);
  const tournamentRow = await sb.from("tournaments").select("name").eq("id", tournamentId).single();
  const tournamentName = (tournamentRow.data as { name?: string } | null)?.name ?? "Tournament";

  for (const p of payouts) {
    if (p.amountCents <= 0) continue;
    const { data: row } = await sb.from("users").select("balance").eq("id", p.user_id).single();
    if (!row) continue;
    const balance = Number((row as { balance?: number }).balance ?? 0);
    await sb.from("users").update({ balance: balance + p.amountCents, updated_at: new Date().toISOString() }).eq("id", p.user_id);
    await sb.from("transactions").insert({
      user_id: p.user_id,
      type: "team_prize",
      amount: p.amountCents,
      status: "completed",
      description: `Team "${team?.name ?? ""}" — ${tournamentName}`,
    });
  }
  return { success: true };
}
