"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
} from "@react-three/drei";
import { ArenaRing } from "./ArenaRing";
import { FightCameraRig } from "./FightCameraRig";
import { FightHUD } from "./FightHUD";
import { HitFlash } from "./HitFlash";
import { CenteredMeshyModel } from "@/components/arena/meshy/CenteredMeshyModel";
import { ModelErrorBoundary } from "@/components/arena/meshy/ModelErrorBoundary";
import { ProceduralFallbackBoxer } from "@/components/arena/meshy/ProceduralFallbackBoxer";
import type { FightAnim } from "@/components/arena/meshy/ProceduralFallbackBoxer";
import { resolveModelUrlOrNull } from "@/lib/meshy-assets";

function mapAnim(s: string | undefined): FightAnim {
  switch (s) {
    case "punch":
    case "big_hit":
      return "punch";
    case "block":
      return "block";
    case "knockout":
    case "ko":
      return "knockout";
    case "victory":
      return "victory";
    default:
      return "idle";
  }
}

function FighterSlot({
  url,
  facingRight,
  accent,
  anim,
}: {
  url: string | null | undefined;
  facingRight: boolean;
  accent: string;
  anim: FightAnim;
}) {
  const resolved = resolveModelUrlOrNull(url);
  const pos: [number, number, number] = [facingRight ? 1.28 : -1.28, 0, 0.15];
  if (!resolved) {
    return (
      <group position={pos}>
        <ProceduralFallbackBoxer facingRight={facingRight} accent={accent} anim={anim} />
      </group>
    );
  }
  return (
    <group position={pos}>
      <ModelErrorBoundary
        key={resolved}
        fallback={<ProceduralFallbackBoxer facingRight={facingRight} accent={accent} anim={anim} />}
      >
        <Suspense fallback={<ProceduralFallbackBoxer facingRight={facingRight} accent={accent} anim={anim} />}>
          <CenteredMeshyModel key={resolved} url={resolved} facingRight={facingRight} anim={anim} />
        </Suspense>
      </ModelErrorBoundary>
    </group>
  );
}

function ArenaLighting() {
  return (
    <>
      <color attach="background" args={["#050508"]} />
      <fog attach="fog" args={["#050508", 12, 48]} />
      <ambientLight intensity={0.07} />
      <hemisphereLight intensity={0.28} color="#d4dcff" groundColor="#0a0806" />
      <hemisphereLight intensity={0.1} color="#ffffff" groundColor="#3d2010" />
      <spotLight
        castShadow
        position={[0, 9, 4]}
        angle={0.42}
        penumbra={0.62}
        intensity={48}
        color="#fff6eb"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00022}
      />
      <spotLight position={[-4.2, 4.5, 2.8]} angle={0.65} penumbra={0.55} intensity={5} color="#9cb4ff" />
      <spotLight position={[4.5, 3.2, -1.8]} angle={0.55} penumbra={0.45} intensity={3.2} color="#ffc9a0" />
      <pointLight position={[0, 2.2, 5.5]} intensity={0.85} color="#fff5e0" distance={14} />
    </>
  );
}

export type ArenaFightPresentationProps = {
  fighterAModelUrl?: string | null;
  fighterBModelUrl?: string | null;
  fighterAName?: string;
  fighterBName?: string;
  fighterAAnim?: string;
  fighterBAnim?: string;
  healthA?: number;
  healthB?: number;
  staminaA?: number;
  staminaB?: number;
  mode?: string;
  winnerSide?: "left" | "right" | null;
  koIntensity?: number;
  exchangeKey?: number;
  lastHitSide?: "left" | "right" | null;
  modelLoading?: boolean;
  /** Optional ring GLB under `public/assets/meshy/rings/`. */
  meshyRingUrl?: string | null;
};

export default function ArenaFightPresentation({
  fighterAModelUrl,
  fighterBModelUrl,
  fighterAName = "Fighter A",
  fighterBName = "Fighter B",
  fighterAAnim,
  fighterBAnim,
  healthA = 100,
  healthB = 100,
  staminaA = 100,
  staminaB = 100,
  mode = "fight",
  koIntensity = 0,
  exchangeKey = 0,
  lastHitSide = null,
  modelLoading = false,
  meshyRingUrl,
}: ArenaFightPresentationProps) {
  const [dpr, setDpr] = useState<[number, number]>([1, 2]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setDpr(mq.matches ? [1, 1.35] : [1, 2]);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const ringMode =
    mode === "victory" ? "victory" : mode === "ko" ? "ko" : mode === "setup" ? "setup" : "fight";

  const envRing =
    meshyRingUrl ??
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MESHY_RING_GLB
      ? process.env.NEXT_PUBLIC_MESHY_RING_GLB
      : null);

  return (
    <div className="relative w-full overflow-hidden rounded-t-xl bg-black" style={{ minHeight: 380, height: "min(52vh, 520px)" }}>
      <div className="absolute inset-0 z-0">
        <Canvas
          shadows
          dpr={dpr}
          gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
          style={{ width: "100%", height: "100%" }}
          camera={{ position: [0, 1.35, 4.4], fov: 38, near: 0.1, far: 80 }}
        >
          <ArenaLighting />
          <FightCameraRig mode={ringMode} exchangeKey={exchangeKey} koIntensity={koIntensity} />
          <Suspense fallback={null}>
            <ArenaRing meshyRingUrl={envRing} />
            <group>
              <FighterSlot
                url={fighterAModelUrl}
                facingRight={false}
                accent="#3b82f6"
                anim={mapAnim(fighterAAnim)}
              />
              <FighterSlot
                url={fighterBModelUrl}
                facingRight
                accent="#ef4444"
                anim={mapAnim(fighterBAnim)}
              />
            </group>
            <ContactShadows
              position={[0, 0.01, 0]}
              opacity={0.85}
              scale={12}
              blur={2.2}
              far={9}
              color="#000000"
            />
            <Environment preset="studio" environmentIntensity={0.85} />
          </Suspense>
        </Canvas>
      </div>
      <HitFlash hitKey={exchangeKey} side={lastHitSide} />
      <FightHUD
        nameLeft={fighterAName}
        nameRight={fighterBName}
        healthLeft={healthA}
        healthRight={healthB}
        staminaLeft={staminaA}
        staminaRight={staminaB}
        loading={modelLoading}
      />
    </div>
  );
}
