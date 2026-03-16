"use client";

import { Suspense, useState, Component, ReactNode, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGLTF, ContactShadows, PresentationControls, Environment } from "@react-three/drei";

function Model({ url, onLoaded }: { url: string; onLoaded?: () => void }) {
  const { scene } = useGLTF(url);
  if (onLoaded) onLoaded();
  return <primitive object={scene} scale={1.5} position={[0, -1, 0]} />;
}

function SpinningGoldBox() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.8;
  });
  return (
    <mesh ref={ref} position={[0, 0, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.6, 0.6, 0.6]} />
      <meshStandardMaterial color="#f0a500" metalness={0.6} roughness={0.3} />
    </mesh>
  );
}

class ModelErrorBoundary extends Component<
  { fallback: ReactNode; onError: () => void; children?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError = () => ({ hasError: true });
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export default function Fighter3D({
  modelUrl,
  thumbnailUrl,
  fighterColor = "#f0a500",
  size = "medium",
  fallback = null,
}: {
  modelUrl?: string | null;
  thumbnailUrl?: string | null;
  fighterColor?: string;
  size?: "small" | "medium" | "large";
  fallback?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleModelError = () => setError(true);

  const heights: Record<string, number> = {
    small: 200,
    medium: 350,
    large: 500,
  };

  const h = heights[size] ?? 350;
  const hasModel = !!modelUrl && !error;

  if (error && fallback) {
    return <>{fallback}</>;
  }

  return (
    <div
      style={{
        height: h,
        width: "100%",
        borderRadius: 8,
        overflow: "hidden",
        background: "linear-gradient(180deg, #0a0a0a, #1a0a0a)",
        position: "relative",
      }}
    >
      {thumbnailUrl && !loaded && hasModel && (
        <img
          src={thumbnailUrl}
          alt="Fighter preview"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 0 : 1,
            transition: "opacity 0.4s ease",
          }}
        />
      )}
      <Canvas camera={{ position: [0, 0.5, 3], fov: 45 }} shadows>
        <ambientLight intensity={0.3} />
        <spotLight
          position={[0, 5, 3]}
          intensity={2}
          castShadow
          color={fighterColor}
        />
        <spotLight position={[-3, 3, -2]} intensity={1} color="#ffffff" />

        <Suspense fallback={<SpinningGoldBox />}>
          {hasModel ? (
            <ModelErrorBoundary fallback={<SpinningGoldBox />} onError={handleModelError}>
              <PresentationControls
                global
                rotation={[0, 0, 0]}
                polar={[-0.1, 0.1]}
                azimuth={[-0.5, 0.5]}
              >
                <Model url={modelUrl!} onLoaded={() => setLoaded(true)} />
              </PresentationControls>
            </ModelErrorBoundary>
          ) : (
            <PresentationControls
              global
              rotation={[0, 0, 0]}
              polar={[-0.1, 0.1]}
              azimuth={[-0.5, 0.5]}
            >
              <SpinningGoldBox />
            </PresentationControls>
          )}
          <ContactShadows
            position={[0, -1.4, 0]}
            opacity={0.7}
            scale={4}
            blur={2}
            color="#000000"
          />
          <Environment preset="night" />
        </Suspense>
      </Canvas>
    </div>
  );
}
