"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SKIN = "#e8b896";
const SHORTS = "#4b5563";
const SHORTS_STRIPE = "#ffffff";
const GLOVES = "#c1272d";
const BOOTS = "#111111";

/** Fallback fighter in boxing guard stance (orthodox): fists up, elbows in, left foot forward. */
export function FallbackFighter3D({
  color = "#f0a500",
  animation = "idle",
}: {
  color?: string;
  animation?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftGloveRef = useRef<THREE.Group>(null);
  const rightGloveRef = useRef<THREE.Group>(null);
  const phaseRef = useRef(0);
  const weightShiftRef = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    phaseRef.current += delta;
    const group = groupRef.current;
    const head = headRef.current;
    const leftGlove = leftGloveRef.current;
    const rightGlove = rightGloveRef.current;

    if (!group) return;

    const isPunch = animation === "punch-left" || animation === "punch-right" || animation === "fighting";

    if (isPunch) {
      weightShiftRef.current = 0.15;
    } else {
      weightShiftRef.current += delta * 0.5;
      if (weightShiftRef.current > Math.PI * 2) weightShiftRef.current -= Math.PI * 2;
    }

    const bounce = Math.sin(t * 1.8) * 0.008;
    const weightShift = Math.sin(weightShiftRef.current * 0.5) * 0.015;
    group.position.y = bounce;
    group.position.x = weightShift;

    if (head && !isPunch) {
      head.rotation.y = Math.sin(t * 0.4) * 0.06;
    }
    if (leftGlove && !isPunch) {
      const orbit = t * 0.6;
      leftGlove.position.x = Math.sin(orbit) * 0.02;
      leftGlove.position.z = Math.cos(orbit) * 0.02;
    }
    if (rightGlove && !isPunch) {
      const orbit = t * 0.6 + 0.5;
      rightGlove.position.x = Math.sin(orbit) * 0.02;
      rightGlove.position.z = Math.cos(orbit) * 0.02;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]} scale={[0.5, 0.5, 0.5]}>
      {/* Legs: orthodox stance, left foot slightly forward, knees slightly bent */}
      <group position={[0, 0.35, 0]}>
        <mesh position={[-0.12, -0.35, 0.06]} castShadow receiveShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.4, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        <mesh position={[0.12, -0.35, -0.02]} castShadow receiveShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.4, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        {/* Shorts: waist/hips, dark grey, white stripe on sides */}
        <mesh position={[0, 0.02, 0.02]} castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.12, 8]} />
          <meshStandardMaterial color={SHORTS} roughness={0.9} metalness={0} />
        </mesh>
        <mesh position={[-0.2, 0.02, 0.02]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.04, 0.14, 0.02]} />
          <meshStandardMaterial color={SHORTS_STRIPE} roughness={0.8} />
        </mesh>
        <mesh position={[0.2, 0.02, 0.02]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.04, 0.14, 0.02]} />
          <meshStandardMaterial color={SHORTS_STRIPE} roughness={0.8} />
        </mesh>
        {/* Boots */}
        <mesh position={[-0.12, -0.55, 0.06]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.2]} />
          <meshStandardMaterial color={BOOTS} roughness={0.9} metalness={0} />
        </mesh>
        <mesh position={[0.12, -0.55, -0.02]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.2]} />
          <meshStandardMaterial color={BOOTS} roughness={0.9} metalness={0} />
        </mesh>
      </group>

      {/* Torso: wider shoulders, narrower waist, defined chest */}
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.32, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 0.78, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.08, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>

      {/* Head: round, slight forward lean built into position */}
      <group ref={headRef} position={[0, 0.92, 0.02]}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.12, 16, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        {/* Simple short hair on top */}
        <mesh position={[0, 0.06, -0.04]} castShadow>
          <sphereGeometry args={[0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.4]} />
          <meshStandardMaterial color="#2d2d2d" roughness={0.9} metalness={0} />
        </mesh>
      </group>

      {/* Arms in guard: elbows tucked, fists up near face */}
      {/* Left arm: upper arm in, forearm + glove up */}
      <group position={[-0.18, 0.72, 0.05]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.2, 6]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        <group position={[-0.06, -0.12, 0.08]} rotation={[0.6, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.035, 0.04, 0.18, 6]} />
            <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
          </mesh>
          <group ref={leftGloveRef} position={[0, -0.1, 0.02]}>
            <mesh castShadow>
              <sphereGeometry args={[0.07, 12, 10]} />
              <meshStandardMaterial color={GLOVES} roughness={0.6} metalness={0.1} />
            </mesh>
          </group>
        </group>
      </group>
      {/* Right arm */}
      <group position={[0.18, 0.72, 0.05]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.2, 6]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        <group position={[0.06, -0.12, 0.08]} rotation={[0.6, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.035, 0.04, 0.18, 6]} />
            <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
          </mesh>
          <group ref={rightGloveRef} position={[0, -0.1, 0.02]}>
            <mesh castShadow>
              <sphereGeometry args={[0.07, 12, 10]} />
              <meshStandardMaterial color={GLOVES} roughness={0.6} metalness={0.1} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
