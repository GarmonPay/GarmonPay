/**
 * GarmonPay Fight Server
 * Express + Socket.IO: matchmaking, fight rooms, punch events, health tracking.
 * CORS: https://garmonpay.com
 */

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = "https://garmonpay.com";
const MAX_HEALTH = 100;
const DEFAULT_PUNCH_DAMAGE = 10;

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Matchmaking queue: array of { socketId, playerId? }
const queue = [];
// Rooms: roomId -> { player1: { socketId, playerId, health }, player2: { socketId, playerId, health } }
const rooms = new Map();
// socketId -> roomId
const socketToRoom = new Map();

function leaveQueue(socketId) {
  const i = queue.findIndex((e) => e.socketId === socketId);
  if (i !== -1) queue.splice(i, 1);
}

function getOpponent(room, socketId) {
  if (!room) return null;
  const p1 = room.player1?.socketId === socketId ? room.player2 : room.player1;
  const p2 = room.player1?.socketId === socketId ? room.player1 : room.player2;
  return p1 ?? p2;
}

function getPlayer(room, socketId) {
  if (!room) return null;
  if (room.player1?.socketId === socketId) return room.player1;
  if (room.player2?.socketId === socketId) return room.player2;
  return null;
}

function emitFightEnd(roomId, winnerSocketId, loserSocketId, room) {
  const winnerId = (room.player1?.socketId === winnerSocketId ? room.player1 : room.player2)?.playerId;
  const loserId = (room.player1?.socketId === loserSocketId ? room.player1 : room.player2)?.playerId;
  io.to(roomId).emit("fight_end", {
    winner_socket_id: winnerSocketId,
    loser_socket_id: loserSocketId,
    winner_id: winnerId,
    loser_id: loserId,
  });
  rooms.delete(roomId);
  socketToRoom.delete(room.player1?.socketId);
  socketToRoom.delete(room.player2?.socketId);
}

io.on("connection", (socket) => {
  socket.emit("connected", { socket_id: socket.id });

  socket.on("join_queue", (payload) => {
    leaveQueue(socket.id);
    const playerId = payload?.player_id ?? socket.id;
    queue.push({ socketId: socket.id, playerId });
    socket.emit("queue_joined", { position: queue.length });

    if (queue.length >= 2) {
      const a = queue.shift();
      const b = queue.shift();
      const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const room = {
        player1: { socketId: a.socketId, playerId: a.playerId, health: MAX_HEALTH },
        player2: { socketId: b.socketId, playerId: b.playerId, health: MAX_HEALTH },
      };
      rooms.set(roomId, room);
      socketToRoom.set(a.socketId, roomId);
      socketToRoom.set(b.socketId, roomId);

      io.sockets.sockets.get(a.socketId)?.join(roomId);
      io.sockets.sockets.get(b.socketId)?.join(roomId);

      io.to(roomId).emit("fight_start", {
        room_id: roomId,
        player1: { socket_id: a.socketId, player_id: a.playerId, health: MAX_HEALTH },
        player2: { socket_id: b.socketId, player_id: b.playerId, health: MAX_HEALTH },
      });
    }
  });

  socket.on("leave_queue", () => {
    leaveQueue(socket.id);
    socket.emit("queue_left");
  });

  socket.on("punch", (payload) => {
    const roomId = socketToRoom.get(socket.id);
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const opponent = getOpponent(room, socket.id);
    const me = getPlayer(room, socket.id);
    if (!opponent || !me) return;

    const damage = typeof payload?.damage === "number" ? Math.min(MAX_HEALTH, payload.damage) : DEFAULT_PUNCH_DAMAGE;
    opponent.health = Math.max(0, opponent.health - damage);

    io.to(roomId).emit("punch", {
      from_socket_id: socket.id,
      to_socket_id: opponent.socketId,
      damage,
      health_after: opponent.health,
    });

    if (opponent.health <= 0) {
      emitFightEnd(roomId, socket.id, opponent.socketId, room);
    }
  });

  socket.on("disconnect", () => {
    leaveQueue(socket.id);
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        const opponent = getOpponent(room, socket.id);
        if (opponent) {
          io.to(opponent.socketId).emit("fight_end", {
            winner_socket_id: opponent.socketId,
            loser_socket_id: socket.id,
            winner_id: opponent.playerId,
            loser_id: getPlayer(room, socket.id)?.playerId,
            reason: "opponent_disconnected",
          });
        }
        rooms.delete(roomId);
        socketToRoom.delete(room.player1?.socketId);
        socketToRoom.delete(room.player2?.socketId);
      }
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, queue_length: queue.length, rooms: rooms.size });
});

httpServer.listen(PORT, () => {
  console.log(`GarmonPay fight server listening on port ${PORT}`);
});
