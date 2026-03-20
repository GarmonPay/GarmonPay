"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type FightAnim = "idle" | "punch" | "block" | "knockout" | "victory";

/**
 * Neutral dark-metallic stand-in when a Meshy GLB fails — reads as equipment/mannequin, not cartoon mascot.
 */
export function ProceduralFallbackBoxer({
  facingRight = false,
  accent = "#c9a227",
  anim = "idle",
}: {
  facingRight?: boolean;
  accent?: string;
  anim?: FightAnim;
}) {
  const group = useRef<THREE.Group>(null);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#1a1a1f"),
        metalness: 0.65,
        roughness: 0.35,
        envMapIntensity: 0.9,
      }),
    []
  );
  const accentMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(accent),
        metalness: 0.4,
        roughness: 0.45,
      }),
    [accent]
  );

  const t = useRef(0);
  const punchPhase = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    const g = group.current;
    if (!g) return;

    if (anim === "punch") punchPhase.current = Math.min(1, punchPhase.current + delta * 8);
    else punchPhase.current = Math.max(0, punchPhase.current - delta * 3);

    const idle = Math.sin(t.current * 2.2) * 0.012;
    g.rotation.z = idle;

    if (anim === "block") {
      g.rotation.x = -0.35;
      g.position.z = facingRight ? -0.08 : 0.08;
    } else if (anim === "knockout") {
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, facingRight ? -1.1 : 1.1, delta * 3);
      g.position.y = THREE.MathUtils.lerp(g.position.y, -0.35, delta * 2);
    } else if (anim === "victory") {
      g.rotation.y = Math.sin(t.current * 3) * 0.15;
      g.position.y = 0.05 + Math.sin(t.current * 4) * 0.02;
    } else {
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, delta * 6);
      g.position.y = THREE.MathUtils.lerp(g.position.y, 0, delta * 6);
      const p = Math.sin(punchPhase.current * Math.PI);
      g.position.z = facingRight ? -p * 0.22 : p * 0.22;
    }
  });

  const yRot = facingRight ? Math.PI : 0;

  return (
    <group ref={group} rotation={[0, yRot, 0]} position={[0, 0, 0]}>
      <mesh castShadow receiveShadow material={mat} position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.38, 1.1, 8, 16]} />
      </mesh>
      <mesh castShadow material={accentMat} position={[0, 1.75, 0.08]}>
        <sphereGeometry args={[0.28, 24, 24]} />
      </mesh>
      <mesh castShadow material={mat} position={[facingRight ? -0.45 : 0.45, 1.05, 0]} rotation={[0, 0, facingRight ? 0.5 : -0.5]}>
        <boxGeometry args={[0.15, 0.35, 0.15]} />
      </mesh>
    </group>
  );
}
