/**
 * GarmonPay Arena — real-time fight server.
 * Socket.io: join_fight (with joinToken), action (JAB, RIGHT_HAND, etc.).
 * Server resolves every exchange; 1.5s auto-jab if no tap; CPU style-based tendencies.
 */

const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const PORT = process.env.ARENA_PORT || 3001;
const CORS_ORIGIN =
  process.env.CORS_ORIGIN ||
  (process.env.NODE_ENV === "production" ? "https://garmonpay.com" : "*");
const ARENA_JOIN_SECRET = process.env.ARENA_JOIN_SECRET || "arena-join-secret-change-in-production";

const CPU_USER_IDS = [
  "a0000000-0000-0000-0000-000000000001",
  "a0000000-0000-0000-0000-000000000002",
  "a0000000-0000-0000-0000-000000000003",
  "a0000000-0000-0000-0000-000000000004",
  "a0000000-0000-0000-0000-000000000005",
  "a0000000-0000-0000-0000-000000000006",
];

const ARENA_ACTIONS = ["JAB", "RIGHT_HAND", "HOOK", "BODY_SHOT", "DODGE_LEFT", "DODGE_RIGHT", "BLOCK", "SPECIAL"];
const PUNCH_ACTIONS = ["JAB", "RIGHT_HAND", "HOOK", "BODY_SHOT", "SPECIAL"];
const ACTION_BASE_POWER = { JAB: 8, RIGHT_HAND: 14, HOOK: 18, BODY_SHOT: 12, SPECIAL: 22 };
const STYLE_TENDENCIES = {
  Brawler: { HOOK: 3, RIGHT_HAND: 2.5, BODY_SHOT: 1.5, JAB: 1, BLOCK: 0.8 },
  Boxer: { JAB: 3, RIGHT_HAND: 2, DODGE_LEFT: 1.2, DODGE_RIGHT: 1.2, BLOCK: 1 },
  Slugger: { RIGHT_HAND: 2.5, HOOK: 2.5, SPECIAL: 1.5, BODY_SHOT: 1.2 },
  "Counter Puncher": { BLOCK: 2, DODGE_LEFT: 1.5, DODGE_RIGHT: 1.5, JAB: 1.5, RIGHT_HAND: 1.2 },
  Swarmer: { JAB: 2.5, BODY_SHOT: 2, HOOK: 1.5, DODGE_LEFT: 1, DODGE_RIGHT: 1 },
  Technician: { JAB: 2, RIGHT_HAND: 1.5, BLOCK: 1.5, DODGE_LEFT: 1.2, DODGE_RIGHT: 1.2, SPECIAL: 1 },
};

function verifyJoinToken(token) {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const payload = JSON.parse(raw);
    if (!payload.fightId || !payload.userId || !payload.fighterAId || !payload.exp || !payload.sig) return null;
    if (Date.now() > payload.exp) return null;
    const str = JSON.stringify({ fightId: payload.fightId, userId: payload.userId, fighterAId: payload.fighterAId, exp: payload.exp });
    const sig = crypto.createHmac("sha256", ARENA_JOIN_SECRET).update(str).digest("hex");
    if (sig !== payload.sig) return null;
    return payload;
  } catch {
    return null;
  }
}

/** difficulty 1–10: higher = slightly more aggressive / heavier punches */
function pickCpuAction(style, difficulty = 5) {
  const weights = STYLE_TENDENCIES[style] || {};
  const diffBoost = 0.85 + (Math.min(10, Math.max(1, difficulty)) - 1) * (1.25 / 9);
  const entries = ARENA_ACTIONS.filter((a) => PUNCH_ACTIONS.includes(a) || a === "BLOCK" || a === "DODGE_LEFT" || a === "DODGE_RIGHT").map(
    (action) => {
      let w = weights[action] ?? 1;
      if (PUNCH_ACTIONS.includes(action)) w *= diffBoost;
      return [action, w];
    }
  );
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = Math.random() * total;
  for (const [action, w] of entries) {
    r -= w;
    if (r <= 0) return action;
  }
  return "JAB";
}

function computeDamage(attack, defend, attacker, defender) {
  if (!PUNCH_ACTIONS.includes(attack)) return 0;
  const base = ACTION_BASE_POWER[attack] ?? 10;
  const statScale = (attacker.strength * 0.4 + attacker.speed * 0.2 + (attacker.special || 20) * 0.15) / 50;
  let damage = base * (0.8 + statScale * 0.4);
  if (defend === "BLOCK") damage *= 0.5;
  if (defend === "DODGE_LEFT" || defend === "DODGE_RIGHT") {
    const dodgeChance = 0.2 + ((defender.speed || 50) / 99) * 0.3;
    if (Math.random() < dodgeChance) damage = 0;
    else damage *= 0.7;
  }
  damage *= 1 - ((defender.defense || 50) / 99) * 0.25;
  damage *= 1 - ((defender.chin || 50) / 99) * 0.15;
  return Math.round(Math.max(0, damage));
}

function applyGearBonuses(fighter, bonusesByItemId) {
  const f = { ...fighter };
  const stats = ["strength", "speed", "stamina", "defense", "chin", "special"];
  for (const itemId of [f.equipped_gloves, f.equipped_shoes, f.equipped_shorts, f.equipped_headgear]) {
    if (!itemId) continue;
    const bonuses = bonusesByItemId[itemId];
    if (!bonuses || typeof bonuses !== "object") continue;
    for (const stat of stats) {
      const add = bonuses[stat];
      if (typeof add === "number") f[stat] = (f[stat] ?? 0) + add;
    }
  }
  return f;
}

async function loadFight(supabase, fightId) {
  const { data: fight, error: fightErr } = await supabase
    .from("arena_fights")
    .select("id, fighter_a_id, fighter_b_id, cpu_fighter_id, fight_type")
    .eq("id", fightId)
    .single();
  const fightType = fight?.fight_type || "cpu";
  if (fightErr || !fight) return null;

  const { data: fa, error: faErr } = await supabase
    .from("arena_fighters")
    .select(
      "id, name, style, avatar, strength, speed, stamina, defense, chin, special, user_id, equipped_gloves, equipped_shoes, equipped_shorts, equipped_headgear, model_3d_url"
    )
    .eq("id", fight.fighter_a_id)
    .single();
  if (faErr || !fa) return null;

  let fb;
  let isCpu = false;
  let cpuDifficulty = 5;

  if (fight.cpu_fighter_id) {
    const { data: cpu, error: cpuErr } = await supabase
      .from("cpu_fighters")
      .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special, difficulty")
      .eq("id", fight.cpu_fighter_id)
      .single();
    if (cpuErr || !cpu) return null;
    cpuDifficulty = Number(cpu.difficulty) || 5;
    fb = {
      id: cpu.id,
      name: cpu.name,
      style: cpu.style,
      avatar: cpu.avatar ?? "🥊",
      strength: cpu.strength,
      speed: cpu.speed,
      stamina: cpu.stamina,
      defense: cpu.defense,
      chin: cpu.chin,
      special: cpu.special,
      user_id: null,
      equipped_gloves: null,
      equipped_shoes: null,
      equipped_shorts: null,
      equipped_headgear: null,
      model_3d_url: null,
      difficulty: cpuDifficulty,
    };
    isCpu = true;
  } else if (fight.fighter_b_id) {
    const { data: arenaB, error: fbErr } = await supabase
      .from("arena_fighters")
      .select(
        "id, name, style, avatar, strength, speed, stamina, defense, chin, special, user_id, equipped_gloves, equipped_shoes, equipped_shorts, equipped_headgear, model_3d_url"
      )
      .eq("id", fight.fighter_b_id)
      .single();
    if (fbErr || !arenaB) return null;
    fb = arenaB;
    isCpu = CPU_USER_IDS.includes(fb.user_id);
  } else {
    return null;
  }

  const equippedIds = [...new Set([
    fa.equipped_gloves, fa.equipped_shoes, fa.equipped_shorts, fa.equipped_headgear,
    fb.equipped_gloves, fb.equipped_shoes, fb.equipped_shorts, fb.equipped_headgear,
  ].filter(Boolean))];
  let bonusesByItemId = {};
  if (equippedIds.length > 0) {
    const { data: items } = await supabase.from("arena_store_items").select("id, stat_bonuses").in("id", equippedIds);
    if (items) bonusesByItemId = Object.fromEntries((items || []).map((i) => [i.id, i.stat_bonuses || {}]));
  }
  const fighterA = applyGearBonuses(fa, bonusesByItemId);
  const fighterB = applyGearBonuses(fb, bonusesByItemId);
  return { fight: { ...fight, fight_type: fightType }, fighterA, fighterB, isCpu, cpuDifficulty };
}

const ADMIN_CUT_PCT = 0.10;

async function closeBetting(supabase, fightId) {
  await supabase.from("arena_fights").update({ betting_open: false }).eq("id", fightId);
}

const JACKPOT_PCT = 0.02;
const STREAK_BONUS_COINS = { 3: 50, 5: 100, 10: 250 };

function getWeekRange() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day >= 5 ? day - 5 : day + 2;
  const friday = new Date(now);
  friday.setUTCDate(now.getUTCDate() - diff);
  friday.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(friday);
  weekEnd.setUTCDate(friday.getUTCDate() + 7);
  return { weekStart: friday.toISOString().slice(0, 10), weekEnd: weekEnd.toISOString().slice(0, 10) };
}

/**
 * @param {string|null} winnerArenaFighterId — arena_fighters.id when human or PvP arena fighter wins
 * @param {string|null} winnerCpuFighterId — cpu_fighters.id when catalog CPU wins
 */
async function saveFightResult(supabase, fightId, winnerArenaFighterId, winnerCpuFighterId, fightLog, fightType) {
  await supabase
    .from("arena_fights")
    .update({
      winner_id: winnerArenaFighterId ?? null,
      winner_cpu_fighter_id: winnerCpuFighterId ?? null,
      fight_log: fightLog,
      betting_open: false,
    })
    .eq("id", fightId);

  const { data: fightRow } = await supabase
    .from("arena_fights")
    .select("fighter_a_id, fighter_b_id, cpu_fighter_id")
    .eq("id", fightId)
    .single();

  if (winnerArenaFighterId) {
    const { data: w } = await supabase.from("arena_fighters").select("wins, win_streak, user_id").eq("id", winnerArenaFighterId).single();
    if (w) {
      const newWins = (w.wins || 0) + 1;
      const newStreak = (w.win_streak || 0) + 1;
      await supabase.from("arena_fighters").update({ wins: newWins, win_streak: newStreak, updated_at: new Date().toISOString() }).eq("id", winnerArenaFighterId);
      const bonus = STREAK_BONUS_COINS[newStreak];
      if (bonus && w.user_id) {
        const { data: u } = await supabase.from("users").select("arena_coins").eq("id", w.user_id).single();
        const cur = (u && u.arena_coins) || 0;
        await supabase.from("users").update({ arena_coins: cur + bonus }).eq("id", w.user_id);
        await supabase.from("arena_coin_transactions").insert({ user_id: w.user_id, amount: bonus, type: "win_streak", description: `${newStreak} win streak bonus` });
      }
    }
  }

  let loserArenaId = null;
  if (fightRow) {
    if (winnerArenaFighterId === fightRow.fighter_a_id) {
      loserArenaId = fightRow.fighter_b_id || null;
    } else if (winnerCpuFighterId && fightRow.cpu_fighter_id) {
      loserArenaId = fightRow.fighter_a_id;
    } else if (winnerArenaFighterId === fightRow.fighter_b_id) {
      loserArenaId = fightRow.fighter_a_id;
    }
  }
  if (loserArenaId) {
    const { data: loserRow } = await supabase.from("arena_fighters").select("losses").eq("id", loserArenaId).single();
    const newLosses = (loserRow?.losses ?? 0) + 1;
    await supabase.from("arena_fighters").update({ losses: newLosses, win_streak: 0, updated_at: new Date().toISOString() }).eq("id", loserArenaId);
  }

  if (fightType === "tournament" && winnerArenaFighterId) {
    advanceTournamentBracket(supabase, fightId, winnerArenaFighterId).catch((err) => console.error("Tournament advance:", err));
  }

  const { data: bets, error: betsErr } = await supabase
    .from("arena_spectator_bets")
    .select("id, user_id, amount, bet_on, odds")
    .eq("fight_id", fightId);
  let totalPot = 0;
  if (!betsErr && bets && bets.length > 0) {
    totalPot = bets.reduce((s, b) => s + Number(b.amount || 0), 0);
    const adminCut = totalPot * ADMIN_CUT_PCT;
    const jackpotContrib = totalPot * JACKPOT_PCT;
    const winnerPot = totalPot - adminCut - jackpotContrib;
    const winningBets = bets.filter(
      (b) => b.bet_on === winnerArenaFighterId || b.bet_on === winnerCpuFighterId
    );
    const totalWinnerStake = winningBets.reduce((s, b) => s + Number(b.amount || 0), 0);
    if (adminCut > 0) {
      await supabase.from("arena_admin_earnings").insert({ source_type: "spectator", source_id: fightId, amount: adminCut });
    }
    if (jackpotContrib > 0) {
      const { weekStart, weekEnd } = getWeekRange();
      const { data: j } = await supabase.from("arena_jackpot").select("id, total_amount").eq("week_start", weekStart).maybeSingle();
      if (j) {
        await supabase.from("arena_jackpot").update({ total_amount: Number(j.total_amount || 0) + jackpotContrib }).eq("id", j.id);
      } else {
        await supabase.from("arena_jackpot").insert({ week_start: weekStart, week_end: weekEnd, total_amount: jackpotContrib });
      }
    }
    for (const b of bets) {
      const isWin = b.bet_on === winnerArenaFighterId || b.bet_on === winnerCpuFighterId;
      let payout = 0;
      if (isWin && totalWinnerStake > 0) {
        const share = Number(b.amount || 0) / totalWinnerStake;
        payout = winnerPot * share;
      }
      await supabase
        .from("arena_spectator_bets")
        .update({ result: isWin ? "won" : "lost", payout: payout })
        .eq("id", b.id);
      if (payout > 0 && b.user_id) {
        const cents = Math.round(payout * 100);
        await supabase.rpc("wallet_ledger_entry", {
          p_user_id: b.user_id,
          p_type: "game_win",
          p_amount_cents: cents,
          p_reference: `arena_spectator_${b.id}`,
        });
      }
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        status: "alive",
        timestamp: new Date().toISOString(),
        service: "garmonpay-fight-server",
      })
    );
    return;
  }
  // Let Socket.io handle all other requests (e.g. /socket.io)
});
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
});

let supabase = null;
try {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) supabase = createClient(url, key);
} catch (e) {
  console.warn("Supabase not available in server:", e.message);
}

const fightState = new Map();

io.on("connection", (socket) => {
  socket.on("watch_fight", async (payload, ack) => {
    const { fightId } = payload || {};
    if (!fightId) {
      ack?.({ ok: false, message: "fightId required" });
      return;
    }
    if (!supabase) {
      ack?.({ ok: false, message: "Server not configured" });
      return;
    }
    const { data: fight, error } = await supabase
      .from("arena_fights")
      .select("id, winner_id, winner_cpu_fighter_id")
      .eq("id", fightId)
      .single();
    if (error || !fight || fight.winner_id || fight.winner_cpu_fighter_id) {
      ack?.({ ok: false, message: "Fight not found or already ended" });
      return;
    }
    socket.join(`fight:${fightId}`);
    socket.watchingFightId = fightId;
    const state = fightState.get(fightId);
    if (state) {
      socket.emit("fight_state", {
        fighterA: state.fighterA,
        fighterB: state.fighterB,
        healthA: state.healthA,
        healthB: state.healthB,
        log: state.log,
      });
    }
    ack?.({ ok: true });
  });

  socket.on("join_tournament_room", (payload) => {
    const { tournamentId } = payload || {};
    if (tournamentId && typeof tournamentId === "string") socket.join(`tournament:${tournamentId}`);
  });

  socket.on("join_fight", async (payload, ack) => {
    const { fightId, joinToken } = payload || {};
    if (!fightId || !joinToken) {
      ack?.({ ok: false, message: "fightId and joinToken required" });
      return;
    }
    const parsed = verifyJoinToken(joinToken);
    if (!parsed || parsed.fightId !== fightId) {
      ack?.({ ok: false, message: "Invalid or expired token" });
      return;
    }
    if (!supabase) {
      ack?.({ ok: false, message: "Server not configured" });
      return;
    }
    const loaded = await loadFight(supabase, fightId);
    if (!loaded) {
      ack?.({ ok: false, message: "Fight not found" });
      return;
    }
    const { fight, fighterA, fighterB, isCpu, cpuDifficulty } = loaded;
    if (parsed.fighterAId !== fighterA.id) {
      ack?.({ ok: false, message: "Fighter mismatch" });
      return;
    }
    socket.join(`fight:${fightId}`);
    socket.fightId = fightId;
    socket.fighterAId = fighterA.id;
    socket.fighterBId = fighterB.id;
    socket.isCpu = isCpu;

    const diff = cpuDifficulty ?? fighterB.difficulty ?? 5;
    const state = {
      healthA: 100,
      healthB: 100,
      playerAction: null,
      log: [],
      resolved: false,
      fightType: fight.fight_type || "cpu",
      cpuCatalogB: !!fight.cpu_fighter_id,
      cpuDifficulty: diff,
      fighterA: {
        id: fighterA.id,
        name: fighterA.name,
        style: fighterA.style,
        avatar: fighterA.avatar ?? "🥊",
        strength: fighterA.strength,
        speed: fighterA.speed,
        stamina: fighterA.stamina,
        defense: fighterA.defense,
        chin: fighterA.chin,
        special: fighterA.special ?? 20,
        model_3d_url: fighterA.model_3d_url ?? null,
      },
      fighterB: {
        id: fighterB.id,
        name: fighterB.name,
        style: fighterB.style,
        avatar: fighterB.avatar ?? "🥊",
        strength: fighterB.strength,
        speed: fighterB.speed,
        stamina: fighterB.stamina,
        defense: fighterB.defense,
        chin: fighterB.chin,
        special: fighterB.special ?? 20,
        model_3d_url: fighterB.model_3d_url ?? null,
        difficulty: diff,
      },
    };
    fightState.set(fightId, state);

    socket.emit("fight_start", {
      fighterA: state.fighterA,
      fighterB: state.fighterB,
      healthA: state.healthA,
      healthB: state.healthB,
    });
    ack?.({ ok: true });

    let autoJabTimer = null;
    const scheduleAutoJab = () => {
      if (autoJabTimer) clearTimeout(autoJabTimer);
      const s = fightState.get(fightId);
      if (!s || s.resolved) return;
      autoJabTimer = setTimeout(() => {
        autoJabTimer = null;
        const s2 = fightState.get(fightId);
        if (!s2 || s2.resolved || s2.playerAction != null) return;
        s2.playerAction = "JAB";
        tryResolve();
      }, 1500);
    };

    const tryResolve = () => {
      if (autoJabTimer) {
        clearTimeout(autoJabTimer);
        autoJabTimer = null;
      }
      const s = fightState.get(fightId);
      if (!s || s.resolved) return;
      const actionA = s.playerAction || "JAB";
      const actionB = s.isCpu ? pickCpuAction(s.fighterB.style, s.cpuDifficulty ?? 5) : (s.cpuAction ?? "JAB");
      if (!s.isCpu && s.cpuAction == null) return;

      const damageAtoB = computeDamage(actionA, actionB, s.fighterA, s.fighterB);
      const damageBtoA = computeDamage(actionB, actionA, s.fighterB, s.fighterA);
      s.healthA = Math.max(0, s.healthA - damageBtoA);
      s.healthB = Math.max(0, s.healthB - damageAtoB);
      const hitA = damageAtoB > 0;
      const hitB = damageBtoA > 0;

      const exchange = {
        actionA,
        actionB,
        damageAtoB,
        damageBtoA,
        healthA: s.healthA,
        healthB: s.healthB,
        hitA,
        hitB,
      };
      if (s.log.length === 0) closeBetting(supabase, fightId).catch((err) => console.error("Close betting:", err));
      s.log.push(exchange);

      io.to(`fight:${fightId}`).emit("exchange_result", exchange);

      s.playerAction = null;
      s.cpuAction = null;

      if (s.healthA <= 0 || s.healthB <= 0) {
        s.resolved = true;
        let winnerArenaFighterId = null;
        let winnerCpuFighterId = null;
        if (s.healthA <= 0) {
          if (s.cpuCatalogB) winnerCpuFighterId = s.fighterB.id;
          else winnerArenaFighterId = s.fighterB.id;
        } else {
          winnerArenaFighterId = s.fighterA.id;
        }
        fightState.delete(fightId);
        io.to(`fight:${fightId}`).emit("fight_over", {
          winnerArenaFighterId,
          winnerCpuFighterId,
          winnerId: winnerArenaFighterId || winnerCpuFighterId,
          log: s.log,
        });
        saveFightResult(supabase, fightId, winnerArenaFighterId, winnerCpuFighterId, s.log, s.fightType).catch((err) =>
          console.error("Save fight result:", err)
        );
      } else {
        if (s.isCpu) {
          scheduleAutoJab();
        }
      }
    };

    scheduleAutoJab();

    socket.on("action", (payload) => {
      const { type } = payload || {};
      if (!ARENA_ACTIONS.includes(type)) return;
      const fid = socket.fightId;
      if (!fid) return;
      const s = fightState.get(fid);
      if (!s || s.resolved || s.playerAction != null) return;
      s.playerAction = type;
      if (s.isCpu) {
        tryResolve();
      }
    });

    socket.on("disconnect", () => {
      if (autoJabTimer) {
        clearTimeout(autoJabTimer);
        autoJabTimer = null;
      }
      const fid = socket.fightId;
      if (!fid) return;
      const s = fightState.get(fid);
      if (s && !s.resolved) {
        s.resolved = true;
        let winnerArenaFighterId = null;
        let winnerCpuFighterId = null;
        if (s.cpuCatalogB) winnerCpuFighterId = s.fighterB.id;
        else winnerArenaFighterId = s.fighterB.id;
        fightState.delete(fid);
        io.to(`fight:${fid}`).emit("fight_over", {
          winnerArenaFighterId,
          winnerCpuFighterId,
          winnerId: winnerArenaFighterId || winnerCpuFighterId,
          log: s.log,
          disconnected: true,
        });
        saveFightResult(supabase, fid, winnerArenaFighterId, winnerCpuFighterId, s.log, s.fightType).catch((err) =>
          console.error("Save fight result:", err)
        );
      }
    });
  });
});

const TOURNAMENT_ADMIN_PCT = 0.15;
const TOURNAMENT_WINNER_PCT = 0.6;
const TOURNAMENT_RUNNER_UP_PCT = 0.25;
const TOURNAMENT_SEMI_PCT = 0.15;

async function advanceTournamentBracket(supabase, fightId, winnerId) {
  const { data: tournaments } = await supabase.from("arena_tournaments").select("id, bracket, prize_pool, status").eq("status", "in_progress");
  if (!tournaments || tournaments.length === 0) return;
  let tournament = null;
  let roundIndex = -1;
  let matchIndex = -1;
  for (const t of tournaments) {
    const bracket = t.bracket || {};
    const rounds = bracket.rounds || [];
    for (let r = 0; r < rounds.length; r++) {
      const matches = rounds[r].matches || [];
      for (let m = 0; m < matches.length; m++) {
        if (matches[m].fightId === fightId) {
          tournament = t;
          roundIndex = r;
          matchIndex = m;
          break;
        }
      }
      if (tournament) break;
    }
    if (tournament) break;
  }
  if (!tournament || roundIndex < 0) return;
  const bracket = JSON.parse(JSON.stringify(tournament.bracket || {}));
  const rounds = bracket.rounds || [];
  if (!rounds[roundIndex] || !rounds[roundIndex].matches[matchIndex]) return;
  rounds[roundIndex].matches[matchIndex].winnerId = winnerId;
  const currentMatches = rounds[roundIndex].matches;
  const allHaveWinner = currentMatches.every((m) => m.winnerId);
  if (!allHaveWinner) {
    await supabase.from("arena_tournaments").update({ bracket }).eq("id", tournament.id);
    io.to(`tournament:${tournament.id}`).emit("bracket_update", { bracket });
    return;
  }
  const winners = currentMatches.map((m) => m.winnerId);
  if (winners.length === 4) {
    const [newRound] = [
      { matches: [{ fighterAId: winners[0], fighterBId: winners[1] }, { fighterAId: winners[2], fighterBId: winners[3] }] },
    ];
    const newFightIds = [];
    for (const match of newRound.matches) {
      const { data: f } = await supabase.from("arena_fights").insert({ fighter_a_id: match.fighterAId, fighter_b_id: match.fighterBId, fight_type: "tournament" }).select("id").single();
      if (f) {
        match.fightId = f.id;
        newFightIds.push(f.id);
      }
    }
    rounds.push(newRound);
    bracket.rounds = rounds;
    await supabase.from("arena_tournaments").update({ bracket }).eq("id", tournament.id);
    io.to(`tournament:${tournament.id}`).emit("bracket_update", { bracket });
    return;
  }
  if (winners.length === 2) {
    const finalRound = { matches: [{ fighterAId: winners[0], fighterBId: winners[1] }] };
    const { data: f } = await supabase.from("arena_fights").insert({ fighter_a_id: winners[0], fighter_b_id: winners[1], fight_type: "tournament" }).select("id").single();
    if (f) finalRound.matches[0].fightId = f.id;
    rounds.push(finalRound);
    bracket.rounds = rounds;
    await supabase.from("arena_tournaments").update({ bracket }).eq("id", tournament.id);
    io.to(`tournament:${tournament.id}`).emit("bracket_update", { bracket });
    return;
  }
  if (winners.length === 1) {
    const championId = winners[0];
    const prizePool = Number(tournament.prize_pool || 0);
    const afterCut = prizePool * (1 - TOURNAMENT_ADMIN_PCT);
    const winnerPayout = afterCut * TOURNAMENT_WINNER_PCT;
    const runnerUpPayout = afterCut * TOURNAMENT_RUNNER_UP_PCT;
    const semiPayout = (afterCut * TOURNAMENT_SEMI_PCT) / 2;
    const { data: champFighter } = await supabase.from("arena_fighters").select("user_id").eq("id", championId).single();
    if (champFighter && winnerPayout > 0) {
      const cents = Math.round(winnerPayout * 100);
      await supabase.rpc("wallet_ledger_entry", { p_user_id: champFighter.user_id, p_type: "game_win", p_amount_cents: cents, p_reference: `arena_tournament_winner_${tournament.id}` });
    }
    const finalMatch = rounds[rounds.length - 1].matches[0];
    const runnerUpId = finalMatch.fighterAId === championId ? finalMatch.fighterBId : finalMatch.fighterAId;
    const { data: runnerFighter } = await supabase.from("arena_fighters").select("user_id").eq("id", runnerUpId).single();
    if (runnerFighter && runnerUpPayout > 0) {
      const cents = Math.round(runnerUpPayout * 100);
      await supabase.rpc("wallet_ledger_entry", { p_user_id: runnerFighter.user_id, p_type: "game_win", p_amount_cents: cents, p_reference: `arena_tournament_runner_${tournament.id}` });
    }
    const semiRound = rounds[rounds.length - 2];
    if (semiRound && semiRound.matches) {
      for (const m of semiRound.matches) {
        const loserId = m.winnerId === m.fighterAId ? m.fighterBId : m.fighterAId;
        if (loserId && semiPayout > 0) {
          const { data: loserF } = await supabase.from("arena_fighters").select("user_id").eq("id", loserId).single();
          if (loserF) {
            const cents = Math.round(semiPayout * 100);
            await supabase.rpc("wallet_ledger_entry", { p_user_id: loserF.user_id, p_type: "game_win", p_amount_cents: cents, p_reference: `arena_tournament_semi_${tournament.id}` });
          }
        }
      }
    }
    await supabase.from("arena_tournaments").update({ status: "complete", bracket }).eq("id", tournament.id);
    io.to(`tournament:${tournament.id}`).emit("bracket_update", { bracket });
    io.to(`tournament:${tournament.id}`).emit("tournament_complete", { winnerId: championId });
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Arena fight server on port ${PORT}`);
});
