"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SKIN = "#d4956a";
const GLOVES = "#c1272d";
const SHORTS_COLOR = "#0a0f1e";
const BOOTS_COLOR = "#111111";
const HAIR_COLOR = "#2a2a2a";

/**
 * Realistic fallback boxer in orthodox guard stance.
 * No stats text — purely visual geometry.
 */
export function FallbackFighter3D({
  color = "#f0a500",
  animation = "idle",
}: {
  color?: string;
  animation?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const group = groupRef.current;
    const head = headRef.current;
    if (!group) return;

    const isPunch =
      animation === "punch-left" ||
      animation === "punch-right" ||
      animation === "fighting";

    // Idle breathing bob
    group.position.y = Math.sin(t * 1.2) * 0.008;

    // Forward lunge during punching animations
    if (isPunch) {
      group.position.z = Math.sin(t * 8) * 0.02;
    } else {
      group.position.z = 0;
    }

    // Head slight bob
    if (head) {
      head.rotation.x = Math.sin(t * 1.2) * 0.02;
    }
  });

  return (
    /* Orthodox stance: slightly sideways */
    <group ref={groupRef} rotation={[0, Math.PI * 0.15, 0]} scale={[0.5, 0.5, 0.5]}>
      {/* ── BOOTS ─────────────────────────────────────────────── */}
      {/* Right boot (back foot) */}
      <mesh position={[-0.14, -0.55, -0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.12, 0.28]} />
        <meshStandardMaterial color={BOOTS_COLOR} roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Right boot heel bump */}
      <mesh position={[-0.14, -0.52, -0.16]} castShadow>
        <boxGeometry args={[0.16, 0.06, 0.08]} />
        <meshStandardMaterial color={BOOTS_COLOR} roughness={0.9} metalness={0} />
      </mesh>
      {/* Left boot (front foot, lead) */}
      <mesh position={[0.14, -0.55, 0.14]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.12, 0.28]} />
        <meshStandardMaterial color={BOOTS_COLOR} roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Left boot heel bump */}
      <mesh position={[0.14, -0.52, 0.06]} castShadow>
        <boxGeometry args={[0.16, 0.06, 0.08]} />
        <meshStandardMaterial color={BOOTS_COLOR} roughness={0.9} metalness={0} />
      </mesh>

      {/* ── LOWER LEGS ────────────────────────────────────────── */}
      {/* Right lower leg */}
      <mesh position={[-0.14, -0.3, -0.08]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.45, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>
      {/* Left lower leg (slight forward lean) */}
      <mesh position={[0.14, -0.3, 0.12]} rotation={[-0.15, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.45, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>

      {/* ── SHORTS / HIPS ─────────────────────────────────────── */}
      <mesh position={[0, 0.05, 0.02]} castShadow receiveShadow>
        <cylinderGeometry args={[0.25, 0.28, 0.28, 8]} />
        <meshStandardMaterial color={SHORTS_COLOR} roughness={0.9} metalness={0} />
      </mesh>
      {/* Shorts lower section */}
      <mesh position={[0, -0.1, 0.02]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.25, 0.18, 8]} />
        <meshStandardMaterial color={SHORTS_COLOR} roughness={0.9} metalness={0} />
      </mesh>
      {/* Shorts waistband stripe */}
      <mesh position={[0, 0.19, 0.02]} castShadow>
        <cylinderGeometry args={[0.255, 0.255, 0.04, 8]} />
        <meshStandardMaterial color={GLOVES} roughness={0.85} metalness={0} />
      </mesh>

      {/* ── TORSO ─────────────────────────────────────────────── */}
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.44, 0.5, 0.28]} />
        <meshStandardMaterial color={SKIN} roughness={0.78} metalness={0} />
      </mesh>
      {/* Chest muscle hints */}
      <mesh position={[-0.1, 0.5, 0.14]} castShadow>
        <boxGeometry args={[0.14, 0.12, 0.04]} />
        <meshStandardMaterial color={SKIN} roughness={0.75} metalness={0} />
      </mesh>
      <mesh position={[0.1, 0.5, 0.14]} castShadow>
        <boxGeometry args={[0.14, 0.12, 0.04]} />
        <meshStandardMaterial color={SKIN} roughness={0.75} metalness={0} />
      </mesh>

      {/* ── NECK ──────────────────────────────────────────────── */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.14, 10]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>

      {/* ── HEAD ──────────────────────────────────────────────── */}
      <mesh ref={headRef} position={[0, 0.9, 0.04]} castShadow receiveShadow>
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>
      {/* Hair cap */}
      <mesh position={[0, 0.99, 0.0]} castShadow>
        <sphereGeometry args={[0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
        <meshStandardMaterial color={HAIR_COLOR} roughness={0.9} metalness={0} />
      </mesh>

      {/* ── RIGHT ARM (back/power hand, near chin) ────────────── */}
      {/* Right upper arm */}
      <mesh position={[0.22, 0.55, 0.02]} rotation={[0.5, 0, -0.2]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.28, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>
      {/* Right forearm */}
      <mesh position={[0.24, 0.7, 0.14]} rotation={[0.8, 0, -0.15]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.24, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>
      {/* Right glove (close to chin) */}
      <mesh position={[0.22, 0.82, 0.26]} scale={[1, 1.2, 1]} castShadow>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color={GLOVES} roughness={0.6} metalness={0.08} />
      </mesh>

      {/* ── LEFT ARM (lead/jab hand, extended forward) ────────── */}
      {/* Left upper arm */}
      <mesh position={[-0.22, 0.52, 0.06]} rotation={[0.4, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.28, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>
      {/* Left forearm */}
      <mesh position={[-0.2, 0.6, 0.28]} rotation={[0.7, 0, 0.1]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.24, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>
      {/* Left glove (extended forward toward opponent) */}
      <mesh position={[-0.18, 0.72, 0.44]} scale={[1, 1.2, 1]} castShadow>
        <sphereGeometry args={[0.085, 12, 10]} />
        <meshStandardMaterial color={GLOVES} roughness={0.6} metalness={0.08} />
      </mesh>
    </group>
  );
}
