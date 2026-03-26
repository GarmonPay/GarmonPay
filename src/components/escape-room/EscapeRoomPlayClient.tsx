"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as THREE from "three";
import { getSessionAsync } from "@/lib/session";
import { BannerRotator } from "@/components/banners/BannerRotator";

type StartPayload = {
  session: {
    id: string;
    mode: "free" | "stake";
    stake_cents: number;
    started_at: string;
    countdown_seconds: number;
    prize_pool_window: string;
  };
  puzzle: {
    id: string;
    puzzle_name: string;
    clue_transaction_id: string;
    clue_formula: string;
    clue_terminal_text: string | null;
    clue_cabinet_text: string | null;
    difficulty_level: "easy" | "medium" | "hard" | "expert";
    active_date: string;
    preview_text: string | null;
  };
};

type FinishResponse = {
  ok: boolean;
  session: {
    id: string;
    result: "active" | "win" | "lose" | "timeout" | "voided";
    mode: "free" | "stake";
    stake_cents: number;
    escape_time_seconds: number | null;
    server_elapsed_seconds: number | null;
    projected_payout_cents: number;
    payout_cents: number;
  };
  standing: {
    rank: number;
    projectedPayoutCents: number;
    escapeTimeSeconds: number;
  } | null;
};

type PuzzleTarget = "terminal" | "cabinet" | "keypad" | null;

function cents(n: number) {
  return `$${(Number(n || 0) / 100).toFixed(2)}`;
}

function mmss(total: number) {
  const safe = Math.max(0, Math.floor(total));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function shareResultText(result: FinishResponse, fallbackElapsed: number) {
  const time = mmss(result.session.escape_time_seconds ?? fallbackElapsed);
  const payout = result.session.payout_cents || result.session.projected_payout_cents || 0;
  const rank = result.standing?.rank;
  return `I escaped the GarmonPay Stake & Escape vault in ${time}${
    rank ? ` (rank #${rank})` : ""
  } and earned ${cents(payout)}.`;
}

export function EscapeRoomPlayClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const frameRef = useRef<number | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const moveRef = useRef({ up: false, down: false, left: false, right: false });
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const objectPointsRef = useRef<
    Record<"terminal" | "cabinet" | "keypad", { pos: THREE.Vector3; lookAt: THREE.Vector3 }>
  >({
    terminal: { pos: new THREE.Vector3(-2, 1.2, -2), lookAt: new THREE.Vector3(0, 1.2, 0) },
    cabinet: { pos: new THREE.Vector3(2.2, 1.2, -1.5), lookAt: new THREE.Vector3(0, 1.2, 0) },
    keypad: { pos: new THREE.Vector3(0, 1.2, -4), lookAt: new THREE.Vector3(0, 1.4, -5.7) },
  });

  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startPayload, setStartPayload] = useState<StartPayload | null>(null);

  const [terminalFound, setTerminalFound] = useState(false);
  const [cabinetFound, setCabinetFound] = useState(false);
  const [keypadSolved, setKeypadSolved] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");

  const [focusedObject, setFocusedObject] = useState<PuzzleTarget>(null);
  const [showPuzzleModal, setShowPuzzleModal] = useState(false);
  const [touchDragging, setTouchDragging] = useState(false);

  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [finishing, setFinishing] = useState(false);
  const [result, setResult] = useState<FinishResponse | null>(null);
  const [shareDone, setShareDone] = useState(false);

  const sessionId = searchParams.get("session") ?? "";

  const progressCount = Number(terminalFound) + Number(cabinetFound) + Number(keypadSolved);

  const tokenHeaders = useRef<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await getSessionAsync();
        if (!session) {
          router.replace("/login?next=/escape-room");
          return;
        }
        tokenHeaders.current = session.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : { "X-User-Id": session.userId };

        const raw = sessionStorage.getItem("escapeRoomStart");
        if (!raw) {
          throw new Error("Missing game start context. Return to lobby and enter vault again.");
        }
        const parsed = JSON.parse(raw) as StartPayload;
        if (!parsed?.session?.id || parsed.session.id !== sessionId) {
          throw new Error("Session mismatch. Return to lobby and start a new run.");
        }
        if (!alive) return;
        setStartPayload(parsed);
        setRemainingSeconds(parsed.session.countdown_seconds);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to initialize game");
      } finally {
        if (alive) setAuthLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, sessionId]);

  const timerExpired = remainingSeconds <= 0;

  useEffect(() => {
    if (!startPayload || result || authLoading) return;
    const startedAt = new Date(startPayload.session.started_at).getTime();
    const durationMs = startPayload.session.countdown_seconds * 1000;
    const end = startedAt + durationMs;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      const rem = Math.ceil((end - now) / 1000);
      setRemainingSeconds(Math.max(0, rem));
    }, 250);
    return () => window.clearInterval(interval);
  }, [startPayload, result, authLoading]);

  useEffect(() => {
    if (!timerExpired || result || finishing || !startPayload) return;
    submitFinish("timeout").catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to submit timeout")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerExpired, result, finishing, startPayload]);

  useEffect(() => {
    if (!mountRef.current || authLoading || !startPayload) return;

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c0618");
    scene.fog = new THREE.Fog("#0c0618", 4, 16);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(68, width / Math.max(1, height), 0.1, 100);
    camera.position.set(0, 1.5, 2.5);
    cameraRef.current = camera;

    const ambient = new THREE.AmbientLight("#8b5cf6", 0.45);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight("#ffffff", 0.4);
    dir.position.set(1.5, 3, 2);
    scene.add(dir);
    const neonA = new THREE.PointLight("#8b5cf6", 1.7, 10);
    neonA.position.set(-2, 1.8, -1.5);
    scene.add(neonA);
    const neonB = new THREE.PointLight("#eab308", 1.1, 9);
    neonB.position.set(2.2, 1.5, -3.5);
    scene.add(neonB);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshStandardMaterial({ color: "#140d23", metalness: 0.2, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: "#1a1230", metalness: 0.15, roughness: 0.7 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(9.5, 4.2, 0.4), wallMat);
    backWall.position.set(0, 2.05, -5.7);
    scene.add(backWall);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.2, 11), wallMat);
    leftWall.position.set(-4.9, 2.05, -0.5);
    scene.add(leftWall);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.2, 11), wallMat);
    rightWall.position.set(4.9, 2.05, -0.5);
    scene.add(rightWall);

    const gpFrame = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1, 0.12),
      new THREE.MeshStandardMaterial({ color: "#23163e", emissive: "#4422aa", emissiveIntensity: 0.35 })
    );
    gpFrame.position.set(0, 2.8, -5.45);
    scene.add(gpFrame);

    const vaultDoor = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.8, 0.35),
      new THREE.MeshStandardMaterial({ color: "#3a2a62", metalness: 0.7, roughness: 0.35, emissive: "#8b5cf6", emissiveIntensity: 0.12 })
    );
    vaultDoor.position.set(0, 1.4, -5.35);
    scene.add(vaultDoor);

    const terminal = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.75, 0.4),
      new THREE.MeshStandardMaterial({ color: "#26304a", emissive: "#8b5cf6", emissiveIntensity: 0.24 })
    );
    terminal.position.copy(objectPointsRef.current.terminal.pos);
    scene.add(terminal);

    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.2, 0.75),
      new THREE.MeshStandardMaterial({ color: "#2f2747", emissive: "#eab308", emissiveIntensity: 0.08 })
    );
    cabinet.position.copy(objectPointsRef.current.cabinet.pos);
    scene.add(cabinet);

    const keypad = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.2, 0.22),
      new THREE.MeshStandardMaterial({ color: "#262034", emissive: "#8b5cf6", emissiveIntensity: 0.2 })
    );
    keypad.position.copy(objectPointsRef.current.keypad.pos);
    scene.add(keypad);

    const targetForward = new THREE.Vector3(0, 0, -1);
    const moveSpeed = 2.1;

    const animate = () => {
      const dt = clockRef.current.getDelta();
      const cameraNow = cameraRef.current;
      if (!cameraNow) return;

      const yawObj = new THREE.Object3D();
      yawObj.rotation.y = yawRef.current;
      const forward = targetForward.clone().applyEuler(new THREE.Euler(0, yawRef.current, 0));
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      if (moveRef.current.up) {
        cameraNow.position.addScaledVector(forward, dt * moveSpeed);
      }
      if (moveRef.current.down) {
        cameraNow.position.addScaledVector(forward, -dt * moveSpeed);
      }
      if (moveRef.current.left) {
        cameraNow.position.addScaledVector(right, dt * moveSpeed);
      }
      if (moveRef.current.right) {
        cameraNow.position.addScaledVector(right, -dt * moveSpeed);
      }

      cameraNow.position.x = clamp(cameraNow.position.x, -3.9, 3.9);
      cameraNow.position.z = clamp(cameraNow.position.z, -4.8, 3.8);
      cameraNow.position.y = 1.5;

      cameraNow.rotation.order = "YXZ";
      cameraNow.rotation.y = yawRef.current;
      cameraNow.rotation.x = pitchRef.current;
      cameraNow.rotation.z = 0;

      renderer.render(scene, cameraNow);
      frameRef.current = requestAnimationFrame(animate);
      void yawObj;
    };

    frameRef.current = requestAnimationFrame(animate);

    const onResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.aspect = w / Math.max(1, h);
      cameraRef.current.updateProjectionMatrix();
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (rendererRef.current.domElement.parentElement === mount) {
          mount.removeChild(rendererRef.current.domElement);
        }
      }
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
        else mat?.dispose?.();
      });
    };
  }, [authLoading, startPayload]);

  function onTouchStartLook(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    if (!t) return;
    setTouchDragging(true);
    lastTouchRef.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchMoveLook(e: React.TouchEvent<HTMLDivElement>) {
    const prev = lastTouchRef.current;
    const t = e.touches[0];
    if (!prev || !t) return;
    const dx = t.clientX - prev.x;
    const dy = t.clientY - prev.y;
    lastTouchRef.current = { x: t.clientX, y: t.clientY };
    yawRef.current -= dx * 0.0045;
    pitchRef.current = clamp(pitchRef.current - dy * 0.0038, -0.65, 0.65);
  }

  function onTouchEndLook() {
    setTouchDragging(false);
    lastTouchRef.current = null;
  }

  function setMove(key: "up" | "down" | "left" | "right", value: boolean) {
    moveRef.current = { ...moveRef.current, [key]: value };
  }

  function detectInteractiveObject(): PuzzleTarget {
    const cam = cameraRef.current;
    if (!cam) return null;
    let nearest: { key: PuzzleTarget; score: number } = { key: null, score: -1 };
    (["terminal", "cabinet", "keypad"] as const).forEach((key) => {
      const obj = objectPointsRef.current[key];
      const dir = obj.lookAt.clone().sub(cam.position).normalize();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
      const alignment = forward.dot(dir);
      const dist = cam.position.distanceTo(obj.pos);
      const score = alignment - dist * 0.08;
      if (alignment > 0.84 && dist < 4.1 && score > nearest.score) {
        nearest = { key, score };
      }
    });
    return nearest.key;
  }

  function onAct() {
    if (finishing || result) return;
    const obj = detectInteractiveObject();
    if (!obj) {
      setError("Move closer and look directly at an interactive object.");
      return;
    }
    setFocusedObject(obj);
    setShowPuzzleModal(true);
    setError(null);
  }

  async function submitFinish(forceResult?: "timeout") {
    if (!startPayload || finishing) return;
    setFinishing(true);
    try {
      const body = {
        session_id: startPayload.session.id,
        entered_pin: enteredPin,
        terminal_found: terminalFound,
        cabinet_found: cabinetFound,
        keypad_solved: forceResult === "timeout" ? false : keypadSolved,
        inventory: [
          terminalFound ? "transaction-id" : "",
          cabinetFound ? "decode-formula" : "",
        ].filter(Boolean),
        client_meta: {
          local_now_ms: Date.now(),
          view_touch_dragging: touchDragging,
          force_result: forceResult ?? null,
        },
      };
      const res = await fetch("/api/games/finish", {
        method: "POST",
        credentials: "include",
        headers: {
          ...tokenHeaders.current,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as FinishResponse & { error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to submit game result");
      }
      setResult(data);
      sessionStorage.removeItem("escapeRoomStart");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to finish session");
    } finally {
      setFinishing(false);
    }
  }

  async function shareToLeaderboard() {
    if (!result) return;
    const text = shareResultText(result, elapsed);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "Stake & Escape",
          text,
          url: `${window.location.origin}/escape-room`,
        });
        setShareDone(true);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareDone(true);
        return;
      }
      setError("Share is unavailable on this device.");
    } catch {
      setError("Share was cancelled or failed.");
    }
  }

  function onPuzzleConfirm() {
    if (!focusedObject || !startPayload) return;
    if (focusedObject === "terminal") {
      setTerminalFound(true);
      setShowPuzzleModal(false);
      return;
    }
    if (focusedObject === "cabinet") {
      setCabinetFound(true);
      setShowPuzzleModal(false);
      return;
    }
    if (focusedObject === "keypad") {
      if (enteredPin.length !== 4) {
        setError("Enter a 4-digit PIN.");
        return;
      }
      const solved = terminalFound && cabinetFound;
      setKeypadSolved(solved);
      setShowPuzzleModal(false);
      submitFinish().catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to submit finish")
      );
    }
  }

  const canFinish = enteredPin.length === 4;

  if (authLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-xl border border-white/10 bg-fintech-bg-card/70 p-6 text-fintech-muted">
          Loading vault…
        </div>
      </main>
    );
  }

  if (error && !startPayload) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
          {error}
        </div>
        <button
          type="button"
          onClick={() => router.push("/escape-room")}
          className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white"
        >
          Back to Lobby
        </button>
      </main>
    );
  }

  if (!startPayload) return null;

  const elapsed = Math.max(0, Math.floor((nowMs - new Date(startPayload.session.started_at).getTime()) / 1000));

  if (result) {
    const isWin = result.session.result === "win";
    const isTimeout = result.session.result === "timeout";
    const displayedPayout = result.session.payout_cents || result.session.projected_payout_cents || 0;
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-4">
        {startPayload.session.mode === "free" && (!isWin || isTimeout) && (
          <BannerRotator placement="ads-page" />
        )}
        <section className="card-lux p-6 text-center space-y-3">
          <h1 className={`text-2xl font-bold ${isWin ? "text-emerald-300" : "text-red-300"}`}>
            {isWin ? "Vault Escaped!" : "Vault Locked"}
          </h1>
          {isWin ? (
            <>
              <p className="text-fintech-muted">
                Escape time: {mmss(result.session.escape_time_seconds ?? elapsed)} · Time remaining:{" "}
                {mmss(Math.max(0, startPayload.session.countdown_seconds - (result.session.server_elapsed_seconds ?? elapsed)))}
              </p>
              <p className="text-xl font-semibold text-amber-300">
                Winnings {cents(displayedPayout)}
              </p>
              {result.standing && (
                <p className="text-sm text-fintech-muted">Current rank: #{result.standing.rank}</p>
              )}
            </>
          ) : (
            <p className="text-fintech-muted">
              {isTimeout
                ? "Time expired before vault unlock. Try again."
                : "The entered sequence did not unlock the vault."}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            {isWin && (
              <button
                type="button"
                onClick={shareToLeaderboard}
                className="rounded-lg border border-fintech-highlight/40 bg-fintech-highlight/20 px-4 py-2 text-fintech-highlight font-semibold"
              >
                {shareDone ? "Shared to Leaderboard" : "Share to Leaderboard"}
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push("/escape-room")}
              className="rounded-lg bg-gradient-to-r from-violet-600 to-violet-500 px-4 py-2 text-white font-semibold"
            >
              Return to Lobby
            </button>
            <button
              type="button"
              onClick={() => router.push("/escape-room")}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white"
            >
              Play Again
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-40">
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none"
        onTouchStart={onTouchStartLook}
        onTouchMove={onTouchMoveLook}
        onTouchEnd={onTouchEndLook}
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        <header className="pointer-events-none flex items-start justify-between p-3 safe-area-pt">
          <div className="pointer-events-auto rounded-lg border border-white/10 bg-fintech-bg-card/80 px-3 py-2">
            <p className="text-xs text-fintech-muted uppercase">GarmonPay</p>
            <p className="text-sm font-semibold text-white">Stake & Escape</p>
          </div>
          <div className="pointer-events-auto rounded-lg border border-white/10 bg-fintech-bg-card/80 px-3 py-2 text-right">
            <p className="text-xs text-fintech-muted uppercase">Timer</p>
            <p className={`text-lg font-bold ${remainingSeconds <= 60 ? "text-red-300" : "text-white"}`}>
              {mmss(remainingSeconds)}
            </p>
          </div>
        </header>

        <div className="px-3 pb-2">
          <div className="rounded-lg border border-white/10 bg-fintech-bg-card/75 px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {[0, 1, 2].map((idx) => {
                const active =
                  (idx === 0 && terminalFound) ||
                  (idx === 1 && cabinetFound) ||
                  (idx === 2 && keypadSolved);
                return (
                  <span
                    key={idx}
                    className={`h-2.5 w-2.5 rounded-full ${
                      active ? "bg-emerald-400" : "bg-white/25"
                    }`}
                  />
                );
              })}
            </div>
            <div className="text-xs text-fintech-muted">
              Inventory: {terminalFound ? "[TXN ID] " : ""}{cabinetFound ? "[FORMULA]" : "—"}
            </div>
          </div>
        </div>

        <footer className="pointer-events-none p-3 safe-area-pb">
          <div className="pointer-events-auto flex items-end justify-between gap-2">
            <div className="rounded-xl border border-white/10 bg-fintech-bg-card/80 p-2 grid grid-cols-3 gap-2 w-[168px]">
              <span />
              <button
                type="button"
                onTouchStart={() => setMove("up", true)}
                onTouchEnd={() => setMove("up", false)}
                onTouchCancel={() => setMove("up", false)}
                className="rounded-lg bg-white/10 px-3 py-2 text-white text-xs"
              >
                ▲
              </button>
              <span />
              <button
                type="button"
                onTouchStart={() => setMove("left", true)}
                onTouchEnd={() => setMove("left", false)}
                onTouchCancel={() => setMove("left", false)}
                className="rounded-lg bg-white/10 px-3 py-2 text-white text-xs"
              >
                ◀
              </button>
              <button
                type="button"
                onTouchStart={() => setMove("down", true)}
                onTouchEnd={() => setMove("down", false)}
                onTouchCancel={() => setMove("down", false)}
                className="rounded-lg bg-white/10 px-3 py-2 text-white text-xs"
              >
                ▼
              </button>
              <button
                type="button"
                onTouchStart={() => setMove("right", true)}
                onTouchEnd={() => setMove("right", false)}
                onTouchCancel={() => setMove("right", false)}
                className="rounded-lg bg-white/10 px-3 py-2 text-white text-xs"
              >
                ▶
              </button>
            </div>

            <div className="flex-1 flex justify-center">
              <button
                type="button"
                onClick={onAct}
                className="rounded-full bg-gradient-to-r from-violet-600 to-violet-500 px-8 py-4 text-white font-bold shadow-lg shadow-violet-900/50 min-h-touch"
              >
                ACT
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem("escapeRoomStart");
                router.push("/escape-room");
              }}
              className="rounded-xl border border-white/10 bg-fintech-bg-card/80 px-3 py-2 text-xs text-fintech-muted"
            >
              Exit
            </button>
          </div>
        </footer>
      </div>

      {showPuzzleModal && focusedObject && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-fintech-bg-card p-4 sm:p-5 space-y-3 animate-slide-up">
            <h2 className="text-lg font-semibold text-white">
              {focusedObject === "terminal"
                ? "Computer Terminal"
                : focusedObject === "cabinet"
                ? "Filing Cabinet"
                : "Vault Keypad"}
            </h2>

            {focusedObject === "terminal" && (
              <>
                <p className="text-sm text-fintech-muted">
                  {startPayload.puzzle.clue_terminal_text ??
                    `Transaction feed recovered: ${startPayload.puzzle.clue_transaction_id}.`}
                </p>
                <p className="text-xs text-fintech-muted">
                  Store this transaction ID in your inventory.
                </p>
              </>
            )}

            {focusedObject === "cabinet" && (
              <>
                <p className="text-sm text-fintech-muted">
                  {startPayload.puzzle.clue_cabinet_text ??
                    `Decoding formula: ${startPayload.puzzle.clue_formula}`}
                </p>
                <p className="text-xs text-fintech-muted">
                  Use this formula with terminal data to derive the vault PIN.
                </p>
              </>
            )}

            {focusedObject === "keypad" && (
              <>
                <p className="text-sm text-fintech-muted">
                  Enter the 4-digit vault PIN derived from collected clues.
                </p>
                <input
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white text-center tracking-[0.25em] text-xl outline-none focus:border-fintech-accent"
                  placeholder="••••"
                />
                <p className="text-xs text-fintech-muted">
                  Progress: {progressCount}/3 puzzle steps complete
                </p>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPuzzleModal(false)}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onPuzzleConfirm}
                disabled={focusedObject === "keypad" && !canFinish}
                className="flex-1 rounded-lg bg-gradient-to-r from-violet-600 to-violet-500 px-3 py-2 text-white font-semibold disabled:opacity-50"
              >
                {focusedObject === "keypad" ? "Submit PIN" : "Collect Clue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute left-3 right-3 bottom-[96px] z-50 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200 text-xs">
          {error}
        </div>
      )}
    </main>
  );
}

export default EscapeRoomPlayClient;

