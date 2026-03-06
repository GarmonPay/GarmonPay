"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSessionAsync } from "@/lib/session";

type FighterAction = "idle" | "jab" | "punch" | "block";
type FighterSlot = 1 | 2;

type RoomConfig = {
  roomId: string;
  multiplayer: boolean;
  localPlayer: FighterSlot;
  player1Id: string;
  player2Id: string;
  betAmount: number;
};

type WsEnvelope =
  | {
      type: "join";
      roomId: string;
      clientId: string;
      playerSlot: FighterSlot;
    }
  | {
      type: "state";
      roomId: string;
      clientId: string;
      playerSlot: FighterSlot;
      health: number;
      stamina: number;
      action: FighterAction;
      blocking: boolean;
      x: number;
      z: number;
      round: number;
      timeLeft: number;
    }
  | {
      type: "result";
      roomId: string;
      clientId: string;
      winnerSlot: FighterSlot;
      reason: string;
    };

type RuntimeFighter = {
  slot: FighterSlot;
  userId: string;
  root: any;
  torso: any;
  head: any;
  leftGlove: any;
  rightGlove: any;
  aggregate: any;
  health: number;
  stamina: number;
  action: FighterAction;
  actionClock: number;
  hasHit: boolean;
  blocking: boolean;
  blockHeld: boolean;
  isLocallyControlled: boolean;
  spawnX: number;
  spawnZ: number;
  facing: number;
};

type HudState = {
  p1Health: number;
  p2Health: number;
  p1Stamina: number;
  p2Stamina: number;
  round: number;
  timeLeft: number;
  winnerLabel: string | null;
  matchState: "ready" | "fighting" | "ended";
  socketState: "offline" | "connecting" | "online";
  syncNote: string;
};

const ROUND_LENGTH = 60;
const TOTAL_ROUNDS = 3;
const RING_LIMIT = 4.8;
const MOVE_SPEED = 3.2;
const JAB_COST = 9;
const PUNCH_COST = 18;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Math.random().toString(36).slice(2, 10)}`;
}

function parseRoomConfig(): RoomConfig {
  if (typeof window === "undefined") {
    return {
      roomId: "local-ring",
      multiplayer: false,
      localPlayer: 1,
      player1Id: "player1",
      player2Id: "player2",
      betAmount: 100,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const player = params.get("player") === "2" ? 2 : 1;
  const multiplayer = params.get("multiplayer") === "1";
  const roomId = params.get("room")?.trim() || "local-ring";
  const player1Id = params.get("p1")?.trim() || "player1";
  const player2Id = params.get("p2")?.trim() || "player2";
  const rawBet = Number(params.get("bet") ?? 100);
  const betAmount = Number.isFinite(rawBet) ? Math.max(1, Math.round(rawBet)) : 100;

  return {
    roomId,
    multiplayer,
    localPlayer: player,
    player1Id,
    player2Id,
    betAmount,
  };
}

function getWsUrl() {
  return process.env.NEXT_PUBLIC_BOXING_WS_URL ?? "";
}

export function BoxingGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const fightersRef = useRef<Record<FighterSlot, RuntimeFighter> | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const gameOverRef = useRef(false);
  const resultSentRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef(createClientId());
  const roundRef = useRef(1);
  const timeLeftRef = useRef(ROUND_LENGTH);
  const wsLastBroadcastRef = useRef(0);
  const hudTickRef = useRef(0);
  const socketStateRef = useRef<HudState["socketState"]>("offline");

  const roomConfig = useMemo(parseRoomConfig, []);

  const [hud, setHud] = useState<HudState>({
    p1Health: 100,
    p2Health: 100,
    p1Stamina: 100,
    p2Stamina: 100,
    round: 1,
    timeLeft: ROUND_LENGTH,
    winnerLabel: null,
    matchState: "ready",
    socketState: "offline",
    syncNote: roomConfig.multiplayer ? "Waiting for WebSocket…" : "Local two-player mode",
  });

  useEffect(() => {
    socketStateRef.current = hud.socketState;
  }, [hud.socketState]);

  useEffect(() => {
    let disposed = false;
    let cleanupScene: (() => void) | null = null;

    const postResult = async (winnerSlot: FighterSlot) => {
      if (resultSentRef.current) return;
      resultSentRef.current = true;

      const winnerId = winnerSlot === 1 ? roomConfig.player1Id : roomConfig.player2Id;
      const loserId = winnerSlot === 1 ? roomConfig.player2Id : roomConfig.player1Id;
      const session = await getSessionAsync();

      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (session?.accessToken) {
        headers.authorization = `Bearer ${session.accessToken}`;
      } else if (session?.userId) {
        headers["x-user-id"] = session.userId;
      }

      try {
        const response = await fetch("/api/games/boxing/result", {
          method: "POST",
          headers,
          body: JSON.stringify({
            winner_id: winnerId,
            loser_id: loserId,
            bet_amount: roomConfig.betAmount,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({ message: "Unknown API error" }));
          setHud((prev) => ({
            ...prev,
            syncNote: `Result sync failed: ${body.message ?? "Unknown error"}`,
          }));
          return;
        }

        setHud((prev) => ({
          ...prev,
          syncNote: "Result synced to /api/games/boxing/result",
        }));
      } catch {
        setHud((prev) => ({
          ...prev,
          syncNote: "Result sync failed: network error",
        }));
      }
    };

    const endMatch = async (winnerSlot: FighterSlot, reason: string) => {
      if (gameOverRef.current) return;
      gameOverRef.current = true;

      const fighters = fightersRef.current;
      if (fighters) {
        fighters[1].aggregate.body.setLinearVelocity(fighters[1].aggregate.body.getLinearVelocity().scale(0));
        fighters[2].aggregate.body.setLinearVelocity(fighters[2].aggregate.body.getLinearVelocity().scale(0));
      }

      setHud((prev) => ({
        ...prev,
        winnerLabel: winnerSlot === 1 ? "Player 1 wins" : "Player 2 wins",
        matchState: "ended",
        syncNote: reason,
      }));

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const payload: WsEnvelope = {
          type: "result",
          roomId: roomConfig.roomId,
          clientId: clientIdRef.current,
          winnerSlot,
          reason,
        };
        ws.send(JSON.stringify(payload));
      }

      await postResult(winnerSlot);
    };

    const initialize = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const BABYLON = await import("@babylonjs/core");
      await import("@babylonjs/loaders");
      const HavokPhysics = (await import("@babylonjs/havok")).default;
      const { HavokPlugin } = await import("@babylonjs/core/Physics/v2/Plugins/havokPlugin");
      const { PhysicsAggregate } = await import("@babylonjs/core/Physics/v2/physicsAggregate");
      const { PhysicsShapeType } = await import("@babylonjs/core/Physics/v2/IPhysicsEnginePlugin");

      if (disposed) return;

      const engine = new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      engineRef.current = engine;

      const scene = new BABYLON.Scene(engine);
      sceneRef.current = scene;
      scene.clearColor = new BABYLON.Color4(0.04, 0.05, 0.08, 1);

      const camera = new BABYLON.ArcRotateCamera(
        "camera",
        Math.PI / 2,
        1.0,
        17,
        new BABYLON.Vector3(0, 1.5, 0),
        scene
      );
      camera.lowerRadiusLimit = 12;
      camera.upperRadiusLimit = 23;
      camera.wheelDeltaPercentage = 0.01;
      camera.attachControl(canvas, true);

      const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
      hemi.intensity = 0.8;
      const keyLight = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.4, -1, 0.3), scene);
      keyLight.position = new BABYLON.Vector3(0, 14, -8);
      keyLight.intensity = 0.6;

      const ringMat = new BABYLON.StandardMaterial("ring-mat", scene);
      ringMat.diffuseColor = new BABYLON.Color3(0.8, 0.82, 0.88);
      ringMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

      const apronMat = new BABYLON.StandardMaterial("apron-mat", scene);
      apronMat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.16);

      const ropeMat = new BABYLON.StandardMaterial("rope-mat", scene);
      ropeMat.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1);

      const postMat = new BABYLON.StandardMaterial("post-mat", scene);
      postMat.diffuseColor = new BABYLON.Color3(0.25, 0.25, 0.3);

      const p1Mat = new BABYLON.StandardMaterial("p1-mat", scene);
      p1Mat.diffuseColor = new BABYLON.Color3(0.16, 0.5, 0.95);
      const p2Mat = new BABYLON.StandardMaterial("p2-mat", scene);
      p2Mat.diffuseColor = new BABYLON.Color3(0.9, 0.25, 0.2);
      const skinMat = new BABYLON.StandardMaterial("skin-mat", scene);
      skinMat.diffuseColor = new BABYLON.Color3(0.9, 0.73, 0.64);

      const ring = BABYLON.MeshBuilder.CreateBox(
        "ring-base",
        { width: 12, depth: 12, height: 0.6 },
        scene
      );
      ring.position.y = 0;
      ring.material = apronMat;

      const ringCanvas = BABYLON.MeshBuilder.CreateGround(
        "ring-canvas",
        { width: 10.2, height: 10.2 },
        scene
      );
      ringCanvas.position.y = 0.35;
      ringCanvas.material = ringMat;

      const crowd = BABYLON.MeshBuilder.CreateGround("crowd-floor", { width: 30, height: 30 }, scene);
      crowd.position.y = -0.02;
      const crowdMat = new BABYLON.StandardMaterial("crowd-mat", scene);
      crowdMat.diffuseColor = new BABYLON.Color3(0.07, 0.08, 0.11);
      crowd.material = crowdMat;

      const postPositions = [
        new BABYLON.Vector3(5.2, 1.2, 5.2),
        new BABYLON.Vector3(5.2, 1.2, -5.2),
        new BABYLON.Vector3(-5.2, 1.2, 5.2),
        new BABYLON.Vector3(-5.2, 1.2, -5.2),
      ];
      postPositions.forEach((position, index) => {
        const post = BABYLON.MeshBuilder.CreateCylinder(
          `post-${index}`,
          { height: 2.6, diameter: 0.3 },
          scene
        );
        post.position = position;
        post.material = postMat;
      });

      const ropeHeights = [0.95, 1.25, 1.55];
      const ropeLength = 10.4;
      ropeHeights.forEach((y, i) => {
        const north = BABYLON.MeshBuilder.CreateBox(
          `rope-n-${i}`,
          { width: ropeLength, depth: 0.08, height: 0.08 },
          scene
        );
        north.position.set(0, y, -5.2);
        north.material = ropeMat;
        const south = north.clone(`rope-s-${i}`);
        south.position.z = 5.2;
        const west = BABYLON.MeshBuilder.CreateBox(
          `rope-w-${i}`,
          { width: 0.08, depth: ropeLength, height: 0.08 },
          scene
        );
        west.position.set(-5.2, y, 0);
        west.material = ropeMat;
        const east = west.clone(`rope-e-${i}`);
        east.position.x = 5.2;
      });

      const wallData = [
        { name: "north-wall", w: 10.7, d: 0.4, x: 0, z: -5.55 },
        { name: "south-wall", w: 10.7, d: 0.4, x: 0, z: 5.55 },
        { name: "west-wall", w: 0.4, d: 10.7, x: -5.55, z: 0 },
        { name: "east-wall", w: 0.4, d: 10.7, x: 5.55, z: 0 },
      ];
      const boundaryWalls = wallData.map((item) => {
        const wall = BABYLON.MeshBuilder.CreateBox(
          item.name,
          { width: item.w, depth: item.d, height: 2.4 },
          scene
        );
        wall.position.set(item.x, 1.2, item.z);
        wall.isVisible = false;
        return wall;
      });

      const hk = await HavokPhysics();
      scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), new HavokPlugin(true, hk));

      new PhysicsAggregate(
        ring,
        PhysicsShapeType.BOX,
        { mass: 0, friction: 0.9, restitution: 0.1 },
        scene
      );
      new PhysicsAggregate(
        ringCanvas,
        PhysicsShapeType.BOX,
        { mass: 0, friction: 0.9, restitution: 0.1 },
        scene
      );
      boundaryWalls.forEach((wall) => {
        new PhysicsAggregate(
          wall,
          PhysicsShapeType.BOX,
          { mass: 0, friction: 0.9, restitution: 0.05 },
          scene
        );
      });

      const createFighter = (
        slot: FighterSlot,
        userId: string,
        x: number,
        z: number,
        facing: number,
        bodyMat: any
      ): RuntimeFighter => {
        const root = BABYLON.MeshBuilder.CreateCapsule(
          `fighter-${slot}`,
          { height: 2.1, radius: 0.38, tessellation: 10 },
          scene
        );
        root.position = new BABYLON.Vector3(x, 1.4, z);
        root.rotation = new BABYLON.Vector3(0, facing === 1 ? 0 : Math.PI, 0);
        root.visibility = 0;

        const torso = BABYLON.MeshBuilder.CreateBox(
          `torso-${slot}`,
          { width: 0.95, height: 1.0, depth: 0.55 },
          scene
        );
        torso.parent = root;
        torso.position.y = 0.15;
        torso.material = bodyMat;

        const head = BABYLON.MeshBuilder.CreateSphere(
          `head-${slot}`,
          { diameter: 0.48, segments: 16 },
          scene
        );
        head.parent = root;
        head.position.y = 0.9;
        head.material = skinMat;

        const leftGlove = BABYLON.MeshBuilder.CreateSphere(
          `left-glove-${slot}`,
          { diameter: 0.28, segments: 12 },
          scene
        );
        leftGlove.parent = root;
        leftGlove.position.set(-0.38, 0.4, 0.34);
        leftGlove.material = bodyMat;

        const rightGlove = BABYLON.MeshBuilder.CreateSphere(
          `right-glove-${slot}`,
          { diameter: 0.28, segments: 12 },
          scene
        );
        rightGlove.parent = root;
        rightGlove.position.set(0.38, 0.4, 0.34);
        rightGlove.material = bodyMat;

        const aggregate = new PhysicsAggregate(
          root,
          PhysicsShapeType.CAPSULE,
          { mass: 70, friction: 0.95, restitution: 0.02 },
          scene
        );
        aggregate.body.setLinearDamping(5);
        aggregate.body.setAngularDamping(10);

        return {
          slot,
          userId,
          root,
          torso,
          head,
          leftGlove,
          rightGlove,
          aggregate,
          health: 100,
          stamina: 100,
          action: "idle",
          actionClock: 0,
          hasHit: false,
          blocking: false,
          blockHeld: false,
          isLocallyControlled: !roomConfig.multiplayer || roomConfig.localPlayer === slot,
          spawnX: x,
          spawnZ: z,
          facing,
        };
      };

      const fighter1 = createFighter(1, roomConfig.player1Id, -1.2, -2.7, 1, p1Mat);
      const fighter2 = createFighter(2, roomConfig.player2Id, 1.2, 2.7, -1, p2Mat);
      fightersRef.current = { 1: fighter1, 2: fighter2 };

      const actionKeyMap: Record<string, { slot: FighterSlot; action: FighterAction } | undefined> = {
        j: { slot: 1, action: "jab" },
        k: { slot: 1, action: "punch" },
        l: { slot: 1, action: "block" },
        "1": { slot: 2, action: "jab" },
        "2": { slot: 2, action: "punch" },
        "3": { slot: 2, action: "block" },
        numpad1: { slot: 2, action: "jab" },
        numpad2: { slot: 2, action: "punch" },
        numpad3: { slot: 2, action: "block" },
      };

      const sendWs = (payload: WsEnvelope) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify(payload));
      };

      const setAttackAction = (attacker: RuntimeFighter, action: "jab" | "punch") => {
        if (attacker.action === "jab" || attacker.action === "punch") return;

        const staminaCost = action === "jab" ? JAB_COST : PUNCH_COST;
        if (attacker.stamina < staminaCost) return;

        attacker.stamina = clamp(attacker.stamina - staminaCost, 0, 100);
        attacker.action = action;
        attacker.actionClock = 0;
        attacker.hasHit = false;
        attacker.blocking = false;
      };

      const handlePressedAction = (slot: FighterSlot, action: FighterAction) => {
        const fighters = fightersRef.current;
        if (!fighters || gameOverRef.current) return;
        const fighter = fighters[slot];
        if (!fighter || !fighter.isLocallyControlled) return;

        if (action === "jab" || action === "punch") {
          setAttackAction(fighter, action);
        }
        if (action === "block") {
          fighter.blockHeld = true;
        }
      };

      const onKeyDown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (!keysRef.current[key]) {
          const mapped = actionKeyMap[key];
          if (mapped) {
            handlePressedAction(mapped.slot, mapped.action);
          }
        }
        keysRef.current[key] = true;
      };

      const onKeyUp = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        keysRef.current[key] = false;
        if (key === "l" && fightersRef.current) fightersRef.current[1].blockHeld = false;
        if ((key === "3" || key === "numpad3") && fightersRef.current) fightersRef.current[2].blockHeld = false;
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      const moveInputForSlot = (slot: FighterSlot) => {
        const k = keysRef.current;
        if (slot === 1) {
          return {
            x: (k.d ? 1 : 0) - (k.a ? 1 : 0),
            z: (k.w ? 1 : 0) - (k.s ? 1 : 0),
          };
        }
        return {
          x: (k.arrowright ? 1 : 0) - (k.arrowleft ? 1 : 0),
          z: (k.arrowup ? -1 : 0) - (k.arrowdown ? -1 : 0),
        };
      };

      const tryApplyDamage = (attacker: RuntimeFighter, defender: RuntimeFighter) => {
        if (attacker.hasHit) return;
        const distance = BABYLON.Vector3.Distance(attacker.root.position, defender.root.position);
        const isJab = attacker.action === "jab";
        const reach = isJab ? 2.0 : 2.35;
        if (distance > reach) return;

        let damage = isJab ? 8 : 15;
        if (defender.blocking) {
          damage = Math.ceil(damage * 0.35);
          defender.stamina = clamp(defender.stamina - (isJab ? 5 : 8), 0, 100);
        }

        defender.health = clamp(defender.health - damage, 0, 100);
        attacker.hasHit = true;
      };

      const applyAnimationPose = (fighter: RuntimeFighter, elapsed: number) => {
        const idleSwing = Math.sin(elapsed * 2.1 + fighter.slot) * 0.04;
        fighter.torso.rotation.x = idleSwing * 0.3;
        fighter.leftGlove.position.set(-0.38, 0.38 + idleSwing, 0.34);
        fighter.rightGlove.position.set(0.38, 0.38 - idleSwing, 0.34);

        if (fighter.action === "block" || fighter.blocking) {
          fighter.leftGlove.position.set(-0.24, 0.68, 0.35);
          fighter.rightGlove.position.set(0.24, 0.68, 0.35);
          fighter.torso.rotation.x = -0.05;
          return;
        }

        if (fighter.action === "jab") {
          const t = clamp(fighter.actionClock / 0.26, 0, 1);
          const punchOut = Math.sin(t * Math.PI);
          fighter.leftGlove.position.set(-0.32, 0.43, 0.34 + punchOut * 0.95);
          fighter.rightGlove.position.set(0.38, 0.34, 0.26);
          fighter.torso.rotation.y = 0.12 * punchOut * fighter.facing;
          return;
        }

        if (fighter.action === "punch") {
          const t = clamp(fighter.actionClock / 0.42, 0, 1);
          const punchOut = Math.sin(t * Math.PI);
          fighter.rightGlove.position.set(0.25, 0.4, 0.34 + punchOut * 1.25);
          fighter.leftGlove.position.set(-0.34, 0.42, 0.3);
          fighter.torso.rotation.y = -0.2 * punchOut * fighter.facing;
        }
      };

      const startNetwork = () => {
        if (!roomConfig.multiplayer) {
          setHud((prev) => ({ ...prev, socketState: "offline", syncNote: "Local two-player mode" }));
          return;
        }

        const wsUrl = getWsUrl();
        if (!wsUrl) {
          setHud((prev) => ({
            ...prev,
            socketState: "offline",
            syncNote: "Multiplayer requested, but NEXT_PUBLIC_BOXING_WS_URL is not configured.",
          }));
          return;
        }

        setHud((prev) => ({ ...prev, socketState: "connecting", syncNote: "Connecting to match server…" }));
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.addEventListener("open", () => {
          setHud((prev) => ({ ...prev, socketState: "online", syncNote: `Connected room: ${roomConfig.roomId}` }));
          const joinPayload: WsEnvelope = {
            type: "join",
            roomId: roomConfig.roomId,
            clientId: clientIdRef.current,
            playerSlot: roomConfig.localPlayer,
          };
          ws.send(JSON.stringify(joinPayload));
        });

        ws.addEventListener("close", () => {
          setHud((prev) => ({
            ...prev,
            socketState: "offline",
            syncNote: "Disconnected from WebSocket server.",
          }));
        });

        ws.addEventListener("message", (event) => {
          const fighters = fightersRef.current;
          if (!fighters) return;

          let packet: WsEnvelope | null = null;
          try {
            packet = JSON.parse(String(event.data)) as WsEnvelope;
          } catch {
            return;
          }
          if (!packet || packet.roomId !== roomConfig.roomId) return;
          if (packet.clientId === clientIdRef.current) return;

          if (packet.type === "state") {
            const remoteSlot = packet.playerSlot;
            const remote = fighters[remoteSlot];
            if (!remote) return;
            remote.root.position.x = clamp(packet.x, -RING_LIMIT, RING_LIMIT);
            remote.root.position.z = clamp(packet.z, -RING_LIMIT, RING_LIMIT);
            remote.health = clamp(packet.health, 0, 100);
            remote.stamina = clamp(packet.stamina, 0, 100);
            remote.action = packet.action;
            remote.blocking = packet.blocking;
            roundRef.current = packet.round;
            timeLeftRef.current = packet.timeLeft;
          }

          if (packet.type === "result") {
            void endMatch(packet.winnerSlot, `Remote end: ${packet.reason}`);
          }
        });
      };

      startNetwork();

      setHud((prev) => ({ ...prev, matchState: "fighting" }));
      let elapsedTotal = 0;
      scene.onBeforeRenderObservable.add(() => {
        if (gameOverRef.current || !fightersRef.current) return;
        const dt = engine.getDeltaTime() / 1000;
        elapsedTotal += dt;

        const fighters = fightersRef.current;
        const p1 = fighters[1];
        const p2 = fighters[2];

        const fighterList = [p1, p2] as RuntimeFighter[];
        fighterList.forEach((fighter) => {
          const opponent = fighter.slot === 1 ? p2 : p1;

          if (fighter.isLocallyControlled) {
            const move = moveInputForSlot(fighter.slot);
            const moveLength = Math.hypot(move.x, move.z) || 1;
            const nx = move.x / moveLength;
            const nz = move.z / moveLength;

            const yVel = fighter.aggregate.body.getLinearVelocity().y ?? 0;
            fighter.aggregate.body.setLinearVelocity(
              new BABYLON.Vector3(nx * MOVE_SPEED, yVel, nz * MOVE_SPEED)
            );

            fighter.root.position.x = clamp(fighter.root.position.x, -RING_LIMIT, RING_LIMIT);
            fighter.root.position.z = clamp(fighter.root.position.z, -RING_LIMIT, RING_LIMIT);

            if (fighter.blockHeld && fighter.stamina > 0) {
              fighter.blocking = true;
              fighter.action = "block";
              fighter.stamina = clamp(fighter.stamina - dt * 9, 0, 100);
            } else {
              fighter.blocking = false;
              if (fighter.action === "block") fighter.action = "idle";
            }

            if (fighter.action === "jab") {
              fighter.actionClock += dt;
              if (fighter.actionClock >= 0.12) {
                tryApplyDamage(fighter, opponent);
              }
              if (fighter.actionClock >= 0.26) {
                fighter.action = "idle";
                fighter.actionClock = 0;
              }
            } else if (fighter.action === "punch") {
              fighter.actionClock += dt;
              if (fighter.actionClock >= 0.2) {
                tryApplyDamage(fighter, opponent);
              }
              if (fighter.actionClock >= 0.42) {
                fighter.action = "idle";
                fighter.actionClock = 0;
              }
            } else {
              fighter.stamina = clamp(fighter.stamina + dt * 12, 0, 100);
            }

            if (
              roomConfig.multiplayer &&
              socketStateRef.current === "online" &&
              elapsedTotal - wsLastBroadcastRef.current > 0.08
            ) {
              wsLastBroadcastRef.current = elapsedTotal;
              sendWs({
                type: "state",
                roomId: roomConfig.roomId,
                clientId: clientIdRef.current,
                playerSlot: fighter.slot,
                health: fighter.health,
                stamina: fighter.stamina,
                action: fighter.action,
                blocking: fighter.blocking,
                x: fighter.root.position.x,
                z: fighter.root.position.z,
                round: roundRef.current,
                timeLeft: timeLeftRef.current,
              });
            }
          } else {
            fighter.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
          }

          fighter.root.rotation.y = fighter.facing === 1 ? 0 : Math.PI;
          fighter.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
          applyAnimationPose(fighter, elapsedTotal);
        });

        timeLeftRef.current = clamp(timeLeftRef.current - dt, 0, ROUND_LENGTH);
        if (timeLeftRef.current <= 0) {
          if (roundRef.current < TOTAL_ROUNDS) {
            roundRef.current += 1;
            timeLeftRef.current = ROUND_LENGTH;
            p1.root.position.x = p1.spawnX;
            p1.root.position.z = p1.spawnZ;
            p2.root.position.x = p2.spawnX;
            p2.root.position.z = p2.spawnZ;
            p1.stamina = clamp(p1.stamina + 20, 0, 100);
            p2.stamina = clamp(p2.stamina + 20, 0, 100);
          } else {
            const winner: FighterSlot =
              p1.health === p2.health ? (p1.stamina >= p2.stamina ? 1 : 2) : p1.health > p2.health ? 1 : 2;
            void endMatch(winner, "Decision after 3 rounds");
          }
        }

        if (p1.health <= 0) {
          void endMatch(2, "Player 1 knocked out");
        } else if (p2.health <= 0) {
          void endMatch(1, "Player 2 knocked out");
        }

        hudTickRef.current += dt;
        if (hudTickRef.current > 0.05) {
          hudTickRef.current = 0;
          setHud((prev) => ({
            ...prev,
            p1Health: Math.round(p1.health),
            p2Health: Math.round(p2.health),
            p1Stamina: Math.round(p1.stamina),
            p2Stamina: Math.round(p2.stamina),
            round: roundRef.current,
            timeLeft: Math.ceil(timeLeftRef.current),
          }));
        }
      });

      engine.runRenderLoop(() => {
        if (!disposed) scene.render();
      });

      const handleResize = () => engine.resize();
      window.addEventListener("resize", handleResize);

      cleanupScene = () => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        wsRef.current?.close();
        wsRef.current = null;
        fightersRef.current = null;
        scene.dispose();
        engine.dispose();
      };
    };

    void initialize();

    return () => {
      disposed = true;
      cleanupScene?.();
    };
  }, [roomConfig]);

  return (
    <div className="relative h-[calc(100vh-1rem)] min-h-[700px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#05070d]">
      <canvas ref={canvasRef} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
        <div className="mx-auto max-w-5xl space-y-2 rounded-xl border border-white/15 bg-black/45 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2 text-xs text-white/80 sm:text-sm">
            <span>Room: {roomConfig.roomId}</span>
            <span>Round {hud.round}/{TOTAL_ROUNDS}</span>
            <span>{hud.timeLeft}s</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-white sm:text-sm">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Player 1 Health</span>
                <span>{hud.p1Health}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${hud.p1Health}%` }} />
              </div>
              <div className="flex justify-between">
                <span>Stamina</span>
                <span>{hud.p1Stamina}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-cyan-400 transition-all" style={{ width: `${hud.p1Stamina}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Player 2 Health</span>
                <span>{hud.p2Health}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${hud.p2Health}%` }} />
              </div>
              <div className="flex justify-between">
                <span>Stamina</span>
                <span>{hud.p2Stamina}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-cyan-400 transition-all" style={{ width: `${hud.p2Stamina}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-2 left-2 z-20 max-w-[330px] rounded-lg border border-white/15 bg-black/60 p-3 text-xs text-white/85 sm:text-sm">
        <p className="font-semibold text-white">Controls</p>
        <p className="mt-1">P1: WASD move, J jab, K power punch, L block</p>
        <p>P2: Arrow keys move, 1 jab, 2 power punch, 3 block</p>
        <p className="mt-2 text-white/70">
          WebSocket: {hud.socketState} · {hud.syncNote}
        </p>
      </div>

      {hud.winnerLabel && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-md rounded-xl border border-green-400/40 bg-[#0b1020]/95 p-6 text-center shadow-xl">
            <p className="text-2xl font-bold text-green-300">{hud.winnerLabel}</p>
            <p className="mt-2 text-sm text-white/80">Match ended. Wallet result sync has been triggered.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BoxingPage() {
  return (
    <main className="min-h-screen bg-[#03050b] p-2 sm:p-4">
      <BoxingGame />
    </main>
  );
}
