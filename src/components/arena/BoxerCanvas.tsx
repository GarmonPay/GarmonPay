"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  useGLTF,
  ContactShadows,
  Environment,
  PresentationControls,
} from "@react-three/drei";

function BoxerModel({
  facingRight = false,
}: {
  facingRight?: boolean;
}) {
  const { scene } = useGLTF("/models/default-boxer.glb");
  if (!scene || typeof scene.clone !== "function") return null;
  return (
    <primitive
      object={scene.clone()}
      scale={1.8}
      position={[0, -1.2, 0]}
      rotation={[0, facingRight ? Math.PI : 0, 0]}
    />
  );
}

function LoadingBox({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[0.8, 2, 0.4]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export default function BoxerCanvas({
  facingRight = false,
  fighterColor = "#f0a500",
  size = "medium",
}: {
  facingRight?: boolean;
  fighterColor?: string;
  size?: "small" | "medium" | "large";
}) {
  const heights = { small: 220, medium: 380, large: 560 };

  return (
    <div
      style={{
        width: "100%",
        height: heights[size],
        background: "radial-gradient(ellipse at 50% 0%, #1a0808, #000000)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Canvas
        shadows
        camera={{ position: [0, 0.5, 4], fov: 42 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.04} />
        <spotLight
          position={[0, 8, 3]}
          angle={0.4}
          penumbra={0.5}
          intensity={4}
          color="#fff5e0"
          castShadow
        />
        <spotLight
          position={[-3, 4, 2]}
          angle={0.6}
          penumbra={0.8}
          intensity={0.8}
          color="#b0c8ff"
        />
        <pointLight
          position={[0, 2, -3]}
          intensity={0.6}
          color={fighterColor}
          distance={5}
        />
        <Suspense
          fallback={<LoadingBox color={fighterColor} />}
        >
          <PresentationControls
            global
            polar={[-0.1, 0.1]}
            azimuth={[-0.4, 0.4]}
            snap
          >
            <BoxerModel facingRight={facingRight} />
          </PresentationControls>
          <ContactShadows
            position={[0, -1.4, 0]}
            opacity={0.9}
            scale={6}
            blur={2}
            color="#000"
          />
          <Environment preset="night" />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload("/models/default-boxer.glb");
