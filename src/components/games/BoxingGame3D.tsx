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
  type TransformNode,
  type InstantiatedEntries,
  LoadAssetContainerAsync,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF/2.0";

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
  const p1AnimRef = useRef<"idle" | "jab" | "punch" | "block" | "knockout">("idle");
  const p2AnimRef = useRef<"idle" | "jab" | "punch" | "block" | "knockout">("idle");
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
    let player1Entries: InstantiatedEntries | null = null;
    let player2Entries: InstantiatedEntries | null = null;
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

      const ground = MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);
      ground.position.y = 0;
      const groundMat = new StandardMaterial("groundMat", scene);
      groundMat.diffuseColor = new Color3(0.08, 0.08, 0.1);
      ground.material = groundMat;

      let lastP1: "idle" | "jab" | "punch" | "block" | "knockout" = "idle";
      let lastP2: "idle" | "jab" | "punch" | "block" | "knockout" = "idle";

      const animNameFromRef = (ref: "idle" | "jab" | "punch" | "block" | "knockout"): string => {
        if (ref === "punch") return "powerPunch";
        if (ref === "knockout") return "knockout";
        return ref;
      };

      const playFighterAnim = (entries: InstantiatedEntries, ref: "idle" | "jab" | "punch" | "block" | "knockout") => {
        const name = animNameFromRef(ref);
        for (const g of entries.animationGroups) g.stop();
        const group = entries.animationGroups.find(
          (g) => g.name.toLowerCase() === name.toLowerCase()
        );
        if (group) group.start(ref === "idle" || ref === "knockout");
      };

      const tintMeshColor = (node: { getChildMeshes?: () => { material?: unknown }[]; material?: unknown }, r: number, g: number, b: number) => {
        const mat = "material" in node ? node.material : undefined;
        if (mat && typeof mat === "object") {
          const m = mat as Record<string, unknown>;
          if (m.diffuseColor && typeof (m.diffuseColor as { set: (a: number, b: number, c: number) => void }).set === "function") {
            (m.diffuseColor as { set: (a: number, b: number, c: number) => void }).set(r, g, b);
          }
          if (m.albedoColor && typeof (m.albedoColor as { set: (a: number, b: number, c: number) => void }).set === "function") {
            (m.albedoColor as { set: (a: number, b: number, c: number) => void }).set(r, g, b);
          }
        }
        if (typeof node.getChildMeshes === "function") {
          for (const child of node.getChildMeshes()) {
            if (child.material) tintMeshColor(child, r, g, b);
          }
        }
      };

      LoadAssetContainerAsync("boxer.glb", scene, { rootUrl: "/models/" })
        .then((container) => {
          const redCorner = container.instantiateModelsToScene(
            (name) => "P1Fighter_" + name,
            true
          );
          const blueCorner = container.instantiateModelsToScene(
            (name) => "P2Fighter_" + name,
            true
          );
          const scale = 1.2;
          for (const node of redCorner.rootNodes) {
            const tn = node as TransformNode;
            tn.position.set(-3, 0, 0);
            tn.scaling.setAll(scale);
            tintMeshColor(node as { getChildMeshes?: () => { material?: unknown }[]; material?: unknown }, 0.9, 0.25, 0.25);
          }
          for (const node of blueCorner.rootNodes) {
            const tn = node as TransformNode;
            tn.position.set(3, 0, 0);
            tn.scaling.setAll(scale);
            tintMeshColor(node as { getChildMeshes?: () => { material?: unknown }[]; material?: unknown }, 0.25, 0.35, 0.95);
          }
          player1Entries = redCorner;
          player2Entries = blueCorner;
        })
        .catch(() => {});

      scene.onBeforeRenderObservable.add(() => {
        const pos = boxerPositionRef.current;
        if (player1Entries && player2Entries) {
          if (p1AnimRef.current !== lastP1) {
            playFighterAnim(player1Entries, p1AnimRef.current);
            lastP1 = p1AnimRef.current;
          }
          if (p2AnimRef.current !== lastP2) {
            playFighterAnim(player2Entries, p2AnimRef.current);
            lastP2 = p2AnimRef.current;
          }
          for (const node of player1Entries.rootNodes) {
            const tn = node as TransformNode;
            tn.position.set(-3 + pos.p1.x, 0, pos.p1.z);
          }
          for (const node of player2Entries.rootNodes) {
            const tn = node as TransformNode;
            tn.position.set(3 + pos.p2.x, 0, pos.p2.z);
          }
        }
      });

      engine.runRenderLoop(() => {
        if (scene) scene.render();
      });
      setGameState("playing");
    } catch (err) {
      console.error("BoxingGame3D: scene init failed", err);
      if (engine && scene) {
        try {
          engine.runRenderLoop(() => {
            if (scene) scene.render();
          });
        } catch {
          // ignore
        }
      }
      setGameState("playing");
    }

    return () => {
      player1Entries?.dispose();
      player2Entries?.dispose();
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
            const wasBlocking = p2AnimRef.current === "block";
            p1AnimRef.current = "jab";
            setP2Health((h) => {
              const newH = Math.max(0, h - (wasBlocking ? 0 : JAB_DAMAGE));
              if (newH <= 0) p2AnimRef.current = "knockout";
              return newH;
            });
            if (!wasBlocking) {
              lastHitRef.current = { at: now, by: "p1" };
              setP2Stamina((s) => Math.max(0, s - 2));
            }
            setTimeout(() => {
              if (p2AnimRef.current !== "knockout") p1AnimRef.current = "idle";
            }, 200);
            setP1Stamina((s) => Math.max(0, s - STAMINA_JAB));
          }
          break;
        case "KeyK":
          e.preventDefault();
          if (p1Stamina >= STAMINA_PUNCH) {
            const wasBlocking = p2AnimRef.current === "block";
            p1AnimRef.current = "punch";
            setP2Health((h) => {
              const newH = Math.max(0, h - (wasBlocking ? 0 : PUNCH_DAMAGE));
              if (newH <= 0) p2AnimRef.current = "knockout";
              return newH;
            });
            if (!wasBlocking) {
              lastHitRef.current = { at: now, by: "p1" };
              setP2Stamina((s) => Math.max(0, s - 5));
            }
            setTimeout(() => {
              if (p2AnimRef.current !== "knockout") p1AnimRef.current = "idle";
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
            const wasBlocking = p1AnimRef.current === "block";
            p2AnimRef.current = "jab";
            setP1Health((h) => {
              const newH = Math.max(0, h - (wasBlocking ? 0 : JAB_DAMAGE));
              if (newH <= 0) p1AnimRef.current = "knockout";
              return newH;
            });
            if (!wasBlocking) {
              lastHitRef.current = { at: now, by: "p2" };
              setP1Stamina((s) => Math.max(0, s - 2));
            }
            setTimeout(() => {
              if (p1AnimRef.current !== "knockout") p2AnimRef.current = "idle";
            }, 200);
            setP2Stamina((s) => Math.max(0, s - STAMINA_JAB));
          }
          break;
        case "Numpad2":
        case "Digit2":
          if ((e.target as HTMLElement)?.tagName === "INPUT") break;
          e.preventDefault();
          if (p2Stamina >= STAMINA_PUNCH) {
            const wasBlocking = p1AnimRef.current === "block";
            p2AnimRef.current = "punch";
            setP1Health((h) => {
              const newH = Math.max(0, h - (wasBlocking ? 0 : PUNCH_DAMAGE));
              if (newH <= 0) p1AnimRef.current = "knockout";
              return newH;
            });
            if (!wasBlocking) {
              lastHitRef.current = { at: now, by: "p2" };
              setP1Stamina((s) => Math.max(0, s - 5));
            }
            setTimeout(() => {
              if (p1AnimRef.current !== "knockout") p2AnimRef.current = "idle";
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
