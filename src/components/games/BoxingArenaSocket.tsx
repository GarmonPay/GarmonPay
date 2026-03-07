"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  type AbstractMesh,
} from "@babylonjs/core";
import { io, type Socket } from "socket.io-client";

const MAX_HEALTH = 100;

export type BoxingArenaSocketProps = {
  wsUrl: string;
  playerId: string;
  betAmountCents?: number;
  onMatchEnd?: (won: boolean, winnerId: string, loserId: string) => void;
};

export function BoxingArenaSocket({
  wsUrl,
  playerId,
  betAmountCents = 0,
  onMatchEnd,
}: BoxingArenaSocketProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const myRoleRef = useRef<"player1" | "player2" | null>(null);
  const p1AnimRef = useRef<"idle" | "jab" | "punch">("idle");
  const p2AnimRef = useRef<"idle" | "jab" | "punch">("idle");

  const [phase, setPhase] = useState<"lobby" | "matchmaking" | "fighting" | "ended">("lobby");
  const [socketConnected, setSocketConnected] = useState(false);
  const [matchmakingError, setMatchmakingError] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<"player1" | "player2" | null>(null);
  myRoleRef.current = myRole;
  const [player1Health, setPlayer1Health] = useState(MAX_HEALTH);
  const [player2Health, setPlayer2Health] = useState(MAX_HEALTH);
  const [player1Id, setPlayer1Id] = useState<string | null>(null);
  const [player2Id, setPlayer2Id] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [loserId, setLoserId] = useState<string | null>(null);
  const [betInput, setBetInput] = useState(betAmountCents > 0 ? String(betAmountCents) : "");

  const sendPunch = useCallback((type: "jab" | "heavy") => {
    const s = socketRef.current;
    if (s?.connected) s.emit("punch", { type });
  }, []);

  useEffect(() => {
    if (phase !== "fighting" || !canvasRef.current) return;
    const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor.set(0.05, 0.05, 0.12, 1);

    const camera = new ArcRotateCamera(
      "cam",
      -Math.PI / 2,
      Math.PI / 2.5,
      22,
      Vector3.Zero(),
      scene
    );
    camera.attachControl(canvasRef.current, true);
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 32;

    new HemisphericLight("light1", new Vector3(0, 1, 0), scene).intensity = 1;
    new HemisphericLight("light2", new Vector3(0, -1, 0), scene).intensity = 0.3;

    const ring = MeshBuilder.CreateBox("ring", { width: 12, height: 0.3, depth: 12 }, scene);
    ring.position.y = -0.15;
    const ringMat = new StandardMaterial("ringMat", scene);
    ringMat.diffuseColor = new Color3(0.18, 0.15, 0.22);
    ring.material = ringMat;

    for (let i = 0; i < 4; i++) {
      const side = MeshBuilder.CreateBox(
        `rope_${i}`,
        { width: i % 2 === 0 ? 12.4 : 0.4, height: 0.08, depth: i % 2 === 0 ? 0.4 : 12.4 },
        scene
      );
      side.position.y = 1.2 + i * 0.2;
      const x = i === 0 ? 0 : i === 1 ? 6 : i === 2 ? 0 : -6;
      const z = i === 0 ? 6 : i === 1 ? 0 : i === 2 ? -6 : 0;
      side.position.set(x, side.position.y, z);
      const ropeMat = new StandardMaterial(`ropeMat_${i}`, scene);
      ropeMat.diffuseColor = new Color3(0.85, 0.12, 0.12);
      side.material = ropeMat;
    }

    const p1Body = MeshBuilder.CreateCylinder(
      "p1Body",
      { height: 1.4, diameterTop: 0.5, diameterBottom: 0.6, tessellation: 12 },
      scene
    );
    p1Body.position.set(-3, 0.9, 0);
    p1Body.rotation.z = Math.PI / 2;
    const p1Mat = new StandardMaterial("p1Mat", scene);
    p1Mat.diffuseColor = new Color3(0.9, 0.25, 0.25);
    p1Body.material = p1Mat;
    const p1Head = MeshBuilder.CreateSphere("p1Head", { diameter: 0.6, segments: 12 }, scene);
    p1Head.position.set(0, 0.9, 0);
    p1Head.setParent(p1Body);

    const p2Body = MeshBuilder.CreateCylinder(
      "p2Body",
      { height: 1.4, diameterTop: 0.5, diameterBottom: 0.6, tessellation: 12 },
      scene
    );
    p2Body.position.set(3, 0.9, 0);
    p2Body.rotation.z = -Math.PI / 2;
    const p2Mat = new StandardMaterial("p2Mat", scene);
    p2Mat.diffuseColor = new Color3(0.25, 0.35, 0.95);
    p2Body.material = p2Mat;
    const p2Head = MeshBuilder.CreateSphere("p2Head", { diameter: 0.6, segments: 12 }, scene);
    p2Head.position.set(0, 0.9, 0);
    p2Head.setParent(p2Body);

    scene.onBeforeRenderObservable.add(() => {
      const p1 = p1Body as AbstractMesh;
      const ax1 = p1AnimRef.current === "jab" ? -0.25 : p1AnimRef.current === "punch" ? -0.45 : 0;
      p1.position.set(-3 + ax1, 0.9, 0);
      const p2 = p2Body as AbstractMesh;
      const ax2 = p2AnimRef.current === "jab" ? 0.25 : p2AnimRef.current === "punch" ? 0.45 : 0;
      p2.position.set(3 + ax2, 0.9, 0);
    });

    engine.runRenderLoop(() => scene.render());
    return () => {
      scene.dispose();
      engine.dispose();
    };
  }, [phase]);

  useEffect(() => {
    if (!wsUrl || phase === "lobby") return;
    const socket = io(wsUrl, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    const emitJoin = () => {
      socket.emit("matchmaking_join", {
        player_id: playerId,
        bet_amount_cents: betInput ? parseInt(betInput, 10) || 0 : 0,
      });
    };

    socket.on("connect", () => {
      setSocketConnected(true);
      if (phase === "matchmaking") emitJoin();
    });
    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("connected", () => {
      if (phase === "matchmaking") emitJoin();
    });

    socket.on("matchmaking_join", (data: {
      success?: boolean;
      error?: string;
      position?: number;
      queue_length?: number;
    }) => {
      if (data.success === false) {
        setMatchmakingError(data.error || "Failed to join");
        setPhase("lobby");
        return;
      }
      if (typeof data.position === "number") setQueuePosition(data.position);
      if (typeof data.queue_length === "number") setQueuePosition(data.queue_length);
    });

    socket.on("fight_start_failed", (data: { reason?: string; message?: string }) => {
      setMatchmakingError(data.message || data.reason || "Fight start failed");
      setPhase("lobby");
    });

    socket.on("fight_start", (data: {
      room_id: string;
      bet_amount_cents?: number;
      player1: { socket_id: string; player_id: string; health: number };
      player2: { socket_id: string; player_id: string; health: number };
    }) => {
      setRoomId(data.room_id);
      setPlayer1Health(data.player1.health ?? MAX_HEALTH);
      setPlayer2Health(data.player2.health ?? MAX_HEALTH);
      setPlayer1Id(data.player1.player_id ?? null);
      setPlayer2Id(data.player2.player_id ?? null);
      const myId = socket.id;
      if (myId === data.player1.socket_id) setMyRole("player1");
      else if (myId === data.player2.socket_id) setMyRole("player2");
      else setMyRole(null);
      setPhase("fighting");
      setMatchmakingError(null);
    });

    socket.on("punch", (data: {
      from_socket_id: string;
      to_socket_id: string;
      type?: string;
      to_health_after?: number;
    }) => {
      const role = myRoleRef.current;
      if (data.from_socket_id === socket.id) {
        if (role === "player1") {
          p1AnimRef.current = data.type === "heavy" ? "punch" : "jab";
          setTimeout(() => (p1AnimRef.current = "idle"), 280);
        } else if (role === "player2") {
          p2AnimRef.current = data.type === "heavy" ? "punch" : "jab";
          setTimeout(() => (p2AnimRef.current = "idle"), 280);
        }
      }
      if (data.to_socket_id === socket.id && typeof data.to_health_after === "number") {
        if (role === "player1") setPlayer1Health(data.to_health_after);
        else setPlayer2Health(data.to_health_after);
      }
    });

    socket.on("health_update", (data: { player1_health?: number; player2_health?: number }) => {
      if (typeof data.player1_health === "number") setPlayer1Health(data.player1_health);
      if (typeof data.player2_health === "number") setPlayer2Health(data.player2_health);
    });

    socket.on("fight_end", (data: {
      winner_id?: string;
      loser_id?: string;
    }) => {
      setWinnerId(data.winner_id ?? null);
      setLoserId(data.loser_id ?? null);
      setPhase("ended");
      onMatchEnd?.(data.winner_id === playerId, data.winner_id ?? "", data.loser_id ?? "");
    });

    if (socket.connected && phase === "matchmaking") emitJoin();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [wsUrl, playerId, phase, onMatchEnd, betInput]);

  const joinMatchmaking = () => {
    setMatchmakingError(null);
    setPhase("matchmaking");
  };

  if (phase === "lobby") {
    return (
      <div className="rounded-xl bg-[#0a0a14] border border-white/10 p-6 max-w-md mx-auto">
        <h2 className="text-xl font-bold text-white mb-2">Boxing Arena</h2>
        <p className="text-white/70 text-sm mb-4">
          Join matchmaking to fight another player. Set an optional bet (cents).
        </p>
        <div className="space-y-3">
          <label className="block text-sm text-white/80">Bet amount (cents, 0 = free)</label>
          <input
            type="number"
            min={0}
            value={betInput}
            onChange={(e) => setBetInput(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 focus:ring-2 focus:ring-amber-500"
            placeholder="0"
          />
          {matchmakingError && (
            <p className="text-red-400 text-sm">{matchmakingError}</p>
          )}
          <button
            type="button"
            onClick={joinMatchmaking}
            className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-semibold transition-colors"
          >
            Find Opponent
          </button>
        </div>
      </div>
    );
  }

  if (phase === "matchmaking") {
    return (
      <div className="rounded-xl bg-[#0a0a14] border border-white/10 p-8 max-w-sm mx-auto text-center">
        <p className="text-white font-medium">
          {socketConnected ? "Finding opponent…" : "Connecting…"}
        </p>
        <p className="text-white/60 text-sm mt-2">
          {socketConnected ? `Queue position: ${queuePosition}` : "Waiting for fight server"}
        </p>
        {!socketConnected && (
          <p className="text-amber-400/90 text-xs mt-2">
            Ensure NEXT_PUBLIC_BOXING_WS_URL points to one server and CORS allows this origin.
          </p>
        )}
        <div className="mt-4 h-2 w-full bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500 animate-pulse rounded-full" style={{ width: "40%" }} />
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    const won = winnerId === playerId;
    return (
      <div className="rounded-xl bg-[#0a0a14] border border-white/10 p-8 max-w-md mx-auto text-center">
        <p className={`text-3xl font-bold ${won ? "text-amber-400" : "text-white/80"}`}>
          {won ? "You win!" : "You lose"}
        </p>
        <p className="text-white/60 mt-2">
          {won ? "Prize has been credited to your wallet." : "Better luck next time."}
        </p>
        <button
          type="button"
          onClick={() => {
            setPhase("lobby");
            setWinnerId(null);
            setLoserId(null);
            setRoomId(null);
            setMyRole(null);
            setPlayer1Health(MAX_HEALTH);
            setPlayer2Health(MAX_HEALTH);
          }}
          className="mt-6 px-6 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors"
        >
          Play again
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-[#0a0a12]">
      <canvas
        ref={canvasRef}
        className="w-full h-[480px] block touch-none"
        style={{ width: "100%", height: "480px" }}
      />
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
        <div className="flex justify-between items-start">
          <div className="bg-black/60 rounded-lg p-3 min-w-[120px]">
            <p className="text-red-400 font-bold text-xs">You</p>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden mt-1 w-24">
              <div
                className="h-full bg-red-500 transition-all duration-200"
                style={{ width: `${myRole === "player1" ? player1Health : player2Health}%` }}
              />
            </div>
          </div>
          <div className="bg-black/60 rounded-lg px-3 py-1.5">
            <p className="text-white/80 text-xs">VS</p>
          </div>
          <div className="bg-black/60 rounded-lg p-3 min-w-[120px] text-right">
            <p className="text-blue-400 font-bold text-xs">Opponent</p>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden mt-1 w-24 ml-auto">
              <div
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${myRole === "player1" ? player2Health : player1Health}%` }}
              />
            </div>
          </div>
        </div>
        <div className="pointer-events-auto flex justify-center gap-3">
          <button
            type="button"
            onClick={() => sendPunch("jab")}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition-colors"
          >
            Jab
          </button>
          <button
            type="button"
            onClick={() => sendPunch("heavy")}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors"
          >
            Power punch
          </button>
        </div>
      </div>
    </div>
  );
}
