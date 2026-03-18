"use client";

import React, { Suspense, useState, useEffect, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, ContactShadows, Environment, PresentationControls } from "@react-three/drei";

class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    console.error("[ProBoxer Model]", err);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function Model({ facingRight = false }: { facingRight?: boolean }) {
  const gltf = useGLTF("/models/default-boxer.glb") as { scene?: { clone: () => object } | null };
  const scene = gltf?.scene;
  if (!scene || typeof scene.clone !== "function") return null;
  try {
    const clone = scene.clone();
    return (
      <primitive
        object={clone}
        scale={1.8}
        position={[0, -1.2, 0]}
        rotation={[0, facingRight ? Math.PI : 0, 0]}
      />
    );
  } catch {
    return null;
  }
}

function FallbackBox({ fighterColor }: { fighterColor: string }) {
  return (
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[0.8, 2, 0.4]} />
      <meshStandardMaterial color={fighterColor} />
    </mesh>
  );
}

function SafeEnvironment() {
  return (
    <ModelErrorBoundary fallback={null}>
      <Environment preset="night" />
    </ModelErrorBoundary>
  );
}

export default function ProBoxer({
  facingRight = false,
  fighterColor = "#f0a500",
  size = "medium",
  fighter: _fighter,
}: {
  facingRight?: boolean;
  fighterColor?: string;
  size?: "small" | "medium" | "large";
  fighter?: unknown;
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const heights = { small: 220, medium: 400, large: 560 };
  const safeColor = fighterColor && typeof fighterColor === "string" ? fighterColor : "#f0a500";

  if (!isClient) {
    return (
      <div
        style={{
          width: "100%",
          height: heights[size],
          background: "#000",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: "#f0a500", fontSize: 48 }}>🥊</div>
      </div>
    );
  }

  const fallback3d = <FallbackBox fighterColor={safeColor} />;

  return (
    <div
      style={{
        width: "100%",
        height: heights[size],
        background: "#000",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Canvas
        shadows
        camera={{ position: [0, 0.5, 4], fov: 42 }}
        gl={{ preserveDrawingBuffer: true, powerPreference: "default" }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
        }}
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
        <pointLight position={[0, 2, -3]} intensity={0.6} color={safeColor} distance={5} />
        <Suspense fallback={fallback3d}>
          <PresentationControls global polar={[-0.1, 0.1]} azimuth={[-0.4, 0.4]} snap>
            <ModelErrorBoundary fallback={fallback3d}>
              <Model facingRight={facingRight} />
            </ModelErrorBoundary>
          </PresentationControls>
          <ContactShadows position={[0, -1.4, 0]} opacity={0.9} scale={6} blur={2} color="#000" />
          <SafeEnvironment />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload("/models/default-boxer.glb");
