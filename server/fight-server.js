/**
 * GarmonPay Fight Server – Full multiplayer arena + real-money betting
 * Matchmaking, rooms, spectators, leaderboard, server-authoritative damage.
 * Wallet: entry fee deducted when fight starts; winner paid when fight ends. 10% platform fee.
 * CORS: * (any origin) by default; set CORS_ORIGIN for a specific origin. Render: process.env.PORT
 */

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const CORS_ALLOW_ANY = CORS_ORIGIN === "*" || CORS_ORIGIN === "any";
const MAX_HEALTH = 100;
const JAB_DAMAGE = 8;
const HEAVY_DAMAGE = 18;
const PLATFORM_FEE_PERCENT = 10;

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabase = require("@supabase/supabase-js").createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (e) {
    console.warn("Supabase not available, running without wallet:", e.message);
  }
}

async function getBalanceCents(userId) {
  if (!supabase) return null;
  const { data: w } = await supabase.from("wallet_balances").select("balance").eq("user_id", userId).maybeSingle();
  if (w != null && w.balance != null) return Number(w.balance) || 0;
  const { data: u } = await supabase.from("users").select("balance").eq("id", userId).maybeSingle();
  return u != null ? Number(u.balance) || 0 : 0;
}

async function deductEntry(userId, amountCents, reference) {
  if (!supabase) return { success: false, message: "Wallet not configured" };
  const ref = reference || `fight_arena_entry_${userId}_${Date.now()}`;
  const { data, error } = await supabase.rpc("wallet_ledger_entry", {
    p_user_id: userId,
    p_type: "game_play",
    p_amount_cents: -amountCents,
    p_reference: ref,
  });
  if (error) return { success: false, message: error.message };
  const r = data && typeof data === "object" ? data : {};
  if (r.success) {
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "fight_entry",
      amount: amountCents,
      status: "completed",
      description: "Boxing arena fight entry",
      reference_id: ref,
    }).then(({ error: e }) => { if (e) console.error("[fight-server] transaction fight_entry:", e.message); });
    return { success: true };
  }
  return { success: false, message: r.message || "Deduction failed" };
}

async function payWinner(userId, amountCents, reference) {
  if (!supabase) return;
  const ref = reference || `fight_arena_win_${userId}_${Date.now()}`;
  await supabase.rpc("wallet_ledger_entry", {
    p_user_id: userId,
    p_type: "game_win",
    p_amount_cents: amountCents,
    p_reference: ref,
  });
  await supabase.from("transactions").insert({
    user_id: userId,
    type: "fight_prize",
    amount: amountCents,
    status: "completed",
    description: "Boxing arena fight win",
    reference_id: ref,
  }).then(({ error: e }) => { if (e) console.error("[fight-server] transaction fight_prize:", e.message); });
}

async function recordFightHistory(player1Id, player2Id, winnerId, betAmountCents, platformFeeCents) {
  if (!supabase) return;
  await supabase.from("fight_history").insert({
    player1: player1Id,
    player2: player2Id,
    winner: winnerId,
    bet_amount_cents: betAmountCents,
    platform_fee_cents: platformFeeCents,
  }).then(({ error: e }) => { if (e) console.error("[fight-server] fight_history insert:", e.message); });
}

async function recordPlatformFee(amountCents, source = "boxing_arena") {
  if (!supabase) return;
  await supabase.from("platform_revenue").insert({
    amount: amountCents,
    source,
  }).then(({ error: e }) => { if (e) console.error("[fight-server] platform_revenue insert:", e.message); });
}

const app = express();
app.use(cors(CORS_ALLOW_ANY ? { origin: true } : { origin: CORS_ORIGIN }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: CORS_ALLOW_ANY ? { origin: true } : { origin: CORS_ORIGIN },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Matchmaking queue: { socketId, playerId, betAmountCents }
const queue = [];
// Rooms: roomId -> { player1, player2, punches[], spectators, betAmountCents }
const rooms = new Map();
// socketId -> { roomId, role: "player1" | "player2" | "spectator" }
const socketToRoom = new Map();
// Leaderboard: playerId -> { wins, losses }
const leaderboard = new Map();

function leaveQueue(socketId) {
  const i = queue.findIndex((e) => e.socketId === socketId);
  if (i !== -1) queue.splice(i, 1);
}

function getOpponent(room, socketId) {
  if (!room) return null;
  if (room.player1?.socketId === socketId) return room.player2;
  if (room.player2?.socketId === socketId) return room.player1;
  return null;
}

function getPlayer(room, socketId) {
  if (!room) return null;
  if (room.player1?.socketId === socketId) return room.player1;
  if (room.player2?.socketId === socketId) return room.player2;
  return null;
}

function isPlayerInRoom(socketId) {
  const entry = socketToRoom.get(socketId);
  return entry && (entry.role === "player1" || entry.role === "player2");
}

function getDamage(punchType) {
  if (punchType === "heavy") return HEAVY_DAMAGE;
  return JAB_DAMAGE;
}

function updateLeaderboard(winnerPlayerId, loserPlayerId) {
  if (winnerPlayerId) {
    const w = leaderboard.get(winnerPlayerId) ?? { wins: 0, losses: 0 };
    w.wins += 1;
    leaderboard.set(winnerPlayerId, w);
  }
  if (loserPlayerId) {
    const l = leaderboard.get(loserPlayerId) ?? { wins: 0, losses: 0 };
    l.losses += 1;
    leaderboard.set(loserPlayerId, l);
  }
}

function emitFightEnd(roomId, winnerSocketId, loserSocketId, room) {
  const winner = getPlayer(room, winnerSocketId) ?? getOpponent(room, loserSocketId);
  const loser = getPlayer(room, loserSocketId) ?? getOpponent(room, winnerSocketId);
  const winnerId = winner?.playerId;
  const loserId = loser?.playerId;
  updateLeaderboard(winnerId, loserId);

  const betCents = room.betAmountCents || 0;
  if (betCents > 0 && winnerId) {
    const pot = betCents * 2;
    const platformFeeCents = Math.round(pot * (PLATFORM_FEE_PERCENT / 100));
    const winnerPayoutCents = pot - platformFeeCents;
    payWinner(winnerId, winnerPayoutCents, roomId).then(() => {
      recordFightHistory(room.player1?.playerId, room.player2?.playerId, winnerId, betCents, platformFeeCents);
      recordPlatformFee(platformFeeCents);
    });
  }

  io.to(roomId).emit("fight_end", {
    room_id: roomId,
    winner_socket_id: winnerSocketId,
    loser_socket_id: loserSocketId,
    winner_id: winnerId,
    loser_id: loserId,
    player1_health: room.player1?.health ?? 0,
    player2_health: room.player2?.health ?? 0,
    bet_amount_cents: betCents,
  });

  if (room.player1?.socketId) socketToRoom.delete(room.player1.socketId);
  if (room.player2?.socketId) socketToRoom.delete(room.player2.socketId);
  if (room.spectators) room.spectators.forEach((sid) => socketToRoom.delete(sid));
  rooms.delete(roomId);
}

function createRoom(player1Entry, player2Entry, betAmountCents = 0) {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const room = {
    player1: {
      socketId: player1Entry.socketId,
      playerId: player1Entry.playerId,
      health: MAX_HEALTH,
    },
    player2: {
      socketId: player2Entry.socketId,
      playerId: player2Entry.playerId,
      health: MAX_HEALTH,
    },
    punches: [],
    spectators: new Set(),
    betAmountCents: betAmountCents || 0,
  };
  rooms.set(roomId, room);
  socketToRoom.set(player1Entry.socketId, { roomId, role: "player1" });
  socketToRoom.set(player2Entry.socketId, { roomId, role: "player2" });
  return roomId;
}

async function tryMatch() {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    const betCents = Math.min(a.betAmountCents, b.betAmountCents);

    if (betCents > 0 && supabase) {
      const fightRef = `arena_${Date.now()}`;
      const r1 = await deductEntry(a.playerId, betCents, `${fightRef}_p1`);
      if (!r1.success) {
        io.to(a.socketId).emit("fight_start_failed", { reason: "deduction_failed", message: r1.message });
        io.to(b.socketId).emit("fight_start_failed", { reason: "deduction_failed", message: r1.message });
        queue.unshift(b);
        queue.unshift(a);
        return;
      }
      const r2 = await deductEntry(b.playerId, betCents, `${fightRef}_p2`);
      if (!r2.success) {
        await payWinner(a.playerId, betCents, `${fightRef}_refund_p1`);
        io.to(a.socketId).emit("fight_start_failed", { reason: "deduction_failed", message: r2.message });
        io.to(b.socketId).emit("fight_start_failed", { reason: "deduction_failed", message: r2.message });
        queue.unshift(b);
        queue.unshift(a);
        return;
      }
    }

    const roomId = createRoom(a, b, betCents);
    const room = rooms.get(roomId);

    io.sockets.sockets.get(a.socketId)?.join(roomId);
    io.sockets.sockets.get(b.socketId)?.join(roomId);

    io.to(roomId).emit("fight_start", {
      room_id: roomId,
      bet_amount_cents: betCents,
      player1: {
        socket_id: room.player1.socketId,
        player_id: room.player1.playerId,
        health: room.player1.health,
      },
      player2: {
        socket_id: room.player2.socketId,
        player_id: room.player2.playerId,
        health: room.player2.health,
      },
    });
    console.log("[matchmaking] Matched", a.socketId, "vs", b.socketId, "room:", roomId);
  }
}

io.on("connection", (socket) => {
  socket.emit("connected", { socket_id: socket.id });

  // —— Matchmaking ——
  socket.on("matchmaking_join", (payload) => {
    leaveQueue(socket.id);
    const playerId = (payload && payload.player_id) ? String(payload.player_id).trim() : socket.id;
    const betAmountCents = Math.max(0, parseInt(payload?.bet_amount_cents, 10) || 0);

    const entry = { socketId: socket.id, playerId, betAmountCents };

    if (betAmountCents > 0 && supabase) {
      getBalanceCents(playerId).then((balance) => {
        if (balance < betAmountCents) {
          socket.emit("matchmaking_join", {
            success: false,
            error: "insufficient_balance",
            balance_cents: balance,
            required_cents: betAmountCents,
          });
          return;
        }
        queue.push(entry);
        console.log("Queue:", queue.length);
        socket.emit("matchmaking_join", {
          success: true,
          socket_id: socket.id,
          player_id: playerId,
          bet_amount_cents: betAmountCents,
          position: queue.length,
          queue_length: queue.length,
        });
        tryMatch();
      });
      return;
    }

    queue.push(entry);
    console.log("Queue:", queue.length);
    socket.emit("matchmaking_join", {
      success: true,
      socket_id: socket.id,
      player_id: playerId,
      bet_amount_cents: betAmountCents,
      position: queue.length,
      queue_length: queue.length,
    });
    tryMatch();
  });
  socket.on("join_queue", (payload) => {
    leaveQueue(socket.id);
    const playerId = (payload && payload.player_id) ? String(payload.player_id).trim() : socket.id;
    const betAmountCents = Math.max(0, parseInt(payload?.bet_amount_cents, 10) || 0);
    const entry = { socketId: socket.id, playerId, betAmountCents };
    queue.push(entry);
    console.log("Queue:", queue.length);
    socket.emit("matchmaking_join", {
      success: true,
      socket_id: socket.id,
      player_id: playerId,
      bet_amount_cents: betAmountCents,
      position: queue.length,
      queue_length: queue.length,
    });
    tryMatch();
  });

  socket.on("leave_queue", () => {
    leaveQueue(socket.id);
    socket.emit("queue_left");
  });

  // —— Spectator ——
  socket.on("spectator_join", (payload) => {
    const roomId = payload?.room_id ? String(payload.room_id).trim() : null;
    if (!roomId || !rooms.has(roomId)) {
      socket.emit("spectator_join", { success: false, error: "room_not_found" });
      return;
    }
    const room = rooms.get(roomId);
    if (socketToRoom.has(socket.id)) {
      socket.emit("spectator_join", { success: false, error: "already_in_room" });
      return;
    }
    socket.join(roomId);
    room.spectators.add(socket.id);
    socketToRoom.set(socket.id, { roomId, role: "spectator" });
    socket.emit("spectator_join", {
      success: true,
      room_id: roomId,
      socket_id: socket.id,
      player1: {
        socket_id: room.player1.socketId,
        player_id: room.player1.playerId,
        health: room.player1.health,
      },
      player2: {
        socket_id: room.player2.socketId,
        player_id: room.player2.playerId,
        health: room.player2.health,
      },
      punches: room.punches,
    });
    io.to(roomId).emit("spectator_join", {
      room_id: roomId,
      spectator_socket_id: socket.id,
      spectator_count: room.spectators.size,
    });
  });

  // —— Punch (server calculates damage; client only sends type) ——
  socket.on("punch", (payload) => {
    const entry = socketToRoom.get(socket.id);
    if (!entry || entry.role === "spectator") return;
    const room = rooms.get(entry.roomId);
    if (!room) return;

    const opponent = getOpponent(room, socket.id);
    const me = getPlayer(room, socket.id);
    if (!opponent || !me) return;

    const punchType = (payload && payload.type === "heavy") ? "heavy" : "jab";
    const damage = getDamage(punchType);
    opponent.health = Math.max(0, opponent.health - damage);

    const punchRecord = {
      from_socket_id: socket.id,
      to_socket_id: opponent.socketId,
      from_player_id: me.playerId,
      to_player_id: opponent.playerId,
      type: punchType,
      damage,
      to_health_after: opponent.health,
      at: Date.now(),
    };
    room.punches.push(punchRecord);

    io.to(entry.roomId).emit("punch", punchRecord);
    io.to(entry.roomId).emit("health_update", {
      room_id: entry.roomId,
      player1_health: room.player1.health,
      player2_health: room.player2.health,
    });

    if (opponent.health <= 0) {
      emitFightEnd(entry.roomId, socket.id, opponent.socketId, room);
    }
  });

  socket.on("disconnect", () => {
    leaveQueue(socket.id);
    const entry = socketToRoom.get(socket.id);
    if (!entry) return;

    const roomId = entry.roomId;
    const room = rooms.get(roomId);
    if (!room) {
      socketToRoom.delete(socket.id);
      return;
    }

    if (entry.role === "spectator") {
      room.spectators.delete(socket.id);
      socketToRoom.delete(socket.id);
      io.to(roomId).emit("spectator_join", {
        room_id: roomId,
        spectator_left: socket.id,
        spectator_count: room.spectators.size,
      });
      return;
    }

    const opponent = getOpponent(room, socket.id);
    if (opponent) {
      emitFightEnd(roomId, opponent.socketId, socket.id, room);
    }
  });
});

// —— HTTP ——
app.get("/health", (_req, res) => {
  res.json({ ok: true, queue_length: queue.length, rooms: rooms.size });
});

app.get("/fights", (_req, res) => {
  const list = [];
  rooms.forEach((room, roomId) => {
    list.push({
      room_id: roomId,
      bet_amount_cents: room.betAmountCents || 0,
      player1: room.player1 ? { player_id: room.player1.playerId, health: room.player1.health } : null,
      player2: room.player2 ? { player_id: room.player2.playerId, health: room.player2.health } : null,
      spectator_count: room.spectators ? room.spectators.size : 0,
    });
  });
  res.json({ fights: list });
});

app.get("/rooms", (_req, res) => {
  const list = [];
  rooms.forEach((room, roomId) => {
    list.push({
      room_id: roomId,
      bet_amount_cents: room.betAmountCents || 0,
      player1: room.player1 ? { player_id: room.player1.playerId, health: room.player1.health } : null,
      player2: room.player2 ? { player_id: room.player2.playerId, health: room.player2.health } : null,
      spectator_count: room.spectators ? room.spectators.size : 0,
    });
  });
  res.json({ rooms: list });
});

app.get("/fight-history", async (_req, res) => {
  if (!supabase) return res.json({ fight_history: [] });
  const { data, error } = await supabase
    .from("fight_history")
    .select("id, player1, player2, winner, bet_amount_cents, platform_fee_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ fight_history: data || [] });
});

app.post("/join-fight", express.json(), async (req, res) => {
  const playerId = req.body && req.body.player_id ? String(req.body.player_id).trim() : null;
  const betAmountCents = Math.max(0, parseInt(req.body?.bet_amount_cents, 10) || 0);
  if (!playerId) return res.status(400).json({ error: "player_id required" });
  if (betAmountCents === 0) return res.json({ ok: true, eligible: true, balance_cents: null });
  if (!supabase) return res.json({ ok: true, eligible: true, balance_cents: null });
  const balance = await getBalanceCents(playerId);
  const eligible = balance >= betAmountCents;
  res.json({ ok: true, eligible, balance_cents: balance, required_cents: betAmountCents });
});

app.get("/leaderboard", (_req, res) => {
  const list = [];
  leaderboard.forEach((stats, playerId) => {
    list.push({ player_id: playerId, wins: stats.wins, losses: stats.losses });
  });
  list.sort((a, b) => b.wins - a.wins);
  res.json({ leaderboard: list });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`GarmonPay fight server listening on port ${PORT} (0.0.0.0)`);
});
