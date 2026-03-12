"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  type TransformNode,
  type InstantiatedEntries,
  LoadAssetContainerAsync,
  ShadowGenerator,
  DynamicTexture,
  ParticleSystem,
  Texture,
  type AbstractMesh,
  Mesh,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF/2.0";

// Arena dimensions (Las Vegas-style ring)
const RING_SIZE = 7.3; // ~24ft
const RING_HEIGHT = 1;
const ROPE_RADIUS = 0.04;
const POST_HEIGHT = 1.8;
const STADIUM_RADIUS = 35;
const STADIUM_HEIGHT = 8;

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
  const cameraRef = useRef<ArcRotateCamera | null>(null);

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
      camera.upperRadiusLimit = 42;
      camera.alpha = -Math.PI / 2;
      camera.beta = Math.PI / 2.4;
      camera.radius = 28;
      cameraRef.current = camera;

      // ---- Arena: Las Vegas-style boxing ring ----
      const half = RING_SIZE / 2;

      // Ring platform (raised floor)
      const platform = MeshBuilder.CreateBox(
        "ringPlatform",
        { width: RING_SIZE + 1.2, height: RING_HEIGHT * 0.5, depth: RING_SIZE + 1.2 },
        scene
      );
      platform.position.y = -RING_HEIGHT * 0.25;
      const platformMat = new StandardMaterial("platformMat", scene);
      platformMat.diffuseColor = new Color3(0.15, 0.12, 0.1);
      platformMat.specularColor = new Color3(0.1, 0.1, 0.1);
      platform.material = platformMat;

      // Ring canvas (fighting surface)
      const canvasFloor = MeshBuilder.CreateGround(
        "ringCanvas",
        { width: RING_SIZE, height: RING_SIZE, subdivisions: 4 },
        scene
      );
      canvasFloor.position.y = 0.02;
      const canvasMat = new StandardMaterial("canvasMat", scene);
      canvasMat.diffuseColor = new Color3(0.92, 0.9, 0.85);
      canvasMat.specularColor = new Color3(0.3, 0.3, 0.3);
      canvasMat.specularPower = 64;
      canvasFloor.material = canvasMat;

      // Corner posts (metal)
      const postPositions: [number, number][] = [
        [-half - 0.15, -half - 0.15],
        [half + 0.15, -half - 0.15],
        [half + 0.15, half + 0.15],
        [-half - 0.15, half + 0.15],
      ];
      const posts: AbstractMesh[] = [];
      const postMat = new StandardMaterial("postMat", scene);
      postMat.diffuseColor = new Color3(0.35, 0.35, 0.4);
      postMat.specularColor = new Color3(0.5, 0.5, 0.55);
      postMat.emissiveColor = new Color3(0.02, 0.02, 0.05);
      postPositions.forEach(([x, z], i) => {
        const post = MeshBuilder.CreateCylinder(
          "post_" + i,
          { height: POST_HEIGHT, diameter: 0.2, tessellation: 12 },
          scene
        );
        post.position.set(x, POST_HEIGHT / 2 + 0.02, z);
        post.material = postMat;
        posts.push(post);
      });

      // Ropes (three horizontal cables per side)
      const ropeMat = new StandardMaterial("ropeMat", scene);
      ropeMat.diffuseColor = new Color3(0.95, 0.95, 0.95);
      ropeMat.specularColor = new Color3(0.4, 0.4, 0.4);
      const ropeHeights = [0.45, 0.75, 1.05];
      const ropeSegments: AbstractMesh[] = [];
      const sideHalf = half + 0.1;
      const sides: { p1: [number, number]; p2: [number, number] }[] = [
        { p1: [-sideHalf, -sideHalf], p2: [sideHalf, -sideHalf] },
        { p1: [sideHalf, -sideHalf], p2: [sideHalf, sideHalf] },
        { p1: [sideHalf, sideHalf], p2: [-sideHalf, sideHalf] },
        { p1: [-sideHalf, sideHalf], p2: [-sideHalf, -sideHalf] },
      ];
      sides.forEach((side, sideIdx) => {
        const [x1, z1] = side.p1;
        const [x2, z2] = side.p2;
        const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
        ropeHeights.forEach((h, ropeIdx) => {
          const rope = MeshBuilder.CreateCylinder(
            `rope_${sideIdx}_${ropeIdx}`,
            { height: len, diameter: ROPE_RADIUS * 2, tessellation: 8 },
            scene
          );
          rope.position.set((x1 + x2) / 2, h, (z1 + z2) / 2);
          rope.rotation.z = Math.PI / 2;
          rope.rotation.y = Math.atan2(z2 - z1, x2 - x1);
          rope.material = ropeMat;
          ropeSegments.push(rope);
        });
      });

      // Padded corners (turnbuckle pads) - red and blue
      const padMatRed = new StandardMaterial("padRed", scene);
      padMatRed.diffuseColor = new Color3(0.75, 0.1, 0.1);
      padMatRed.specularColor = new Color3(0.2, 0.02, 0.02);
      padMatRed.emissiveColor = new Color3(0.08, 0, 0);
      const padMatBlue = new StandardMaterial("padBlue", scene);
      padMatBlue.diffuseColor = new Color3(0.1, 0.15, 0.6);
      padMatBlue.specularColor = new Color3(0.02, 0.02, 0.2);
      padMatBlue.emissiveColor = new Color3(0, 0.02, 0.08);
      const padPositions: [number, number, number, number][] = [
        [-sideHalf - 0.25, 0.2, -sideHalf - 0.25, 0],
        [sideHalf + 0.25, 0.2, -sideHalf - 0.25, Math.PI / 2],
        [sideHalf + 0.25, 0.2, sideHalf + 0.25, Math.PI],
        [-sideHalf - 0.25, 0.2, sideHalf + 0.25, -Math.PI / 2],
      ];
      padPositions.forEach(([x, y, z, rotY], i) => {
        const pad = MeshBuilder.CreateBox(
          "pad_" + i,
          { width: 0.5, height: 0.5, depth: 0.25 },
          scene
        );
        pad.position.set(x, y, z);
        pad.rotation.y = rotY;
        pad.material = i % 2 === 0 ? padMatRed : padMatBlue;
      });

      // Stadium seating (stepped rows around the ring)
      const seatMat = new StandardMaterial("seatMat", scene);
      seatMat.diffuseColor = new Color3(0.12, 0.1, 0.08);
      seatMat.specularColor = new Color3(0.05, 0.05, 0.05);
      const seatRows = 12;
      const seatStep = 1.8;
      const seatDepth = 1.2;
      for (let row = 0; row < seatRows; row++) {
        const r = half + 2 + row * seatStep;
        const y = -0.2 + row * 0.35;
        const perimeter = 2 * Math.PI * r;
        const segments = Math.max(12, Math.floor(perimeter / 2.5));
        for (let s = 0; s < segments; s++) {
          const angle = (s / segments) * Math.PI * 2;
          const seat = MeshBuilder.CreateBox(
            `seat_${row}_${s}`,
            { width: perimeter / segments - 0.1, height: 0.4, depth: seatDepth },
            scene
          );
          seat.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
          seat.rotation.y = -angle;
          seat.material = seatMat;
        }
      }

      // Crowd planes (animated silhouettes / cards)
      const crowdMat = new StandardMaterial("crowdMat", scene);
      crowdMat.diffuseColor = new Color3(0.15, 0.12, 0.2);
      crowdMat.emissiveColor = new Color3(0.02, 0.01, 0.03);
      crowdMat.alpha = 0.9;
      const crowdPlanes: AbstractMesh[] = [];
      for (let c = 0; c < 40; c++) {
        const angle = (c / 40) * Math.PI * 2 + 0.1;
        const r = STADIUM_RADIUS - 2 - (c % 3) * 1.5;
        const plane = MeshBuilder.CreatePlane(
          "crowd_" + c,
          { size: 1.2 + (c % 2) * 0.4, sideOrientation: 2 },
          scene
        );
        plane.position.set(Math.cos(angle) * r, 0.5 + (c % 4) * 0.3, Math.sin(angle) * r);
        plane.rotation.y = -angle;
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        plane.material = crowdMat;
        crowdPlanes.push(plane);
      }

      // LED screens with GarmonPay branding
      const ledWidth = 8;
      const ledHeight = 2;
      const ledScreen = MeshBuilder.CreatePlane("ledScreen", { width: ledWidth, height: ledHeight }, scene);
      ledScreen.position.set(0, STADIUM_HEIGHT - 1, -STADIUM_RADIUS + 2);
      ledScreen.rotation.x = Math.PI / 2 - 0.15;
      const ledTexture = new DynamicTexture("ledTex", { width: 256, height: 64 }, scene, false);
      ledTexture.hasAlpha = true;
      const ledCtx = ledTexture.getContext() as CanvasRenderingContext2D;
      ledCtx.fillStyle = "#0a0a14";
      ledCtx.fillRect(0, 0, 256, 64);
      ledCtx.fillStyle = "#00d4ff";
      ledCtx.font = "bold 42px Arial";
      ledCtx.textAlign = "center";
      ledCtx.fillText("GARMONPAY", 128, 42);
      ledTexture.update();
      const ledMat = new StandardMaterial("ledMat", scene);
      ledMat.diffuseTexture = ledTexture;
      ledMat.emissiveTexture = ledTexture;
      ledMat.emissiveColor = new Color3(0.15, 0.5, 0.6);
      ledScreen.material = ledMat;

      // Second LED strip (side)
      const ledScreen2 = MeshBuilder.CreatePlane("ledScreen2", { width: 6, height: 1.5 }, scene);
      ledScreen2.position.set(-STADIUM_RADIUS + 1.5, STADIUM_HEIGHT - 2, 0);
      ledScreen2.rotation.y = Math.PI / 2;
      ledScreen2.rotation.x = Math.PI / 2 - 0.1;
      ledScreen2.material = ledMat;

      // Neon / key lights
      const dirLight = new DirectionalLight(
        "dirLight",
        new Vector3(-2, -5, -2),
        scene
      );
      dirLight.position = new Vector3(10, 20, 10);
      dirLight.intensity = 1.2;
      dirLight.diffuse = new Color3(1, 0.98, 0.95);
      dirLight.specular = new Color3(0.4, 0.4, 0.45);

      const hemi = new HemisphericLight(
        "hemi",
        new Vector3(0, 1, 0),
        scene
      );
      hemi.intensity = 0.6;
      hemi.diffuse = new Color3(0.6, 0.55, 0.65);
      hemi.groundColor = new Color3(0.15, 0.1, 0.2);

      const neonRed = new PointLight("neonRed", new Vector3(-half - 1, POST_HEIGHT, -half - 1), scene);
      neonRed.intensity = 80;
      neonRed.diffuse = new Color3(1, 0.2, 0.25);
      const neonBlue = new PointLight("neonBlue", new Vector3(half + 1, POST_HEIGHT, -half - 1), scene);
      neonBlue.intensity = 80;
      neonBlue.diffuse = new Color3(0.2, 0.4, 1);

      // Shadows
      const shadowGen = new ShadowGenerator(1024, dirLight);
      shadowGen.useBlurExponentialShadowMap = true;
      shadowGen.blurKernel = 32;
      [platform, canvasFloor].forEach((m) => shadowGen.addShadowCaster(m));
      posts.forEach((m) => shadowGen.addShadowCaster(m));
      ropeSegments.forEach((m) => shadowGen.addShadowCaster(m));
      [platform, canvasFloor].forEach((m) => { m.receiveShadows = true; });

      // Arena floor (beyond ring)
      const arenaFloor = MeshBuilder.CreateGround(
        "arenaFloor",
        { width: STADIUM_RADIUS * 2.2, height: STADIUM_RADIUS * 2.2, subdivisions: 8 },
        scene
      );
      arenaFloor.position.y = -0.5;
      const floorMat = new StandardMaterial("arenaFloorMat", scene);
      floorMat.diffuseColor = new Color3(0.06, 0.05, 0.08);
      floorMat.specularColor = new Color3(0.02, 0.02, 0.02);
      arenaFloor.material = floorMat;
      arenaFloor.receiveShadows = true;

      // Atmosphere particles
      const particleSystem = new ParticleSystem("arenaDust", 400, scene);
      particleSystem.particleTexture = new Texture("https://www.babylonjs.com/assets/Flare.png", scene);
      particleSystem.emitter = new Vector3(0, 2, 0);
      particleSystem.minEmitBox = new Vector3(-RING_SIZE, 0, -RING_SIZE);
      particleSystem.maxEmitBox = new Vector3(RING_SIZE, 1, RING_SIZE);
      particleSystem.color1 = new Color4(0.7, 0.7, 0.8, 0.06);
      particleSystem.color2 = new Color4(0.5, 0.5, 0.6, 0);
      particleSystem.minSize = 0.12;
      particleSystem.maxSize = 0.35;
      particleSystem.minLifeTime = 2;
      particleSystem.maxLifeTime = 5;
      particleSystem.emitRate = 15;
      particleSystem.blendMode = ParticleSystem.BLENDMODE_ONEONE;
      particleSystem.minEmitPower = 0.1;
      particleSystem.maxEmitPower = 0.3;
      particleSystem.updateSpeed = 0.01;
      particleSystem.start();

      // Crowd animation (subtle bounce)
      let crowdTime = 0;
      scene.onBeforeRenderObservable.add(() => {
        crowdTime += 0.02;
        crowdPlanes.forEach((p, i) => {
          p.position.y = 0.5 + (i % 4) * 0.3 + Math.sin(crowdTime + i * 0.5) * 0.03;
        });
      });

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
            if (node.getChildMeshes) {
              node.getChildMeshes().forEach((child) => shadowGen.addShadowCaster(child));
            }
          }
          for (const node of blueCorner.rootNodes) {
            const tn = node as TransformNode;
            tn.position.set(3, 0, 0);
            tn.scaling.setAll(scale);
            tintMeshColor(node as { getChildMeshes?: () => { material?: unknown }[]; material?: unknown }, 0.25, 0.35, 0.95);
            if (node.getChildMeshes) {
              node.getChildMeshes().forEach((child) => shadowGen.addShadowCaster(child));
            }
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
      cameraRef.current = null;
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
        <div className="flex justify-between items-start gap-2">
          <div className="bg-black/70 rounded-xl p-3 min-w-[140px] border border-red-500/30 shadow-lg shadow-red-500/10">
            <p className="text-red-400 font-bold text-sm uppercase tracking-wider">Red Corner</p>
            <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-red-500 transition-all duration-200 rounded-full"
                style={{ width: `${p1Health}%` }}
              />
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-amber-500 transition-all duration-200 rounded-full"
                style={{ width: `${p1Stamina}%` }}
              />
            </div>
          </div>
          <div className="bg-black/80 rounded-xl px-5 py-3 text-center border border-amber-500/40 shadow-lg flex-shrink-0">
            <p className="text-amber-400/90 font-bold text-xs uppercase tracking-widest">Round</p>
            <p className="text-white font-bold text-lg">
              {round} / {TOTAL_ROUNDS}
            </p>
            <p className="text-2xl font-mono font-bold text-amber-300 tabular-nums">{roundTimeLeft}s</p>
          </div>
          <div className="bg-black/70 rounded-xl p-3 min-w-[140px] text-right border border-blue-500/30 shadow-lg shadow-blue-500/10">
            <p className="text-blue-400 font-bold text-sm uppercase tracking-wider">Blue Corner</p>
            <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-blue-500 transition-all duration-200 rounded-full ml-auto"
                style={{ width: `${p2Health}%` }}
              />
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-amber-500 transition-all duration-200 rounded-full ml-auto"
                style={{ width: `${p2Stamina}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-center items-center gap-2 pointer-events-auto">
          <span className="text-xs text-white/70">Camera:</span>
          {[
            { label: "Broadcast", alpha: -Math.PI / 2, beta: Math.PI / 2.4, radius: 28 },
            { label: "Side", alpha: -Math.PI / 2, beta: Math.PI / 2.1, radius: 22 },
            { label: "Corner", alpha: -Math.PI / 2 - 0.3, beta: Math.PI / 2.3, radius: 20 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/20 border border-white/20"
              onClick={() => {
                const cam = cameraRef.current;
                if (cam) {
                  cam.alpha = preset.alpha;
                  cam.beta = preset.beta;
                  cam.radius = preset.radius;
                }
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex justify-center gap-6 text-xs text-white/80 flex-wrap">
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
