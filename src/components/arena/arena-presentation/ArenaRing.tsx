"use client";

import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ModelErrorBoundary } from "@/components/arena/meshy/ModelErrorBoundary";

/**
 * Premium procedural ring when no Meshy ring GLB is present or load fails.
 */
export function ProceduralArenaRing() {
  const posts: [number, number, number][] = [
    [-1, 0, -1],
    [1, 0, -1],
    [1, 0, 1],
    [-1, 0, 1],
  ];
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[3.4, 64]} />
        <meshStandardMaterial color="#070709" metalness={0.25} roughness={0.88} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[3.15, 3.35, 64]} />
        <meshStandardMaterial color="#1a1510" metalness={0.4} roughness={0.55} />
      </mesh>
      {posts.map((p, i) => (
        <mesh key={i} castShadow position={[p[0] * 3.05, 1.15, p[2] * 3.05]}>
          <cylinderGeometry args={[0.07, 0.08, 2.35, 14]} />
          <meshStandardMaterial color="#2c2c36" metalness={0.65} roughness={0.32} />
        </mesh>
      ))}
      {[0.45, 1.0, 1.55].map((y, idx) => (
        <mesh key={idx} castShadow position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[3.08, 0.022, 10, 64]} />
          <meshStandardMaterial color="#b89850" metalness={0.55} roughness={0.38} />
        </mesh>
      ))}
      <spotLight position={[0, 5.5, 0]} angle={0.95} penumbra={0.9} intensity={0.35} color="#ffe8c8" distance={12} />
    </group>
  );
}

function MeshyRingFromUrl({ url }: { url: string }) {
  const gltf = useGLTF(url);

  const scene = useMemo(() => {
    try {
      if (!gltf || !gltf.scene) {
        console.error("GLTF FAILED TO LOAD (ring)", gltf);
        return null;
      }
      const src = gltf.scene;
      const c =
        typeof src.clone === "function" ? src.clone(true) : (src as THREE.Object3D);
      if (!c) return null;
      c.traverse((o) => {
        if (o == null) return;
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      c.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(c);
      const size = new THREE.Vector3();
      box.getSize(size);
      const max = Math.max(size.x, size.y, size.z, 0.001);
      if (!Number.isFinite(max) || max <= 0) return null;
      const target = 6.2;
      const s = target / max;
      c.scale.setScalar(s);
      c.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(c);
      c.position.y -= b2.min.y;
      c.updateMatrixWorld(true);
      return c;
    } catch (e) {
      console.error("[MeshyRingFromUrl] prepare failed", e);
      return null;
    }
  }, [gltf]);

  if (!scene) {
    return <ProceduralArenaRing />;
  }

  return <primitive object={scene} />;
}

/** Pass `meshyRingUrl` (e.g. `/assets/meshy/rings/arena-ring.glb`) when committed; otherwise procedural ring. */
export function ArenaRing({ meshyRingUrl }: { meshyRingUrl?: string | null }) {
  const url = meshyRingUrl?.trim();
  if (!url) return <ProceduralArenaRing />;
  return (
    <ModelErrorBoundary fallback={<ProceduralArenaRing />}>
      <Suspense fallback={<ProceduralArenaRing />}>
        <MeshyRingFromUrl key={url} url={url} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
