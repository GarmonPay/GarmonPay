"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Link from "next/link";

type SessionResp = {
  session_id: string;
  result: string;
  mode: string;
  remaining_seconds: number;
  server_expired: boolean;
  puzzle: {
    clue_transaction_id: string;
    clue_formula: string;
    clue_terminal_text: string | null;
    clue_cabinet_text: string | null;
  } | null;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

type Interact = "terminal" | "cabinet" | "keypad" | null;

export default function StakeEscapeExperience({
  sessionId,
  accessToken,
}: {
  sessionId: string;
  accessToken: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const moveRef = useRef({ x: 0, z: 0 });
  const yawRef = useRef(0);
  const posRef = useRef(new THREE.Vector3(0, 1.6, 2));

  const [session, setSession] = useState<SessionResp | null>(null);
  const [modal, setModal] = useState<Interact>(null);
  const [pin, setPin] = useState("");
  const [hudMsg, setHudMsg] = useState<string | null>(null);
  const [endScreen, setEndScreen] = useState<{ kind: "win" | "lose"; detail?: string; payout?: number } | null>(
    null
  );
  const [showIntroAd, setShowIntroAd] = useState(true);
  const [dots, setDots] = useState([false, false, false]);

  const poll = useCallback(async () => {
    const r = await fetch(`${apiBase}/api/games/escape/session?id=${encodeURIComponent(sessionId)}`, {
      headers: authHeaders(accessToken),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return;
    setSession(j as SessionResp);
    if (j.result !== "active") {
      if (j.result === "win") {
        setEndScreen({ kind: "win", payout: Number((j as { payout_cents?: number }).payout_cents ?? 0) });
      } else {
        setEndScreen({ kind: "lose", detail: String(j.result) });
      }
      return;
    }
    if (j.server_expired && j.result === "active") {
      await fetch(`${apiBase}/api/games/escape/finish`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ session_id: sessionId, action: "timeout" }),
      });
      const r2 = await fetch(`${apiBase}/api/games/escape/session?id=${encodeURIComponent(sessionId)}`, {
        headers: authHeaders(accessToken),
      });
      const j2 = await r2.json().catch(() => null);
      setSession(j2 as SessionResp);
      setEndScreen({ kind: "lose", detail: "timeout" });
    }
  }, [sessionId, accessToken]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    if (session?.mode === "free" && showIntroAd) {
      const t = setTimeout(() => setShowIntroAd(false), 4500);
      return () => clearTimeout(t);
    }
    setShowIntroAd(false);
  }, [session?.mode, showIntroAd]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0618);
    scene.fog = new THREE.Fog(0x0c0618, 8, 22);

    const camera = new THREE.PerspectiveCamera(68, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 80);
    camera.position.copy(posRef.current);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    const pr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x6b21a8, 0.45);
    scene.add(ambient);
    const spot = new THREE.PointLight(0xeab308, 1.2, 28);
    spot.position.set(0, 6, -2);
    scene.add(spot);
    const neon = new THREE.PointLight(0x8b5cf6, 0.9, 20);
    neon.position.set(-4, 3, -6);
    scene.add(neon);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: 0x150d24, metalness: 0.2, roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e1432, emissive: 0x2e1065, emissiveIntensity: 0.25 });
    const wz = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 0.4), wallMat);
    wz.position.set(0, 4, -10);
    scene.add(wz);

    const makeBox = (color: number, x: number, z: number, tag: Interact, emissive: number) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.6, 0.8),
        new THREE.MeshStandardMaterial({
          color,
          emissive: emissive,
          emissiveIntensity: 0.35,
          metalness: 0.3,
          roughness: 0.5,
        })
      );
      m.position.set(x, 0.8, z);
      (m.userData as { interact?: Interact }).interact = tag ?? undefined;
      scene.add(m);
      meshesRef.current.push(m);
      return m;
    };

    makeBox(0x4c1d95, -3.5, -4, "terminal", 0x6d28d9);
    makeBox(0x713f12, 3.5, -4, "cabinet", 0xca8a04);
    makeBox(0x14532d, 0, -6.2, "keypad", 0x22c55e);

    const door = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 0.35, 6),
      new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.6, roughness: 0.35 })
    );
    door.rotation.z = Math.PI / 2;
    door.position.set(0, 2.4, -9.6);
    scene.add(door);

    rendererRef.current = renderer;
    cameraRef.current = camera;
    sceneRef.current = scene;

    let dragging = false;
    let lx = 0,
      ly = 0;
    const onDown = (cx: number, cy: number) => {
      dragging = true;
      lx = cx;
      ly = cy;
    };
    const onMove = (cx: number, cy: number) => {
      if (!dragging) return;
      const dx = cx - lx;
      const dy = cy - ly;
      lx = cx;
      ly = cy;
      yawRef.current -= dx * 0.005;
      camera.rotation.x = Math.max(-0.55, Math.min(0.45, camera.rotation.x - dy * 0.005));
    };
    const onUp = () => {
      dragging = false;
    };

    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => onDown(e.clientX, e.clientY));
    canvas.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY));
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);

    const ro = new ResizeObserver(() => {
      if (!el) return;
      const w = el.clientWidth;
      const h = Math.max(1, el.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
    });
    ro.observe(el);

    const clock = new THREE.Clock();
    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const yaw = yawRef.current;
      const mx = moveRef.current.x;
      const mz = moveRef.current.z;
      const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      posRef.current.addScaledVector(forward, -mz * 4 * dt);
      posRef.current.addScaledVector(right, mx * 4 * dt);
      posRef.current.x = Math.max(-9, Math.min(9, posRef.current.x));
      posRef.current.z = Math.max(-9, Math.min(5, posRef.current.z));
      camera.position.x = posRef.current.x;
      camera.position.z = posRef.current.z;
      camera.position.y = 1.6;
      camera.rotation.y = yaw;
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      canvas.removeEventListener("pointerup", onUp);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      meshesRef.current = [];
    };
  }, []);

  const tryInteract = () => {
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!camera || !scene) return;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = ray.intersectObjects(meshesRef.current, false);
    if (!hits.length) {
      setHudMsg("Nothing to activate");
      setTimeout(() => setHudMsg(null), 2000);
      return;
    }
    const tag = (hits[0].object.userData as { interact?: Interact }).interact ?? null;
    if (tag === "terminal") setDots((d) => [true, d[1], d[2]]);
    if (tag === "cabinet") setDots((d) => [d[0], true, d[2]]);
    if (tag === "keypad") setDots((d) => [d[0], d[1], true]);
    setModal(tag);
  };

  const submitPin = async () => {
    const clean = pin.replace(/\D/g, "").slice(0, 4);
    if (clean.length !== 4) return;
    const r = await fetch(`${apiBase}/api/games/escape/finish`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ session_id: sessionId, pin: clean }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j.error === "incorrect_pin") {
        setHudMsg("Wrong PIN");
        setTimeout(() => setHudMsg(null), 2000);
        return;
      }
      setHudMsg(typeof j.error === "string" ? j.error : "Error");
      return;
    }
    setModal(null);
    if (j.result === "win") {
      setEndScreen({ kind: "win", payout: Number(j.payout_cents ?? 0) });
    } else {
      setEndScreen({ kind: "lose", detail: String(j.result) });
    }
    poll();
  };

  const rem = session?.remaining_seconds ?? 0;
  const mm = String(Math.floor(rem / 60)).padStart(2, "0");
  const ss = String(rem % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col font-[var(--font-inter),system-ui,sans-serif]">
      <div ref={mountRef} className="flex-1 min-h-0 w-full relative" />

      {/* HUD */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 flex justify-between items-start p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto">
          <span className="text-xs font-bold text-[#eab308] tracking-tight">GARMONPAY</span>
          <p className="text-[10px] text-violet-200/80">Stake & Escape</p>
        </div>
        <div className="rounded-xl border border-[#eab308]/40 bg-[#0c0618]/90 px-3 py-2 text-right shadow-card">
          <p className="text-[10px] uppercase text-violet-300/90">Time left</p>
          <p className="text-xl font-mono font-bold text-white tabular-nums">
            {mm}:{ss}
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute top-14 left-3 flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${dots[i] ? "bg-emerald-400" : "bg-white/20"}`}
          />
        ))}
      </div>

      {hudMsg && (
        <div className="pointer-events-none absolute top-1/4 left-0 right-0 text-center text-amber-300 text-sm font-medium drop-shadow-lg">
          {hudMsg}
        </div>
      )}

      {/* Controls */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 pb-[max(1rem,env(safe-area-inset-bottom))] px-4 pb-4 flex items-end justify-between gap-3 bg-gradient-to-t from-[#0c0618] via-[#0c0618]/95 to-transparent pt-12">
        <div className="grid grid-cols-3 gap-1 w-36">
          <span />
          <button
            type="button"
            className="h-12 rounded-lg bg-[#150d24] border border-violet-500/40 text-violet-200 text-lg active:scale-95"
            onTouchStart={() => {
              moveRef.current.z = -1;
            }}
            onTouchEnd={() => {
              moveRef.current.z = 0;
            }}
            onMouseDown={() => {
              moveRef.current.z = -1;
            }}
            onMouseUp={() => {
              moveRef.current.z = 0;
            }}
          >
            ↑
          </button>
          <span />
          <button
            type="button"
            className="h-12 rounded-lg bg-[#150d24] border border-violet-500/40 text-violet-200 text-lg active:scale-95"
            onTouchStart={() => {
              moveRef.current.x = -1;
            }}
            onTouchEnd={() => {
              moveRef.current.x = 0;
            }}
            onMouseDown={() => {
              moveRef.current.x = -1;
            }}
            onMouseUp={() => {
              moveRef.current.x = 0;
            }}
          >
            ←
          </button>
          <button
            type="button"
            className="h-12 rounded-lg bg-[#150d24] border border-violet-500/40 text-violet-200 text-lg active:scale-95"
            onTouchStart={() => {
              moveRef.current.z = 1;
            }}
            onTouchEnd={() => {
              moveRef.current.z = 0;
            }}
            onMouseDown={() => {
              moveRef.current.z = 1;
            }}
            onMouseUp={() => {
              moveRef.current.z = 0;
            }}
          >
            ↓
          </button>
          <button
            type="button"
            className="h-12 rounded-lg bg-[#150d24] border border-violet-500/40 text-violet-200 text-lg active:scale-95"
            onTouchStart={() => {
              moveRef.current.x = 1;
            }}
            onTouchEnd={() => {
              moveRef.current.x = 0;
            }}
            onMouseDown={() => {
              moveRef.current.x = 1;
            }}
            onMouseUp={() => {
              moveRef.current.x = 0;
            }}
          >
            →
          </button>
        </div>

        <button
          type="button"
          onClick={tryInteract}
          className="h-14 min-w-[7rem] px-6 rounded-2xl bg-gradient-to-r from-violet-600 to-violet-500 text-white font-bold shadow-lg shadow-violet-900/50 border border-white/10 active:scale-[0.98]"
        >
          ACT
        </button>

        <div className="text-[10px] text-violet-300/70 max-w-[100px] text-right leading-tight">
          Drag to look · D-pad to move · ACT to use
        </div>
      </div>

      {/* Modals */}
      {modal && session?.puzzle && (
        <div className="absolute inset-x-0 bottom-0 z-20 animate-slide-up rounded-t-2xl border border-white/10 bg-[#150d24]/98 p-5 max-h-[62vh] overflow-y-auto shadow-soft-lg pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-[#fde047] capitalize">{modal}</h3>
            <button
              type="button"
              className="text-violet-300 text-sm"
              onClick={() => setModal(null)}
            >
              Close
            </button>
          </div>
          {modal === "terminal" && (
            <div className="text-sm text-violet-100/90 space-y-2">
              <p className="font-mono text-emerald-400">{session.puzzle.clue_transaction_id}</p>
              <p>{session.puzzle.clue_terminal_text ?? "Encrypted terminal stream…"}</p>
              <p className="text-xs text-violet-400/80">{session.puzzle.clue_formula}</p>
            </div>
          )}
          {modal === "cabinet" && (
            <div className="text-sm text-violet-100/90 space-y-2">
              <p>{session.puzzle.clue_cabinet_text ?? "Files archived."}</p>
              <p className="text-xs text-violet-400/80">{session.puzzle.clue_formula}</p>
            </div>
          )}
          {modal === "keypad" && (
            <div className="space-y-3">
              <p className="text-xs text-violet-300">Enter 4-digit vault code</p>
              <input
                inputMode="numeric"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-2xl font-mono tracking-[0.4em] text-white"
                value={pin}
                maxLength={4}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <button
                type="button"
                onClick={submitPin}
                className="w-full rounded-xl bg-gradient-to-r from-[#eab308] to-[#ca8a04] text-[#0c0618] font-bold py-3"
              >
                Unlock vault
              </button>
            </div>
          )}
        </div>
      )}

      {showIntroAd && session?.mode === "free" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#150d24] p-6 text-center">
            <p className="text-xs uppercase tracking-wider text-violet-400">Advertisement</p>
            <p className="mt-2 text-white font-semibold">Play more. Earn more with GarmonPay.</p>
            <p className="mt-2 text-xs text-violet-200/80">Thanks for supporting free play.</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white"
              onClick={() => setShowIntroAd(false)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {endScreen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0c0618]/95 px-4">
          <div className="w-full max-w-md rounded-2xl border border-violet-500/30 bg-[#150d24] p-8 text-center shadow-card">
            {endScreen.kind === "win" ? (
              <>
                <p className="text-4xl">🔓</p>
                <h2 className="mt-4 text-2xl font-bold text-[#fde047]">Vault cleared</h2>
                {endScreen.payout != null && endScreen.payout > 0 ? (
                  <p className="mt-2 text-emerald-400 font-semibold">
                    +${(endScreen.payout / 100).toFixed(2)} credited
                  </p>
                ) : (
                  <p className="mt-2 text-violet-200/90">Great run — leaderboard updated.</p>
                )}
              </>
            ) : (
              <>
                <p className="text-4xl">⏱️</p>
                <h2 className="mt-4 text-2xl font-bold text-white">Time&apos;s up</h2>
                <p className="mt-2 text-violet-300/90 text-sm">
                  {session?.mode === "free"
                    ? "Try again — practice makes perfect."
                    : "Your stake stayed in today’s pool."}
                </p>
                {session?.mode === "free" && (
                  <div className="mt-4 rounded-lg border border-dashed border-white/15 bg-black/20 px-3 py-2 text-[10px] text-violet-400">
                    Advertisement · Discover rewards on GarmonPay
                  </div>
                )}
              </>
            )}
            <Link
              href="/games/escape"
              className="mt-6 inline-block w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3 font-semibold text-white no-underline text-center"
            >
              Back to lobby
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
