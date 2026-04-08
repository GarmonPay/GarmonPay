'use client'

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import * as THREE from "three";

const GOLD = "#f5c842";
const ACCENT = "#7c3aed";

function makeFaceTexture(
  lines: { text: string; fontSize: number; fontFamily: string; y: number }[],
  size = 512
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const g = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size / 2);
  g.addColorStop(0, "#fff4d0");
  g.addColorStop(0.35, "#e8c04a");
  g.addColorStop(0.7, "#b8860b");
  g.addColorStop(1, "#6a4a00");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 6;
  ctx.stroke();
  for (const line of lines) {
    ctx.font = `bold ${line.fontSize}px ${line.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#2a1f08";
    ctx.shadowColor = "rgba(255,220,120,0.5)";
    ctx.shadowBlur = 8;
    ctx.fillText(line.text, size / 2, line.y);
    ctx.shadowBlur = 0;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

type Phase = "idle" | "anim" | "done";

type CoinMeshProps = {
  targetFace: "heads" | "tails" | null;
  flipGeneration: number;
  isFlipping: boolean;
  won: boolean | null;
  onFlipStart: () => void;
  onResult: (result: "heads" | "tails") => void;
};

function CoinMesh({ targetFace, flipGeneration, isFlipping, won, onFlipStart, onResult }: CoinMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const phaseRef = useRef<Phase>("idle");
  const tAnimRef = useRef(0);
  const startRotRef = useRef({ x: Math.PI / 2, y: 0, z: 0 });
  const endRotXRef = useRef(Math.PI / 2);
  const baseYRef = useRef(0);
  const reportedRef = useRef(false);
  const lastGenRef = useRef(0);
  const winPhaseRef = useRef(0);

  const [headTex, tailTex, rimTex] = useMemo(() => {
    const heads = makeFaceTexture([{ text: "GP", fontSize: 140, fontFamily: "Georgia, serif", y: 256 }]);
    const tails = makeFaceTexture(
      [
        { text: "BUILD YOUR", fontSize: 42, fontFamily: "Georgia, serif", y: 200 },
        { text: "WEALTH", fontSize: 56, fontFamily: "Georgia, serif", y: 290 },
      ],
      512
    );
    const rimCanvas = document.createElement("canvas");
    rimCanvas.width = 128;
    rimCanvas.height = 128;
    const rctx = rimCanvas.getContext("2d");
    if (rctx) {
      const rg = rctx.createLinearGradient(0, 0, 128, 128);
      rg.addColorStop(0, "#ffe9a8");
      rg.addColorStop(0.5, "#c9a227");
      rg.addColorStop(1, "#7a5a10");
      rctx.fillStyle = rg;
      rctx.fillRect(0, 0, 128, 128);
    }
    const rim = new THREE.CanvasTexture(rimCanvas);
    rim.colorSpace = THREE.SRGBColorSpace;
    return [heads, tails, rim];
  }, []);

  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({
      map: rimTex,
      metalness: 0.88,
      roughness: 0.26,
      color: new THREE.Color(GOLD),
    });
    const top = new THREE.MeshStandardMaterial({
      map: headTex,
      metalness: 0.52,
      roughness: 0.36,
      color: new THREE.Color(0xffffff),
    });
    const bottom = new THREE.MeshStandardMaterial({
      map: tailTex,
      metalness: 0.52,
      roughness: 0.36,
      color: new THREE.Color(0xffffff),
    });
    return [side, top, bottom];
  }, [headTex, tailTex, rimTex]);

  useEffect(() => {
    if (!isFlipping || !targetFace) return;
    if (flipGeneration === lastGenRef.current) return;
    lastGenRef.current = flipGeneration;
    reportedRef.current = false;
    tAnimRef.current = 0;
    winPhaseRef.current = 0;
    phaseRef.current = "anim";
    const mesh = meshRef.current;
    if (mesh) {
      startRotRef.current = {
        x: mesh.rotation.x,
        y: mesh.rotation.y,
        z: mesh.rotation.z,
      };
      baseYRef.current = mesh.position.y;
      const spins = 5 * Math.PI * 2;
      const wantHeads = targetFace === "heads";
      const finalX = wantHeads ? Math.PI / 2 : -Math.PI / 2;
      const current = mesh.rotation.x;
      const endX = current + spins + ((((finalX - current) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
      endRotXRef.current = endX;
    }
    onFlipStart();
  }, [isFlipping, targetFace, flipGeneration, onFlipStart]);

  useEffect(() => {
    if (!isFlipping && phaseRef.current === "done") {
      phaseRef.current = "idle";
    }
  }, [isFlipping]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    if (phaseRef.current === "idle") {
      mesh.position.y = Math.sin(state.clock.elapsedTime * 1.12) * 0.052;
      mesh.rotation.z = Math.sin(state.clock.elapsedTime * 0.72) * 0.032;
      materials.forEach((m) => {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.emissiveIntensity = 0;
        }
      });
      return;
    }

    if (phaseRef.current === "done") {
      if (won === true) {
        winPhaseRef.current += delta * 2.8;
        const pulse = 0.32 + Math.sin(winPhaseRef.current) * 0.14;
        materials.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial) {
            m.emissive = new THREE.Color(GOLD);
            m.emissiveIntensity = pulse;
          }
        });
      } else {
        materials.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial) {
            m.emissiveIntensity = 0;
          }
        });
      }
      return;
    }

    if (phaseRef.current === "anim") {
      tAnimRef.current += delta;
      const T = 2.35;
      const p = Math.min(tAnimRef.current / T, 1);
      const ease = p * p * (3 - 2 * p);

      const riseEnd = 0.14;
      const spinEnd = 0.72;
      let py = baseYRef.current;
      if (p < riseEnd) {
        const u = p / riseEnd;
        py = baseYRef.current + (1 - Math.pow(1 - u, 3)) * 0.42;
      } else if (p < spinEnd) {
        py = baseYRef.current + 0.42;
      } else {
        const u = (p - spinEnd) / (1 - spinEnd);
        const bounce = Math.sin(u * Math.PI) * 0.1 * (1 - u);
        py = baseYRef.current + 0.42 * (1 - u) + bounce;
      }

      mesh.position.y = py;

      const sx = startRotRef.current.x;
      const ex = endRotXRef.current;
      mesh.rotation.x = sx + (ex - sx) * ease;
      mesh.rotation.y = startRotRef.current.y;

      if (p >= 1) {
        mesh.rotation.x = ex;
        mesh.rotation.y = 0;
        mesh.position.y = baseYRef.current;
        phaseRef.current = "done";
        if (!reportedRef.current && targetFace) {
          reportedRef.current = true;
          onResult(targetFace);
        }
      }
    }
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow material={materials} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[1, 1, 0.22, 72]} />
    </mesh>
  );
}

export type CoinFlip3DProps = {
  flipGeneration: number;
  targetFace: "heads" | "tails" | null;
  isFlipping: boolean;
  won: boolean | null;
  onFlipStart: () => void;
  onResult: (result: "heads" | "tails") => void;
  className?: string;
};

export function CoinFlip3D({
  flipGeneration,
  targetFace,
  isFlipping,
  won,
  onFlipStart,
  onResult,
  className = "",
}: CoinFlip3DProps) {
  const onFlipStartCb = useCallback(() => {
    onFlipStart();
  }, [onFlipStart]);

  const onResultCb = useCallback(
    (r: "heads" | "tails") => {
      onResult(r);
    },
    [onResult]
  );

  return (
    <div
      className={`relative w-full min-h-[280px] md:min-h-[360px] rounded-xl overflow-hidden border border-white/10 bg-[#0e0118] ${className}`}
    >
      <div style={{ width: "100%", height: "100%" }}>
        <Canvas
          shadows
          camera={{ position: [0, 0.55, 4.6], fov: 40 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
          style={{ width: "100%", height: "100%" }}
        >
          <color attach="background" args={["#0e0118"]} />
          <ambientLight intensity={0.38} />
          <directionalLight position={[4, 10, 6]} intensity={1.05} castShadow />
          <pointLight position={[-2.8, 2.2, 3.8]} intensity={48} color={ACCENT} distance={22} decay={2} />
          <pointLight position={[2.5, -0.8, 2.2]} intensity={32} color={GOLD} distance={18} decay={2} />
          <CoinMesh
            targetFace={targetFace}
            flipGeneration={flipGeneration}
            isFlipping={isFlipping}
            won={won}
            onFlipStart={onFlipStartCb}
            onResult={onResultCb}
          />
        </Canvas>
      </div>
    </div>
  );
}
