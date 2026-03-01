/**
 * API client for backend. All reward issuance happens on backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  return api<{ user: { id: string; email: string }; expiresAt: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(data: {
  email: string;
  password: string;
  referralCode?: string;
}) {
  return api<{ user: { id: string; email: string }; expiresAt: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function logout() {
  return api("/auth/logout", { method: "POST" });
}

function authHeaders(accessTokenOrUserId: string, isToken: boolean): Record<string, string> {
  return isToken
    ? { Authorization: `Bearer ${accessTokenOrUserId}` }
    : { "X-User-Id": accessTokenOrUserId };
}

export async function getAds(accessTokenOrUserId: string, isToken = false) {
  return api<{ ads: Array<{
    id: string;
    title: string;
    adType: string;
    rewardCents: number;
    requiredSeconds: number;
    videoUrl?: string;
    imageUrl?: string;
    textContent?: string;
    targetUrl?: string;
  }> }>("/ads", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function startAdSession(accessTokenOrUserId: string, isToken: boolean, adId: string) {
  return api<{ sessionId: string; adId: string; requiredSeconds: number; expiresAt: string }>(
    "/ads/session/start",
    {
      method: "POST",
      headers: authHeaders(accessTokenOrUserId, isToken),
      body: JSON.stringify({ adId }),
    }
  );
}

export async function completeAdSession(accessTokenOrUserId: string, isToken: boolean, sessionId: string) {
  return api<{ success: boolean; rewardCents: number; message: string }>(
    "/ads/session/complete",
    {
      method: "POST",
      headers: authHeaders(accessTokenOrUserId, isToken),
      body: JSON.stringify({ sessionId }),
    }
  );
}

export async function getWithdrawals(accessTokenOrUserId: string, isToken: boolean) {
  return api<{
    withdrawals: Array<{ id: string; amount: number; status: string; method: string; wallet_address: string; created_at: string }>;
    minWithdrawalCents: number;
  }>("/withdrawals", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function submitWithdrawalRequest(
  accessTokenOrUserId: string,
  isToken: boolean,
  data: { amount: number; method: string; wallet_address: string }
) {
  return api<{ withdrawal: { id: string; amount: number; status: string; method: string; wallet_address: string; created_at: string }; message: string }>(
    "/wallet/withdraw",
    {
      method: "POST",
      headers: authHeaders(accessTokenOrUserId, isToken),
      body: JSON.stringify(data),
    }
  );
}

export async function getDashboard(accessTokenOrUserId: string, isToken = false) {
  return api<{
    earningsTodayCents: number;
    earningsWeekCents: number;
    earningsMonthCents: number;
    balanceCents: number;
    adCreditBalanceCents: number;
    withdrawableCents: number;
    totalEarningsCents: number;
    totalWithdrawnCents: number;
    membershipTier: string;
    referralCode: string;
    referralEarningsCents: number;
    totalReferrals: number;
    activeReferralSubscriptions?: number;
    monthlyReferralCommissionCents?: number;
    lifetimeReferralCommissionCents?: number;
    announcements: { id: string; title: string; body: string; publishedAt: string }[];
    availableAds: { id: string; title: string; rewardCents: number }[];
  }>("/dashboard", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getReferralCommissions(accessTokenOrUserId: string, isToken: boolean) {
  return api<{
    commissions: Array<{
      referredUserId: string;
      subscriptionId: string;
      membershipTier: string;
      commissionAmountCents: number;
      lastPaidDate: string | null;
    }>;
  }>("/referral-commissions", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getBanners(accessTokenOrUserId: string, isToken: boolean) {
  return api<{
    banners: Array<{
      id: string;
      title: string;
      image_url: string;
      target_url: string;
      type: string;
      status: string;
      impressions: number;
      clicks: number;
      created_at: string;
    }>;
  }>("/banners", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getReferralDashboard(accessTokenOrUserId: string, isToken: boolean) {
  return api<{
    summary: {
      totalReferrals: number;
      activeReferrals: number;
      monthlyReferralIncomeCents: number;
      lifetimeReferralEarningsCents: number;
      referralCode: string;
    };
    referralLink: string;
    referredUsers: Array<{
      referredUserId: string;
      email: string;
      membership: string;
      status: string;
      monthlyCommissionCents: number;
      totalEarnedCents: number;
    }>;
    earningsHistory: Array<{
      id: string;
      type: string;
      amountCents: number;
      status: string;
      description: string;
      createdAt: string;
    }>;
  }>("/referrals/dashboard", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getTransactions(accessTokenOrUserId: string, isToken: boolean) {
  return api<{
    transactions: Array<{ id: string; type: string; amount: number; status: string; description: string | null; created_at: string }>;
    totalEarningsCents: number;
    totalWithdrawnCents: number;
    totalAdCreditConvertedCents: number;
  }>("/transactions", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function convertToAdCredit(accessTokenOrUserId: string, isToken: boolean, amountCents: number) {
  return api<{ success: boolean; amountCents: number; message: string }>(
    "/convert-to-ad-credit",
    {
      method: "POST",
      headers: authHeaders(accessTokenOrUserId, isToken),
      body: JSON.stringify({ amount: amountCents }),
    }
  );
}

export async function getLeaderboard(accessTokenOrUserId: string, isToken: boolean) {
  return api<{
    topReferrers: Array<{ userId: string; email: string; totalReferrals: number; totalEarningsCents: number }>;
    topEarners: Array<{ userId: string; email: string; totalEarningsCents: number }>;
  }>("/leaderboard", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getGrowth(accessTokenOrUserId: string, isToken: boolean) {
  return api<{
    totalReferrals: number;
    referralEarningsCents: number;
    leaderboardRank: number | null;
    badges: Array<{ badgeId: string; code: string; name: string; description: string; icon: string; earnedAt: string }>;
    canClaimDaily: boolean;
  }>("/growth", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function claimDailyReward(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ success: boolean; amountCents: number; message: string }>("/daily-reward", {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
  });
}

export async function getActivities(accessTokenOrUserId: string, isToken: boolean) {
  return api<{
    activities: Array<{ id: string; email: string; activityType: string; description: string; amountCents: number | null; createdAt: string }>;
  }>("/activities", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function ensureReferralBonus(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ granted: boolean; message?: string }>("/referral-bonus/ensure", {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
  });
}

/** Attach referrer to current user by referral code (backend validates, prevents self-referral). */
export async function attachReferral(accessToken: string, referralCode: string) {
  return api<{ ok: boolean }>("/referrals/attach", {
    method: "POST",
    headers: { ...authHeaders(accessToken, true), "Content-Type": "application/json" },
    body: JSON.stringify({ referralCode: referralCode.trim().toUpperCase() }),
  });
}

/** Attach referrer by referrer user ID (e.g. when ref=userId in URL). */
export async function attachReferralByReferrerId(accessToken: string, referrerId: string) {
  return api<{ ok: boolean }>("/referrals/attach", {
    method: "POST",
    headers: { ...authHeaders(accessToken, true), "Content-Type": "application/json" },
    body: JSON.stringify({ referrerId: referrerId.trim() }),
  });
}

/** Attach referrer by referrer user ID (supports token or userId auth). */
export async function attachReferralByReferrerIdSession(
  accessTokenOrUserId: string,
  isToken: boolean,
  referrerId: string
) {
  return api<{ ok: boolean }>("/referrals/attach", {
    method: "POST",
    headers: { ...authHeaders(accessTokenOrUserId, isToken), "Content-Type": "application/json" },
    body: JSON.stringify({ referrerId: referrerId.trim() }),
  });
}

// Gamification
export async function getGamificationSummary(accessTokenOrUserId: string, isToken: boolean) {
  return api<{
    spinWheel: { enabled: boolean; dailyLimit: number; usedToday: number } | null;
    mysteryBox: { enabled: boolean } | null;
    streak: { lastLoginDate: string | null; currentStreakDays: number };
    missions: Array<{ code: string; name: string; rewardCents: number; dailyLimit: number; completedToday: number }>;
    rank: { code: string; name: string; earningsMultiplier: number } | null;
    ranks: Array<{ code: string; name: string }>;
  }>("/gamification/summary", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function spinWheel(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ success: boolean; rewardType: string; amountCents: number }>("/gamification/spin", {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
  });
}

export async function openMysteryBox(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ success: boolean; rewardType: string; amountCents: number }>("/gamification/mystery-box", {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
  });
}

export async function claimStreak(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ success: boolean; streakDays: number; rewardCents: number; message?: string }>("/gamification/streak", {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
  });
}

export async function completeMission(accessTokenOrUserId: string, isToken: boolean, missionCode: string) {
  return api<{ success: boolean; rewardCents: number }>("/gamification/missions/complete", {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
    body: JSON.stringify({ missionCode }),
  });
}

// Profit-protected games (reward_budget)
export async function getGamesBudget(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ daily_limit: number; daily_used: number; remaining: number; noRewardsRemaining: boolean }>("/games/budget", {
    headers: authHeaders(accessTokenOrUserId, isToken),
  });
}

export async function gamesSpin(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ success: boolean; amountCents: number }>("/games/spin", { method: "POST", headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function gamesScratch(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ success: boolean; amountCents: number }>("/games/scratch", { method: "POST", headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function gamesDailyBonus(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ success: boolean; amountCents: number }>("/games/daily-bonus", { method: "POST", headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function gamesMysteryBox(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ success: boolean; amountCents: number }>("/games/mystery-box", { method: "POST", headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getTournaments(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ tournaments: Array<{ id: string; name: string; entry_fee: number; prize_pool: number; start_date: string; end_date: string; status: string }> }>("/tournaments", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function joinTournamentApi(accessTokenOrUserId: string, isToken: boolean, tournamentId: string) {
  return api<{ success: boolean }>("/tournaments/join", { method: "POST", headers: authHeaders(accessTokenOrUserId, isToken), body: JSON.stringify({ tournamentId }) });
}

export async function getTournamentLeaderboard(accessTokenOrUserId: string, isToken: boolean, tournamentId: string) {
  return api<{ leaderboard: Array<{ rank: number; user_id: string; email: string; score: number; prizePosition: number | null }> }>(`/tournaments/${tournamentId}/leaderboard`, { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getTournamentJoined(accessTokenOrUserId: string, isToken: boolean, tournamentId: string) {
  return api<{ joined: boolean }>(`/tournaments/${tournamentId}/joined`, { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getMyTeam(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ team: { id: string; name: string; owner_user_id: string; total_score: number } | null }>("/teams", { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function createTeamApi(accessTokenOrUserId: string, isToken: boolean, name: string) {
  return api<{ team: { id: string; name: string; owner_user_id: string; total_score: number } }>("/teams", { method: "POST", headers: authHeaders(accessTokenOrUserId, isToken), body: JSON.stringify({ name }) });
}

export async function joinTeamApi(accessTokenOrUserId: string, isToken: boolean, teamId: string) {
  return api<{ success: boolean }>("/teams/join", { method: "POST", headers: authHeaders(accessTokenOrUserId, isToken), body: JSON.stringify({ teamId }) });
}

export async function leaveTeamApi(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ success: boolean }>("/teams/leave", { method: "POST", headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getTeamLeaderboardApi() {
  return api<{ leaderboard: Array<{ rank: number; team_id: string; team_name: string; members_count: number; total_score: number }> }>("/teams/leaderboard");
}

export async function getTeamByIdApi(teamId: string) {
  return api<{ team: { id: string; name: string } }>(`/teams/${teamId}`);
}

export async function getTeamMembersApi(accessTokenOrUserId: string, isToken: boolean, teamId: string) {
  return api<{ members: Array<{ id: string; user_id: string; role: string; email?: string }> }>(`/teams/${teamId}/members`, { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getTournamentTeamLeaderboardApi(tournamentId: string) {
  return api<{ leaderboard: Array<{ rank: number; team_id: string; team_name: string; members_count: number; total_score: number }> }>(`/tournaments/${tournamentId}/team-leaderboard`);
}

// Fight Arena
export type FightStatus = "open" | "active" | "completed" | "cancelled";
export interface FightArenaFight {
  id: string;
  host_user_id: string;
  opponent_user_id: string | null;
  entry_fee: number;
  platform_fee: number;
  total_pot: number;
  status: FightStatus;
  winner_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getFightArenaFights(accessTokenOrUserId: string, isToken: boolean, status?: FightStatus) {
  const q = status ? `?status=${status}` : "";
  return api<{ fights: FightArenaFight[] }>(`/fight-arena/fights${q}`, { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function getFightArenaFight(accessTokenOrUserId: string, isToken: boolean, fightId: string) {
  return api<{ fight: FightArenaFight }>(`/fight-arena/fights/${fightId}`, { headers: authHeaders(accessTokenOrUserId, isToken) });
}

export async function createFightArenaFight(accessTokenOrUserId: string, isToken: boolean, entryFeeCents: number) {
  return api<{ fight: FightArenaFight }>("/fight-arena/fights", {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
    body: JSON.stringify({ entryFeeCents }),
  });
}

export async function joinFightArenaFight(accessTokenOrUserId: string, isToken: boolean, fightId: string) {
  return api<{ fight: FightArenaFight }>(`/fight-arena/fights/${fightId}/join`, {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
  });
}

export async function endFightArenaFight(accessTokenOrUserId: string, isToken: boolean, fightId: string, winnerUserId: string) {
  return api<{ fight: FightArenaFight }>(`/fight-arena/fights/${fightId}/end`, {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
    body: JSON.stringify({ winnerUserId }),
  });
}

// Boxing Arena
export interface BoxingMatch {
  id: string;
  player1_id: string;
  player2_id: string | null;
  entry_fee: number;
  winner_id: string | null;
  status: string;
  created_at: string;
}

export async function boxingEnter(accessTokenOrUserId: string, isToken: boolean, entryFeeCents?: number) {
  return api<{ match: BoxingMatch; outcome: "created" | "joined" | "completed" }>("/boxing/enter", {
    method: "POST",
    headers: authHeaders(accessTokenOrUserId, isToken),
    body: JSON.stringify({ entryFeeCents: entryFeeCents ?? 100 }),
  });
}

export async function getBoxingMatches(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ matches: BoxingMatch[] }>("/boxing/matches", {
    headers: authHeaders(accessTokenOrUserId, isToken),
  });
}

export async function getBoxingStats(accessTokenOrUserId: string, isToken: boolean) {
  return api<{ wins: number; losses: number; earningsCents: number }>("/boxing/stats", {
    headers: authHeaders(accessTokenOrUserId, isToken),
  });
}
