"use client";

import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { ArenaOptionalEnvironment } from "@/components/arena/ArenaOptionalEnvironment";
import { CenteredMeshyModel } from "@/components/arena/meshy/CenteredMeshyModel";
import { ModelErrorBoundary } from "@/components/arena/meshy/ModelErrorBoundary";
import { ProceduralFallbackBoxer } from "@/components/arena/meshy/ProceduralFallbackBoxer";
import { FALLBACK_FIGHTER_GLB, resolveFighterModelUrl } from "@/lib/meshy-assets";

function FighterModel({
  modelUrl,
  facingRight,
}: {
  modelUrl: string;
  facingRight: boolean;
}) {
  if (modelUrl == null || typeof modelUrl !== "string" || !modelUrl.trim()) {
    console.warn("[BoxerCanvas] Invalid modelUrl — using fallback GLB path");
  }
  const resolved = resolveFighterModelUrl(typeof modelUrl === "string" ? modelUrl : "");
  return (
    <ModelErrorBoundary
      key={resolved}
      fallback={<ProceduralFallbackBoxer facingRight={facingRight} anim="idle" />}
    >
      <Suspense fallback={<ProceduralFallbackBoxer facingRight={facingRight} anim="idle" />}>
        <CenteredMeshyModel key={resolved} url={resolved} facingRight={facingRight} anim="idle" />
      </Suspense>
    </ModelErrorBoundary>
  );
}

export default function BoxerCanvas({
  modelUrl = FALLBACK_FIGHTER_GLB,
  facingRight = false,
  fighterColor = "#f0a500",
  size = "medium",
}: {
  modelUrl?: string;
  facingRight?: boolean;
  fighterColor?: string;
  size?: "small" | "medium" | "large";
}) {
  useEffect(() => {
    void import("@react-three/drei").then(({ useGLTF }) => {
      try {
        useGLTF.preload(FALLBACK_FIGHTER_GLB);
      } catch {
        /* ignore */
      }
    });
  }, []);

  if (typeof window === "undefined") return null;

  const heights = { small: 220, medium: 380, large: 560 };

  return (
    <div
      style={{
        width: "100%",
        height: heights[size],
        background: "radial-gradient(ellipse at 50% 0%, #0d0d12, #000000)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0.5, 4], fov: 42 }}
      >
        <ambientLight intensity={0.08} />
        <hemisphereLight intensity={0.28} color="#d0d8ff" groundColor="#080604" />
        <spotLight
          castShadow
          position={[0, 8, 3]}
          angle={0.4}
          penumbra={0.5}
          intensity={5}
          color="#fff5e0"
        />
        <spotLight position={[-3, 4, 2]} angle={0.6} penumbra={0.8} intensity={1.1} color="#b0c8ff" />
        <pointLight position={[0, 2, -3]} intensity={0.75} color={fighterColor} distance={5} />
        <Suspense fallback={null}>
          <group>
            <FighterModel modelUrl={modelUrl} facingRight={facingRight} />
          </group>
          <ContactShadows position={[0, -1.4, 0]} opacity={0.9} scale={6} blur={2} color="#000" />
          <ArenaOptionalEnvironment environmentIntensity={0.65} />
        </Suspense>
      </Canvas>
    </div>
  );
}
