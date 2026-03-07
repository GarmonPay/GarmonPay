"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
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

const ROUND_DURATION_SEC = 60;
const TOTAL_ROUNDS = 3;
const MAX_HEALTH = 100;
const MAX_STAMINA = 100;
const JAB_DAMAGE = 8;
const PUNCH_DAMAGE = 18;
const STAMINA_JAB = 5;
const STAMINA_PUNCH = 15;
const STAMINA_BLOCK = 3;
const STAMINA_REGEN = 2;
const RING_MIN = -5;
const RING_MAX = 5;
const MOVE_STEP = 0.2;

export type BoxingGameProps = {
  player1Id: string;
  player2Id: string;
  betAmountCents: number;
  accessToken?: string | null;
  onMatchEnd?: (winnerId: string, loserId: string) => void;
  wsUrl?: string | null;
};

export function BoxingGame3D({
  player1Id,
  player2Id,
  betAmountCents,
  accessToken = null,
  onMatchEnd,
  wsUrl = null,
}: BoxingGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [gameState, setGameState] = useState<
    "playing" | "round_break" | "ended" | "loading"
  >("loading");
  const [round, setRound] = useState(1);
  const [roundTimeLeft, setRoundTimeLeft] = useState(ROUND_DURATION_SEC);
  const [p1Health, setP1Health] = useState(MAX_HEALTH);
  const [p2Health, setP2Health] = useState(MAX_HEALTH);
  const [p1Stamina, setP1Stamina] = useState(MAX_STAMINA);
  const [p2Stamina, setP2Stamina] = useState(MAX_STAMINA);
  const [winner, setWinner] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const p1AnimRef = useRef<"idle" | "jab" | "punch" | "block">("idle");
  const p2AnimRef = useRef<"idle" | "jab" | "punch" | "block">("idle");
  const boxerPositionRef = useRef({ p1: { x: 0, z: 0 }, p2: { x: 0, z: 0 } });
  const lastHitRef = useRef<{ at: number; by: "p1" | "p2" } | null>(null);
  const roundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultReportedRef = useRef(false);

  const reportResult = useCallback(
    async (winnerId: string, loserId: string) => {
      if (resultReportedRef.current) return;
      resultReportedRef.current = true;
      try {
        const res = await fetch("/api/games/boxing/result", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            winner_id: winnerId,
            loser_id: loserId,
            bet_amount: betAmountCents,
          }),
        });
        if (res.ok && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "result",
              winner_id: winnerId,
              loser_id: loserId,
              bet_amount: betAmountCents,
            })
          );
        }
        onMatchEnd?.(winnerId, loserId);
      } catch (e) {
        console.error("Boxing result API error:", e);
      }
    },
    [accessToken, betAmountCents, onMatchEnd]
  );

  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    setCanvasReady(!!el);
  }, []);

  useEffect(() => {
    if (!canvasReady || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let engine: Engine | null = null;
    let scene: Scene | null = null;
    try {
      engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      scene = new Scene(engine);
      scene.clearColor.set(0.05, 0.05, 0.1, 1);

      // --- Basic Babylon test scene: confirm engine renders ---
      const camera = new ArcRotateCamera(
        "cam",
        -Math.PI / 2,
        Math.PI / 2.5,
        25,
        Vector3.Zero(),
        scene
      );
      camera.attachControl(canvas, true);
      camera.lowerRadiusLimit = 12;
      camera.upperRadiusLimit = 35;

      const light = new HemisphericLight(
        "light1",
        new Vector3(0, 1, 0),
        scene
      );
      light.intensity = 1;
      new HemisphericLight("light2", new Vector3(0, -1, 0), scene).intensity = 0.3;

      const ring = MeshBuilder.CreateBox(
        "ring",
        { width: 12, height: 0.3, depth: 12 },
        scene
      );
      ring.position.y = -0.15;
      const ringMat = new StandardMaterial("ringMat", scene);
      ringMat.diffuseColor = new Color3(0.15, 0.15, 0.2);
      ring.material = ringMat;

      engine.runRenderLoop(() => {
        if (scene) {
          scene.render();
        }
      });
      setGameState("playing");

      // --- Optional: ropes and fighters (fallback if this fails) ---
      try {
        for (let i = 0; i < 4; i++) {
          const side = MeshBuilder.CreateBox(
            `rope_${i}`,
            { width: i % 2 === 0 ? 12.4 : 0.4, height: 0.08, depth: i % 2 === 0 ? 0.4 : 12.4 },
            scene
          );
          side.position.y = 1.2 + i * 0.2;
          const x = i === 0 ? 0 : i === 1 ? 6 : i === 2 ? 0 : -6;
          const z = i === 0 ? 6 : i === 1 ? 0 : i === 2 ? -6 : 0;
          side.position.x = x;
          side.position.z = z;
          const ropeMat = new StandardMaterial(`ropeMat_${i}`, scene);
          ropeMat.diffuseColor = new Color3(0.8, 0.1, 0.1);
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
        p1Mat.diffuseColor = new Color3(0.9, 0.2, 0.2);
        p1Body.material = p1Mat;
        const p1Head = MeshBuilder.CreateSphere("p1Head", { diameter: 0.6, segments: 12 }, scene);
        p1Head.position.set(0, 0.9, 0);
        p1Head.setParent(p1Body);
        scene.onBeforeRenderObservable.add(() => {
          const mesh = p1Body as AbstractMesh;
          const pos = boxerPositionRef.current.p1;
          const animX = p1AnimRef.current === "jab" ? -0.2 : p1AnimRef.current === "punch" ? -0.4 : 0;
          mesh.position.set(-3 + pos.x + animX, 0.9, pos.z);
        });

        const p2Body = MeshBuilder.CreateCylinder(
          "p2Body",
          { height: 1.4, diameterTop: 0.5, diameterBottom: 0.6, tessellation: 12 },
          scene
        );
        p2Body.position.set(3, 0.9, 0);
        p2Body.rotation.z = -Math.PI / 2;
        const p2Mat = new StandardMaterial("p2Mat", scene);
        p2Mat.diffuseColor = new Color3(0.2, 0.3, 0.9);
        p2Body.material = p2Mat;
        const p2Head = MeshBuilder.CreateSphere("p2Head", { diameter: 0.6, segments: 12 }, scene);
        p2Head.position.set(0, 0.9, 0);
        p2Head.setParent(p2Body);
        scene.onBeforeRenderObservable.add(() => {
          const mesh = p2Body as AbstractMesh;
          const pos = boxerPositionRef.current.p2;
          const animX = p2AnimRef.current === "jab" ? 0.2 : p2AnimRef.current === "punch" ? 0.4 : 0;
          mesh.position.set(3 + pos.x + animX, 0.9, pos.z);
        });
      } catch (err) {
        console.warn("BoxingGame3D: fighters/ropes failed, showing fallback scene", err);
      }
    } catch (err) {
      console.error("BoxingGame3D: scene init failed", err);
      if (engine && scene) {
        try {
          engine.runRenderLoop(() => {
            if (scene) {
              scene.render();
            }
          });
        } catch {
          // ignore
        }
      }
      setGameState("playing");
    }

    return () => {
      if (scene) scene.dispose();
      if (engine) engine.dispose();
    };
  }, [canvasReady]);

  useEffect(() => {
    if (gameState !== "playing" || round > TOTAL_ROUNDS) return;
    roundTimerRef.current = setInterval(() => {
      setRoundTimeLeft((t) => {
        if (t <= 1) {
          if (round >= TOTAL_ROUNDS) {
            setGameState("ended");
            setRoundTimeLeft(0);
            setWinner((prev) => {
              if (prev) return prev;
              const w = p1Health > p2Health ? player1Id : p2Health > p1Health ? player2Id : player1Id;
              const l = w === player1Id ? player2Id : player1Id;
              reportResult(w, l);
              return w;
            });
          } else {
            setGameState("round_break");
            setRound((r) => r + 1);
            setRoundTimeLeft(ROUND_DURATION_SEC);
          }
          return ROUND_DURATION_SEC;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (roundTimerRef.current) clearInterval(roundTimerRef.current);
    };
  }, [gameState, round, player1Id, player2Id, reportResult, p1Health, p2Health]);

  useEffect(() => {
    if (gameState === "round_break") {
      const t = setTimeout(() => setGameState("playing"), 3000);
      return () => clearTimeout(t);
    }
  }, [gameState]);

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (gameState !== "playing") return;
      const pos = boxerPositionRef.current;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

      switch (e.code) {
        case "KeyW":
          e.preventDefault();
          pos.p1.z = clamp(pos.p1.z - MOVE_STEP, RING_MIN, RING_MAX);
          break;
        case "KeyS":
          e.preventDefault();
          pos.p1.z = clamp(pos.p1.z + MOVE_STEP, RING_MIN, RING_MAX);
          break;
        case "KeyA":
          e.preventDefault();
          pos.p1.x = clamp(pos.p1.x - MOVE_STEP, -2, 2);
          break;
        case "KeyD":
          e.preventDefault();
          pos.p1.x = clamp(pos.p1.x + MOVE_STEP, -2, 2);
          break;
        case "ArrowUp":
          e.preventDefault();
          pos.p2.z = clamp(pos.p2.z - MOVE_STEP, RING_MIN, RING_MAX);
          break;
        case "ArrowDown":
          e.preventDefault();
          pos.p2.z = clamp(pos.p2.z + MOVE_STEP, RING_MIN, RING_MAX);
          break;
        case "ArrowLeft":
          e.preventDefault();
          pos.p2.x = clamp(pos.p2.x - MOVE_STEP, -2, 2);
          break;
        case "ArrowRight":
          e.preventDefault();
          pos.p2.x = clamp(pos.p2.x + MOVE_STEP, -2, 2);
          break;
      }

      const now = Date.now();

      switch (e.code) {
        case "KeyJ":
          e.preventDefault();
          if (p1Stamina >= STAMINA_JAB) {
            p1AnimRef.current = "jab";
            setTimeout(() => {
              if (p2AnimRef.current !== "block") {
                lastHitRef.current = { at: now, by: "p1" };
                setP2Health((h) => Math.max(0, h - JAB_DAMAGE));
                setP2Stamina((s) => Math.max(0, s - 2));
              }
              p1AnimRef.current = "idle";
            }, 200);
            setP1Stamina((s) => Math.max(0, s - STAMINA_JAB));
          }
          break;
        case "KeyK":
          e.preventDefault();
          if (p1Stamina >= STAMINA_PUNCH) {
            p1AnimRef.current = "punch";
            setTimeout(() => {
              if (p2AnimRef.current !== "block") {
                lastHitRef.current = { at: now, by: "p1" };
                setP2Health((h) => Math.max(0, h - PUNCH_DAMAGE));
                setP2Stamina((s) => Math.max(0, s - 5));
              }
              p1AnimRef.current = "idle";
            }, 300);
            setP1Stamina((s) => Math.max(0, s - STAMINA_PUNCH));
          }
          break;
        case "KeyL":
          e.preventDefault();
          p1AnimRef.current = "block";
          setP1Stamina((s) => Math.max(0, s - STAMINA_BLOCK));
          setTimeout(() => (p1AnimRef.current = "idle"), 500);
          break;
        case "Numpad1":
        case "Digit1":
          if ((e.target as HTMLElement)?.tagName === "INPUT") break;
          e.preventDefault();
          if (p2Stamina >= STAMINA_JAB) {
            p2AnimRef.current = "jab";
            setTimeout(() => {
              if (p1AnimRef.current !== "block") {
                lastHitRef.current = { at: now, by: "p2" };
                setP1Health((h) => Math.max(0, h - JAB_DAMAGE));
                setP1Stamina((s) => Math.max(0, s - 2));
              }
              p2AnimRef.current = "idle";
            }, 200);
            setP2Stamina((s) => Math.max(0, s - STAMINA_JAB));
          }
          break;
        case "Numpad2":
        case "Digit2":
          if ((e.target as HTMLElement)?.tagName === "INPUT") break;
          e.preventDefault();
          if (p2Stamina >= STAMINA_PUNCH) {
            p2AnimRef.current = "punch";
            setTimeout(() => {
              if (p1AnimRef.current !== "block") {
                lastHitRef.current = { at: now, by: "p2" };
                setP1Health((h) => Math.max(0, h - PUNCH_DAMAGE));
                setP1Stamina((s) => Math.max(0, s - 5));
              }
              p2AnimRef.current = "idle";
            }, 300);
            setP2Stamina((s) => Math.max(0, s - STAMINA_PUNCH));
          }
          break;
        case "Numpad3":
        case "Digit3":
          if ((e.target as HTMLElement)?.tagName === "INPUT") break;
          e.preventDefault();
          p2AnimRef.current = "block";
          setP2Stamina((s) => Math.max(0, s - STAMINA_BLOCK));
          setTimeout(() => (p2AnimRef.current = "idle"), 500);
          break;
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [gameState, p1Stamina, p2Stamina]);

  useEffect(() => {
    if (gameState !== "playing") return;
    const t = setInterval(() => {
      setP1Stamina((s) => Math.min(MAX_STAMINA, s + STAMINA_REGEN));
      setP2Stamina((s) => Math.min(MAX_STAMINA, s + STAMINA_REGEN));
    }, 500);
    return () => clearInterval(t);
  }, [gameState]);

  useEffect(() => {
    if (gameState !== "playing") return;
    if (p1Health <= 0 || p2Health <= 0) {
      setGameState("ended");
      const w = p1Health <= 0 ? player2Id : player1Id;
      const l = w === player1Id ? player2Id : player1Id;
      setWinner(w);
      reportResult(w, l);
    }
  }, [p1Health, p2Health, player1Id, player2Id, reportResult, gameState]);

  useEffect(() => {
    if (!wsUrl || typeof window === "undefined") return;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () =>
        ws.send(JSON.stringify({ type: "join", player1Id, player2Id }));
      ws.onclose = () => {
        wsRef.current = null;
      };
      return () => {
        ws.close();
        wsRef.current = null;
      };
    } catch {
      wsRef.current = null;
    }
  }, [wsUrl, player1Id, player2Id]);

  return (
    <div className="relative w-full h-[600px] rounded-xl overflow-hidden bg-[#0a0a12]">
      <canvas
        ref={setCanvasRef}
        className="w-full h-full block touch-none"
        style={{ width: "100%", height: "100%", opacity: gameState === "loading" ? 0 : 1 }}
      />
      {gameState === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a12] rounded-xl">
          <p className="text-white">Loading 3D scene…</p>
        </div>
      )}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
        <div className="flex justify-between items-start">
          <div className="bg-black/60 rounded-lg p-3 min-w-[140px]">
            <p className="text-red-400 font-bold text-sm">Player 1</p>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-red-500 transition-all duration-200"
                style={{ width: `${p1Health}%` }}
              />
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-amber-500 transition-all duration-200"
                style={{ width: `${p1Stamina}%` }}
              />
            </div>
          </div>
          <div className="bg-black/60 rounded-lg px-4 py-2 text-center">
            <p className="text-white font-bold">
              Round {round}/{TOTAL_ROUNDS}
            </p>
            <p className="text-2xl font-mono text-white">{roundTimeLeft}s</p>
          </div>
          <div className="bg-black/60 rounded-lg p-3 min-w-[140px] text-right">
            <p className="text-blue-400 font-bold text-sm">Player 2</p>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-blue-500 ml-auto transition-all duration-200"
                style={{ width: `${p2Health}%` }}
              />
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-amber-500 ml-auto transition-all duration-200"
                style={{ width: `${p2Stamina}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-8 text-xs text-white/80 flex-wrap">
          <span>P1: WASD move · J Jab · K Punch · L Block</span>
          <span>P2: Arrows move · 1 Jab · 2 Punch · 3 Block</span>
        </div>
      </div>
      {gameState === "ended" && winner && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-auto">
          <div className="bg-fintech-bg-card border border-white/20 rounded-2xl p-8 text-center max-w-sm">
            <p className="text-2xl font-bold text-white mb-2">
              {winner === player1Id ? "Player 1" : "Player 2"} wins!
            </p>
            <p className="text-fintech-muted text-sm">
              Winner payout has been credited.
            </p>
          </div>
        </div>
      )}
      {gameState === "round_break" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <p className="text-xl font-bold text-white">
            Round {round} — Get ready!
          </p>
        </div>
      )}
    </div>
  );
}
