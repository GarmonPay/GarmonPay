"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { FightAnim } from "./ProceduralFallbackBoxer";

const TARGET_HEIGHT = 1.72;

function normalizeScene(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z) || size.lengthSq() < 1e-18) {
    console.warn("[CenteredMeshyModel] Empty or invalid bounds; skipping normalize.");
    return;
  }
  box.getCenter(center);
  root.position.sub(center);
  root.updateMatrixWorld(true);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return;
  const s = TARGET_HEIGHT / maxDim;
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  root.position.y -= b2.min.y;
  root.updateMatrixWorld(true);
}

type Props = {
  url: string;
  facingRight?: boolean;
  anim?: FightAnim;
};

/**
 * Loads GLB/GLTF with stable scale, floor pivot, shadows.
 * Set `NEXT_PUBLIC_MESHY_DRACO=1` when assets are Draco-compressed.
 */
export function CenteredMeshyModel({ url, facingRight = false, anim = "idle" }: Props) {
  const useDraco = typeof process !== "undefined" && process.env.NEXT_PUBLIC_MESHY_DRACO === "1";
  const gltf = useGLTF(url, useDraco) as { scene?: THREE.Group };
  const root = useMemo(() => {
    const scene = gltf?.scene;
    if (!scene || typeof scene.clone !== "function") {
      throw new Error("[CenteredMeshyModel] GLTF scene missing or invalid (undefined is not an object)");
    }
    const r = scene.clone(true);
    r.traverse((o) => {
      const obj = o as THREE.Mesh;
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        const m = obj.material;
        if (m && !Array.isArray(m) && "envMapIntensity" in m) {
          (m as THREE.MeshStandardMaterial).envMapIntensity =
            (m as THREE.MeshStandardMaterial).envMapIntensity ?? 1;
        }
      }
    });
    normalizeScene(r);
    return r;
  }, [gltf]);

  const group = useRef<THREE.Group>(null);
  const punchPhase = useRef(0);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    const g = group.current;
    if (!g) return;

    if (anim === "punch") punchPhase.current = Math.min(1, punchPhase.current + delta * 9);
    else punchPhase.current = Math.max(0, punchPhase.current - delta * 2.5);

    const idle = Math.sin(t.current * 2) * 0.015;
    g.rotation.y = (facingRight ? Math.PI : 0) + idle * 0.3;

    if (anim === "block") {
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -0.4, delta * 8);
      g.position.z = THREE.MathUtils.lerp(g.position.z, facingRight ? -0.12 : 0.12, delta * 8);
    } else if (anim === "knockout") {
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, facingRight ? -1.05 : 1.05, delta * 2.5);
      g.position.y = THREE.MathUtils.lerp(g.position.y, -0.4, delta * 2);
    } else if (anim === "victory") {
      g.rotation.y = (facingRight ? Math.PI : 0) + Math.sin(t.current * 2.8) * 0.12;
      g.position.y = 0.04 + Math.sin(t.current * 4) * 0.03;
    } else {
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, delta * 6);
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, idle, delta * 4);
      g.position.y = THREE.MathUtils.lerp(g.position.y, 0, delta * 6);
      const p = Math.sin(punchPhase.current * Math.PI);
      g.position.z = facingRight ? -p * 0.28 : p * 0.28;
    }
  });

  return (
    <group ref={group}>
      <primitive object={root} />
    </group>
  );
}
