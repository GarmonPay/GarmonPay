/**
 * GarmonPay Fight Server – Full multiplayer arena
 * Matchmaking, multiple rooms, spectators, leaderboard, server-authoritative damage.
 * CORS: https://garmonpay.com | Optimized for Render (process.env.PORT).
 */

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = "https://garmonpay.com";
const MAX_HEALTH = 100;
const JAB_DAMAGE = 8;
const HEAVY_DAMAGE = 18;

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Matchmaking queue: { socketId, playerId }
const queue = [];
// Rooms: roomId -> { player1, player2, punches[], spectators: Set(socketId) }
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

  io.to(roomId).emit("fight_end", {
    room_id: roomId,
    winner_socket_id: winnerSocketId,
    loser_socket_id: loserSocketId,
    winner_id: winnerId,
    loser_id: loserId,
    player1_health: room.player1?.health ?? 0,
    player2_health: room.player2?.health ?? 0,
  });

  if (room.player1?.socketId) socketToRoom.delete(room.player1.socketId);
  if (room.player2?.socketId) socketToRoom.delete(room.player2.socketId);
  if (room.spectators) room.spectators.forEach((sid) => socketToRoom.delete(sid));
  rooms.delete(roomId);
}

function createRoom(player1Entry, player2Entry) {
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
  };
  rooms.set(roomId, room);
  socketToRoom.set(player1Entry.socketId, { roomId, role: "player1" });
  socketToRoom.set(player2Entry.socketId, { roomId, role: "player2" });
  return roomId;
}

io.on("connection", (socket) => {
  socket.emit("connected", { socket_id: socket.id });

  // —— Matchmaking ——
  function onMatchmakingJoin(payload) {
    leaveQueue(socket.id);
    const playerId = (payload && payload.player_id) ? String(payload.player_id).trim() : socket.id;
    const entry = { socketId: socket.id, playerId };
    queue.push(entry);
    socket.emit("matchmaking_join", {
      socket_id: socket.id,
      player_id: playerId,
      position: queue.length,
      queue_length: queue.length,
    });

    if (queue.length >= 2) {
      const a = queue.shift();
      const b = queue.shift();
      const roomId = createRoom(a, b);
      const room = rooms.get(roomId);

      io.sockets.sockets.get(a.socketId)?.join(roomId);
      io.sockets.sockets.get(b.socketId)?.join(roomId);

      io.to(roomId).emit("fight_start", {
        room_id: roomId,
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
    }
  }
  socket.on("matchmaking_join", onMatchmakingJoin);
  socket.on("join_queue", onMatchmakingJoin);

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

app.get("/leaderboard", (_req, res) => {
  const list = [];
  leaderboard.forEach((stats, playerId) => {
    list.push({ player_id: playerId, wins: stats.wins, losses: stats.losses });
  });
  list.sort((a, b) => b.wins - a.wins);
  res.json({ leaderboard: list });
});

app.get("/rooms", (_req, res) => {
  const list = [];
  rooms.forEach((room, roomId) => {
    list.push({
      room_id: roomId,
      player1: room.player1 ? { player_id: room.player1.playerId, health: room.player1.health } : null,
      player2: room.player2 ? { player_id: room.player2.playerId, health: room.player2.health } : null,
      spectator_count: room.spectators.size,
    });
  });
  res.json({ rooms: list });
});

httpServer.listen(PORT, () => {
  console.log(`GarmonPay fight server listening on port ${PORT}`);
});
