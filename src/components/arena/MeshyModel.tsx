"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, PresentationControls, useGLTF } from "@react-three/drei";
import { CenteredMeshyModel } from "@/components/arena/meshy/CenteredMeshyModel";
import { ModelErrorBoundary } from "@/components/arena/meshy/ModelErrorBoundary";
import { ProceduralFallbackBoxer } from "@/components/arena/meshy/ProceduralFallbackBoxer";
import { FALLBACK_FIGHTER_GLB, resolveFighterModelUrl } from "@/lib/meshy-assets";

useGLTF.preload(FALLBACK_FIGHTER_GLB);

function GLBScene({
  modelUrl,
  facingRight = false,
}: {
  modelUrl: string;
  facingRight?: boolean;
}) {
  const resolved = resolveFighterModelUrl(modelUrl);
  return (
    <ModelErrorBoundary fallback={<ProceduralFallbackBoxer facingRight={facingRight} anim="idle" />}>
      <Suspense fallback={<ProceduralFallbackBoxer facingRight={facingRight} anim="idle" />}>
        <CenteredMeshyModel key={resolved} url={resolved} facingRight={facingRight} anim="idle" />
      </Suspense>
    </ModelErrorBoundary>
  );
}

export default function MeshyModel({
  modelUrl = FALLBACK_FIGHTER_GLB,
  facingRight = false,
  fighterColor = "#f0a500",
  stats = { speed: 50, strength: 50, stamina: 50, defense: 50, chin: 50, special: 20 },
  height = 380,
}: {
  modelUrl?: string;
  facingRight?: boolean;
  fighterColor?: string;
  stats?: { speed: number; strength: number; stamina: number; defense: number; chin: number; special: number };
  height?: number;
}) {
  if (typeof window === "undefined")
    return <div style={{ width: "100%", height, background: "#000", borderRadius: 8 }} />;

  void stats;

  return (
    <div
      style={{
        width: "100%",
        height,
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
        <ambientLight intensity={0.05} />
        <hemisphereLight intensity={0.2} color="#d0d8ff" groundColor="#080604" />
        <spotLight castShadow position={[0, 8, 3]} angle={0.4} penumbra={0.5} intensity={4.5} color="#fff5e0" />
        <spotLight position={[-3, 4, 2]} angle={0.6} penumbra={0.8} intensity={0.9} color="#b0c8ff" />
        <pointLight position={[0, 2, -3]} intensity={0.65} color={fighterColor} distance={5} />
        <Suspense fallback={null}>
          <PresentationControls global polar={[-0.1, 0.1]} azimuth={[-0.4, 0.4]} snap>
            <GLBScene modelUrl={modelUrl} facingRight={facingRight} />
          </PresentationControls>
          <ContactShadows position={[0, -1.4, 0]} opacity={0.9} scale={6} blur={2} color="#000" />
          <Environment preset="studio" environmentIntensity={0.75} />
        </Suspense>
      </Canvas>
    </div>
  );
}
