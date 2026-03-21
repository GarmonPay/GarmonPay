"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ModelErrorBoundary } from "@/components/arena/meshy/ModelErrorBoundary";

export type SpectateMeshyProofCanvasProps = {
  modelUrl: string;
  onLoadSuccess: () => void;
  onLoadFailed: (message: string, failedUrl: string) => void;
};

function normalizeProofScene(root: THREE.Object3D) {
  try {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z) || size.lengthSq() < 1e-18) {
      console.warn("[SpectateMeshyProof] Empty or invalid bounds; skipping normalize.");
      return;
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.sub(center);
    root.updateMatrixWorld(true);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    if (!Number.isFinite(maxDim) || maxDim <= 0) return;
    const s = 1.8 / maxDim;
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root);
    root.position.y -= b2.min.y;
    root.updateMatrixWorld(true);
  } catch (e) {
    console.error("[SpectateMeshyProof] normalizeProofScene failed", e);
  }
}

function prepareProofRoot(gltf: { scene?: THREE.Object3D | null } | null): THREE.Object3D | null {
  try {
    if (gltf?.scene == null) return null;
    const scene = gltf.scene;
    const base = typeof scene.clone === "function" ? scene.clone(true) : scene;
    base.traverse((o) => {
      if (o == null) return;
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    normalizeProofScene(base);
    return base;
  } catch (e) {
    console.error("[SpectateMeshyProof] prepareProofRoot failed", e);
    return null;
  }
}

function RedBoxPlaceholder() {
  return (
    <mesh position={[0, 0.5, 0]} castShadow>
      <boxGeometry args={[0.85, 0.85, 0.85]} />
      <meshStandardMaterial color="#cc2222" roughness={0.45} metalness={0.15} />
    </mesh>
  );
}

function ProofGltf({
  url,
  onLoadSuccess,
  onLoadFailed,
}: {
  url: string;
  onLoadSuccess: () => void;
  onLoadFailed: (message: string, failedUrl: string) => void;
}) {
  const gltf = useGLTF(url) as { scene?: THREE.Object3D | null };
  const root = useMemo(() => prepareProofRoot(gltf), [gltf]);

  useEffect(() => {
    if (root) {
      onLoadSuccess();
      return;
    }
    const msg = "[SpectateMeshyProof] GLB decoded but scene preparation returned null";
    console.error(msg, { url });
    onLoadFailed(msg, url);
  }, [root, url, onLoadSuccess, onLoadFailed]);

  if (!root) {
    return <RedBoxPlaceholder />;
  }

  return <primitive object={root} />;
}

function SceneContent({ modelUrl, onLoadSuccess, onLoadFailed }: SpectateMeshyProofCanvasProps) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 12, 8]} intensity={1.35} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[28, 28]} />
        <meshStandardMaterial color="#2e2e38" />
      </mesh>
      <ModelErrorBoundary
        fallback={<RedBoxPlaceholder />}
        onCaught={(err) => {
          const msg = err instanceof Error ? err.message : String(err);
          const detail = `${msg} | loader error`;
          console.error("[SpectateMeshyProof] ModelErrorBoundary — failing URL:", modelUrl, err);
          onLoadFailed(detail, modelUrl);
        }}
      >
        <Suspense fallback={null}>
          <ProofGltf url={modelUrl} onLoadSuccess={onLoadSuccess} onLoadFailed={onLoadFailed} />
        </Suspense>
      </ModelErrorBoundary>
    </>
  );
}

/**
 * Single 3D path for spectate proof: lights + ground + one GLB (or red box on failure).
 * No ring, referee, fight animations, or legacy ArenaFightPresentation.
 */
export function SpectateMeshyProofCanvas({ modelUrl, onLoadSuccess, onLoadFailed }: SpectateMeshyProofCanvasProps) {
  const safeUrl = typeof modelUrl === "string" && modelUrl.trim().length > 0 ? modelUrl.trim() : "";

  if (!safeUrl) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-t-xl bg-black text-sm text-red-400"
        style={{ minHeight: 380, height: "min(52vh, 520px)" }}
      >
        No model URL — cannot load Meshy proof scene.
      </div>
    );
  }

  return (
    <div className="w-full rounded-t-xl bg-black" style={{ minHeight: 380, height: "min(52vh, 520px)" }}>
      <Canvas
        shadows
        camera={{ position: [0, 1.15, 3.8], fov: 42, near: 0.1, far: 120 }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor("#070708");
        }}
      >
        <SceneContent modelUrl={safeUrl} onLoadSuccess={onLoadSuccess} onLoadFailed={onLoadFailed} />
      </Canvas>
    </div>
  );
}
