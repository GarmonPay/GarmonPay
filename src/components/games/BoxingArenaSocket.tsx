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
const MAX_STAMINA = 100;
const JAB_COST = 8;
const HEAVY_COST = 18;
const BLOCK_COST = 5;
const JAB_DAMAGE = 8;
const HEAVY_DAMAGE = 18;
const BLOCK_REDUCTION = 0.7;
const STAMINA_REGEN_PER_SEC = 4;

const AI_DIFFICULTY = {
  rookie: {
    intervalMs: 1600,
    jabChance: 0.5,
    heavyChance: 0.25,
    blockChance: 0.25,
    blockWhenHitChance: 0.2,
  },
  pro: {
    intervalMs: 950,
    jabChance: 0.5,
    heavyChance: 0.35,
    blockChance: 0.15,
    blockWhenHitChance: 0.45,
  },
  champion: {
    intervalMs: 650,
    jabChance: 0.45,
    heavyChance: 0.4,
    blockChance: 0.15,
    blockWhenHitChance: 0.6,
  },
} as const;

export type AIDifficulty = keyof typeof AI_DIFFICULTY;

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
  const [connectionFailed, setConnectionFailed] = useState(false);
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
  const [aiOpponent, setAiOpponent] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>("rookie");
  const [player1Stamina, setPlayer1Stamina] = useState(MAX_STAMINA);
  const [player2Stamina, setPlayer2Stamina] = useState(MAX_STAMINA);
  const [playerBlockingUntil, setPlayerBlockingUntil] = useState(0);
  const [aiBlockingUntil, setAiBlockingUntil] = useState(0);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [currentBetCents, setCurrentBetCents] = useState(0);
  const [betError, setBetError] = useState<string | null>(null);
  const [boxerProfile, setBoxerProfile] = useState<{
    name: string | null;
    wins: number;
    losses: number;
    knockouts: number;
    power: number;
    speed: number;
    stamina: number;
    defense: number;
    chin: number;
  } | null>(null);

  const p1HealthRef = useRef(MAX_HEALTH);
  const p2HealthRef = useRef(MAX_HEALTH);
  const p1StaminaRef = useRef(MAX_STAMINA);
  const p2StaminaRef = useRef(MAX_STAMINA);
  const playerBlockingRef = useRef(0);
  const aiBlockingRef = useRef(0);
  const aiResultSentRef = useRef(false);
  p1HealthRef.current = player1Health;
  p2HealthRef.current = player2Health;
  p1StaminaRef.current = player1Stamina;
  p2StaminaRef.current = player2Stamina;
  playerBlockingRef.current = playerBlockingUntil;
  aiBlockingRef.current = aiBlockingUntil;

  const sendPunch = useCallback((type: "jab" | "heavy") => {
    const s = socketRef.current;
    if (aiOpponent) {
      const cost = type === "jab" ? JAB_COST : HEAVY_COST;
      if (p1StaminaRef.current < cost) return;
      const damage = type === "jab" ? JAB_DAMAGE : HEAVY_DAMAGE;
      const blocked = aiBlockingRef.current > Date.now();
      const actual = blocked ? Math.round(damage * (1 - BLOCK_REDUCTION)) : damage;
      const newP2 = Math.max(0, p2HealthRef.current - actual);
      setPlayer2Health(newP2);
      setPlayer2Stamina((prev) => Math.max(0, prev - cost));
      p2HealthRef.current = newP2;
      p2StaminaRef.current = Math.max(0, p2StaminaRef.current - cost);
      p1StaminaRef.current = Math.max(0, p1StaminaRef.current - cost);
      setPlayer1Stamina(p1StaminaRef.current);
      p2AnimRef.current = type === "heavy" ? "punch" : "jab";
      setTimeout(() => (p2AnimRef.current = "idle"), 280);
      if (newP2 <= 0) {
        setWinnerId(playerId);
        setLoserId("ai");
        setPhase("ended");
        onMatchEnd?.(true, playerId, "ai");
      }
      return;
    }
    if (s?.connected) s.emit("punch", { type });
  }, [aiOpponent, playerId, onMatchEnd]);

  const sendBlock = useCallback(() => {
    if (!aiOpponent) return;
    if (p1StaminaRef.current < BLOCK_COST) return;
    const until = Date.now() + 500;
    setPlayerBlockingUntil(until);
    playerBlockingRef.current = until;
    setPlayer1Stamina((prev) => Math.max(0, prev - BLOCK_COST));
    p1StaminaRef.current = Math.max(0, p1StaminaRef.current - BLOCK_COST);
  }, [aiOpponent]);

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
    if (phase !== "fighting" || !aiOpponent) return;
    const cfg = AI_DIFFICULTY[aiDifficulty];
    const id = setInterval(() => {
      const now = Date.now();
      if (p1HealthRef.current <= 0 || p2HealthRef.current <= 0) return;
      const r = Math.random();
      if (r < cfg.blockChance && aiBlockingRef.current <= now) {
        setAiBlockingUntil(now + 400);
        aiBlockingRef.current = now + 400;
        return;
      }
      if (r < cfg.blockChance + cfg.jabChance && p2StaminaRef.current >= JAB_COST) {
        const blocked = playerBlockingRef.current > now;
        const dmg = blocked ? Math.round(JAB_DAMAGE * (1 - BLOCK_REDUCTION)) : JAB_DAMAGE;
        const newP1 = Math.max(0, p1HealthRef.current - dmg);
        p1HealthRef.current = newP1;
        setPlayer1Health(newP1);
        setPlayer2Stamina((prev) => Math.max(0, prev - JAB_COST));
        p2StaminaRef.current = Math.max(0, p2StaminaRef.current - JAB_COST);
        p2AnimRef.current = "jab";
        setTimeout(() => (p2AnimRef.current = "idle"), 280);
        if (newP1 <= 0) {
          setWinnerId("ai");
          setLoserId(playerId);
          setPhase("ended");
          onMatchEnd?.(false, "ai", playerId);
        }
        return;
      }
      if (p2StaminaRef.current >= HEAVY_COST) {
        const blocked = playerBlockingRef.current > now;
        const dmg = blocked ? Math.round(HEAVY_DAMAGE * (1 - BLOCK_REDUCTION)) : HEAVY_DAMAGE;
        const newP1 = Math.max(0, p1HealthRef.current - dmg);
        p1HealthRef.current = newP1;
        setPlayer1Health(newP1);
        setPlayer2Stamina((prev) => Math.max(0, prev - HEAVY_COST));
        p2StaminaRef.current = Math.max(0, p2StaminaRef.current - HEAVY_COST);
        p2AnimRef.current = "punch";
        setTimeout(() => (p2AnimRef.current = "idle"), 280);
        if (newP1 <= 0) {
          setWinnerId("ai");
          setLoserId(playerId);
          setPhase("ended");
          onMatchEnd?.(false, "ai", playerId);
        }
      }
    }, cfg.intervalMs);
    return () => clearInterval(id);
  }, [phase, aiOpponent, aiDifficulty, onMatchEnd]);

  useEffect(() => {
    if (phase !== "fighting" || !aiOpponent) return;
    const id = setInterval(() => {
      if (p1HealthRef.current <= 0 || p2HealthRef.current <= 0) return;
      setPlayer1Stamina((prev) => Math.min(MAX_STAMINA, prev + STAMINA_REGEN_PER_SEC));
      setPlayer2Stamina((prev) => Math.min(MAX_STAMINA, prev + STAMINA_REGEN_PER_SEC));
      p1StaminaRef.current = Math.min(MAX_STAMINA, p1StaminaRef.current + STAMINA_REGEN_PER_SEC);
      p2StaminaRef.current = Math.min(MAX_STAMINA, p2StaminaRef.current + STAMINA_REGEN_PER_SEC);
    }, 1000);
    return () => clearInterval(id);
  }, [phase, aiOpponent]);

  useEffect(() => {
    if (phase !== "lobby") return;
    fetch("/api/wallet")
      .then((r) => r.ok ? r.json() : null)
      .then((data: { balance_cents?: number } | null) => {
        if (data && typeof data.balance_cents === "number") setBalanceCents(data.balance_cents);
      })
      .catch(() => {});
  }, [phase]);

  useEffect(() => {
    if (phase !== "lobby" || !playerId) return;
    fetch("/api/boxing/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data: {
        name?: string | null;
        wins?: number;
        losses?: number;
        knockouts?: number;
        power?: number;
        speed?: number;
        stamina?: number;
        defense?: number;
        chin?: number;
      } | null) => {
        if (data) {
          setBoxerProfile({
            name: data.name ?? null,
            wins: typeof data.wins === "number" ? data.wins : 0,
            losses: typeof data.losses === "number" ? data.losses : 0,
            knockouts: typeof data.knockouts === "number" ? data.knockouts : 0,
            power: typeof data.power === "number" ? data.power : 50,
            speed: typeof data.speed === "number" ? data.speed : 50,
            stamina: typeof data.stamina === "number" ? data.stamina : 50,
            defense: typeof data.defense === "number" ? data.defense : 50,
            chin: typeof data.chin === "number" ? data.chin : 50,
          });
        }
      })
      .catch(() => {});
  }, [phase, playerId]);

  useEffect(() => {
    if (phase !== "ended" || !aiOpponent || currentBetCents <= 0 || aiResultSentRef.current) return;
    aiResultSentRef.current = true;
    const won = winnerId === playerId;
    fetch("/api/games/boxing/ai-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ won, bet_amount_cents: currentBetCents }),
    }).then(() => setCurrentBetCents(0));
  }, [phase, aiOpponent, currentBetCents, winnerId, playerId]);

  useEffect(() => {
    if (!wsUrl || phase === "lobby" || aiOpponent) return;
    setConnectionFailed(false);
    const socket = io(wsUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 30000,
    });
    socketRef.current = socket;

    const emitJoin = () => {
      socket.emit("matchmaking_join", {
        player_id: playerId,
        bet_amount_cents: betInput ? parseInt(betInput, 10) || 0 : 0,
      });
    };

    socket.on("connect", () => {
      setSocketConnected(true);
      setConnectionFailed(false);
      if (phase === "matchmaking") emitJoin();
    });
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("connect_error", () => setConnectionFailed(true));

    const timeout = setTimeout(() => {
      if (!socket.connected) setConnectionFailed(true);
    }, 30000);

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
      setCurrentBetCents(data.bet_amount_cents ?? 0);
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
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [wsUrl, playerId, phase, onMatchEnd, betInput, aiOpponent]);

  const joinMatchmaking = () => {
    setMatchmakingError(null);
    setPhase("matchmaking");
  };

  if (phase === "lobby") {
    const betNum = betInput ? parseInt(betInput, 10) || 0 : 0;
    const insufficientBalance = balanceCents !== null && betNum > balanceCents;
    return (
      <div className="rounded-xl bg-[#0a0a14] border border-white/10 p-6 max-w-md mx-auto">
        <h2 className="text-xl font-bold text-white mb-2">Boxing Arena</h2>
        <p className="text-white/70 text-sm mb-4">
          Join matchmaking to fight another player. Set an optional bet (cents). Winner takes pot minus 10% platform fee.
        </p>
        {boxerProfile && (
          <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-amber-400 font-semibold text-sm">
              {boxerProfile.name?.trim() || "Unnamed Fighter"}
            </p>
            <p className="text-white/70 text-xs mt-1">
              Record: {boxerProfile.wins}-{boxerProfile.losses} ({boxerProfile.knockouts} KO)
            </p>
            <div className="grid grid-cols-5 gap-1 mt-2">
              {(["power", "speed", "stamina", "defense", "chin"] as const).map((stat) => (
                <div key={stat} className="text-center">
                  <p className="text-[10px] text-white/50 uppercase">{stat.slice(0, 2)}</p>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="h-full bg-amber-500/80 rounded-full"
                      style={{ width: `${boxerProfile[stat]}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {balanceCents !== null && (
          <p className="text-white/80 text-sm mb-2">Balance: <span className="font-semibold text-amber-400">{balanceCents}¢</span></p>
        )}
        <div className="space-y-3">
          <label className="block text-sm text-white/80">Bet amount (cents, 0 = free)</label>
          <input
            type="number"
            min={0}
            value={betInput}
            onChange={(e) => { setBetInput(e.target.value); setBetError(null); }}
            className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 focus:ring-2 focus:ring-amber-500"
            placeholder="0"
          />
          {betNum > 0 && (
            <p className="text-white/60 text-xs">Pot: {betNum * 2}¢ (10% platform fee)</p>
          )}
          {insufficientBalance && (
            <p className="text-amber-400 text-sm">Insufficient balance. Reduce bet or add funds.</p>
          )}
          {matchmakingError && (
            <p className="text-red-400 text-sm">{matchmakingError}</p>
          )}
          {betError && (
            <p className="text-red-400 text-sm">{betError}</p>
          )}
          <button
            type="button"
            onClick={joinMatchmaking}
            disabled={insufficientBalance}
            className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold transition-colors"
          >
            Find Opponent
          </button>
          <div className="pt-3 border-t border-white/20">
            <p className="text-white/70 text-xs mb-2">Or play offline vs AI</p>
            <select
              value={aiDifficulty}
              onChange={(e) => setAiDifficulty(e.target.value as AIDifficulty)}
              className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 text-sm mb-2"
            >
              <option value="rookie">Rookie</option>
              <option value="pro">Pro</option>
              <option value="champion">Champion</option>
            </select>
            <button
              type="button"
              onClick={async () => {
                const betCents = betInput ? parseInt(betInput, 10) || 0 : 0;
                if (betCents > 0) {
                  setBetError(null);
                  const res = await fetch("/api/games/boxing/place-bet", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount_cents: betCents }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setBetError(data.error || "Bet failed");
                    return;
                  }
                  if (typeof data.balance_cents === "number") setBalanceCents(data.balance_cents);
                  setCurrentBetCents(betCents);
                } else {
                  setCurrentBetCents(0);
                }
                aiResultSentRef.current = false;
                setAiOpponent(true);
                setMyRole("player1");
                setPlayer1Health(MAX_HEALTH);
                setPlayer2Health(MAX_HEALTH);
                setPlayer1Stamina(MAX_STAMINA);
                setPlayer2Stamina(MAX_STAMINA);
                setPlayerBlockingUntil(0);
                setAiBlockingUntil(0);
                p1HealthRef.current = MAX_HEALTH;
                p2HealthRef.current = MAX_HEALTH;
                p1StaminaRef.current = MAX_STAMINA;
                p2StaminaRef.current = MAX_STAMINA;
                playerBlockingRef.current = 0;
                aiBlockingRef.current = 0;
                setPhase("fighting");
              }}
              disabled={insufficientBalance}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm"
            >
              Play vs AI
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "matchmaking") {
    const showConnectionHelp = !socketConnected && connectionFailed;
    return (
      <div className="rounded-xl bg-[#0a0a14] border border-white/10 p-8 max-w-md mx-auto text-center">
        <p className="text-white font-medium">
          {socketConnected ? "Finding opponent…" : "Connecting…"}
        </p>
        <p className="text-white/60 text-sm mt-2">
          {socketConnected ? `Queue position: ${queuePosition}` : "Waiting for fight server"}
        </p>
        {!socketConnected && !showConnectionHelp && (
          <p className="text-amber-400/90 text-xs mt-2">
            Ensure NEXT_PUBLIC_BOXING_WS_URL points to one server and CORS allows this origin.
          </p>
        )}
        {showConnectionHelp && (
          <div className="mt-4 p-4 rounded-lg bg-black/30 text-left text-sm space-y-2">
            <p className="text-amber-400 font-medium">Could not connect to fight server</p>
            <p className="text-white/80">URL: <code className="bg-white/10 px-1 rounded break-all">{wsUrl}</code></p>
            <p className="text-white/70">1. Start the server: <code className="bg-white/10 px-1 rounded">cd server && CORS_ORIGIN=* node fight-server.js</code></p>
            <p className="text-white/70">2. Set <code className="bg-white/10 px-1 rounded">NEXT_PUBLIC_BOXING_WS_URL=wss://garmonpay-fight-server.onrender.com</code> in .env.local or Vercel env</p>
            <p className="text-white/70">3. Restart the Next.js app and try again.</p>
            <div className="flex gap-2 justify-center mt-4">
              <button
                type="button"
                onClick={() => { setPhase("lobby"); setConnectionFailed(false); }}
                className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm"
              >
                Back to lobby
              </button>
              <button
                type="button"
                onClick={() => { setConnectionFailed(false); setPhase("lobby"); setTimeout(() => setPhase("matchmaking"), 50); }}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium"
              >
                Retry
              </button>
            </div>
            <div className="mt-4 pt-4 border-t border-white/20">
              <p className="text-white font-medium mb-2">Or play vs AI</p>
              <select
                value={aiDifficulty}
                onChange={(e) => setAiDifficulty(e.target.value as AIDifficulty)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 text-sm mb-2"
              >
                <option value="rookie">Rookie</option>
                <option value="pro">Pro</option>
                <option value="champion">Champion</option>
              </select>
              <button
                type="button"
                onClick={async () => {
                  const betCents = betInput ? parseInt(betInput, 10) || 0 : 0;
                  if (betCents > 0) {
                    setBetError(null);
                    const res = await fetch("/api/games/boxing/place-bet", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ amount_cents: betCents }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      setBetError(data.error || "Bet failed");
                      return;
                    }
                    if (typeof data.balance_cents === "number") setBalanceCents(data.balance_cents);
                    setCurrentBetCents(betCents);
                  } else {
                    setCurrentBetCents(0);
                  }
                  setConnectionFailed(false);
                  aiResultSentRef.current = false;
                  setAiOpponent(true);
                  setMyRole("player1");
                  setPlayer1Health(MAX_HEALTH);
                  setPlayer2Health(MAX_HEALTH);
                  setPlayer1Stamina(MAX_STAMINA);
                  setPlayer2Stamina(MAX_STAMINA);
                  setPlayerBlockingUntil(0);
                  setAiBlockingUntil(0);
                  p1HealthRef.current = MAX_HEALTH;
                  p2HealthRef.current = MAX_HEALTH;
                  p1StaminaRef.current = MAX_STAMINA;
                  p2StaminaRef.current = MAX_STAMINA;
                  playerBlockingRef.current = 0;
                  aiBlockingRef.current = 0;
                  setPhase("fighting");
                }}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
              >
                Play vs AI
              </button>
            </div>
          </div>
        )}
        {!showConnectionHelp && (
          <div className="mt-4 h-2 w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 animate-pulse rounded-full" style={{ width: "40%" }} />
          </div>
        )}
      </div>
    );
  }

  if (phase === "ended") {
    const won = winnerId === playerId;
    const vsAi = loserId === "ai" || winnerId === "ai";
    return (
      <div className="rounded-xl bg-[#0a0a14] border border-white/10 p-8 max-w-md mx-auto text-center">
        <p className={`text-3xl font-bold ${won ? "text-amber-400" : "text-white/80"}`}>
          {won ? "You win!" : "You lose"}
        </p>
        <p className="text-white/60 mt-2">
          {vsAi ? (won ? "AI defeated." : "AI wins this round.") : won ? "Prize has been credited to your wallet." : "Better luck next time."}
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
            setPlayer1Stamina(MAX_STAMINA);
            setPlayer2Stamina(MAX_STAMINA);
            setAiOpponent(false);
            setCurrentBetCents(0);
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
        {currentBetCents > 0 && (
          <div className="flex justify-center">
            <div className="bg-black/60 rounded-lg px-3 py-1.5 text-xs text-white/90">
              Bet: {currentBetCents}¢ | Pot: {currentBetCents * 2}¢ (10% fee)
            </div>
          </div>
        )}
        <div className="flex justify-between items-start">
          <div className="bg-black/60 rounded-lg p-3 min-w-[120px]">
            <p className="text-red-400 font-bold text-xs">You</p>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden mt-1 w-24">
              <div
                className="h-full bg-red-500 transition-all duration-200"
                style={{ width: `${myRole === "player1" ? player1Health : player2Health}%` }}
              />
            </div>
            {aiOpponent && (
              <div className="mt-1">
                <p className="text-white/60 text-[10px]">Stamina</p>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden w-24">
                  <div
                    className="h-full bg-amber-500 transition-all duration-200"
                    style={{ width: `${player1Stamina}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="bg-black/60 rounded-lg px-3 py-1.5">
            <p className="text-white/80 text-xs">VS</p>
          </div>
          <div className="bg-black/60 rounded-lg p-3 min-w-[120px] text-right">
            <p className="text-blue-400 font-bold text-xs">{aiOpponent ? "AI" : "Opponent"}</p>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden mt-1 w-24 ml-auto">
              <div
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${myRole === "player1" ? player2Health : player1Health}%` }}
              />
            </div>
            {aiOpponent && (
              <div className="mt-1">
                <p className="text-white/60 text-[10px]">Stamina</p>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden w-24 ml-auto">
                  <div
                    className="h-full bg-amber-500 transition-all duration-200"
                    style={{ width: `${player2Stamina}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="pointer-events-auto flex justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => sendPunch("jab")}
            disabled={aiOpponent && player1Stamina < JAB_COST}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
          >
            Jab
          </button>
          <button
            type="button"
            onClick={() => sendPunch("heavy")}
            disabled={aiOpponent && player1Stamina < HEAVY_COST}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
          >
            Power punch
          </button>
          {aiOpponent && (
            <button
              type="button"
              onClick={sendBlock}
              disabled={player1Stamina < BLOCK_COST}
              className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
            >
              Block
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
