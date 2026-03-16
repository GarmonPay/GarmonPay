"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SKIN = "#d4956a";
const GLOVE = "#c1272d";
const SHORTS = "#0a0f1e";
const BOOT = "#111111";
const HAIR = "#1a1a1a";

function darkenHex(hex: string, factor = 0.6): string {
  const clean = hex.replace("#", "");
  const r = Math.round(parseInt(clean.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(clean.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(clean.slice(4, 6), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function FallbackFighter3D({
  color = "#f0a500",
  animation = "idle",
}: {
  color?: string;
  animation?: string;
}) {
  const shortsColor = color;
  const waistbandColor = darkenHex(color, 0.55);
  const groupRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!groupRef.current) return;

    const isPunch = animation === "punch-left" || animation === "punch-right" || animation === "fighting";

    // Idle breathing - torso rises and falls
    if (torsoRef.current) {
      torsoRef.current.position.y = 0.38 + Math.sin(t * 1.2) * 0.008;
    }
    // Head slight bob
    if (headRef.current) {
      headRef.current.rotation.x = Math.sin(t * 1.2) * 0.02;
    }
    // Punch lunge
    if (isPunch) {
      groupRef.current.position.z = Math.sin(t * 8) * 0.02;
    } else {
      groupRef.current.position.z = 0;
    }
    // Very subtle weight shift
    groupRef.current.position.x = Math.sin(t * 0.6) * 0.005;
  });

  return (
    // Orthodox stance: body rotated slightly sideways
    <group ref={groupRef} position={[0, 0, 0]} scale={[0.5, 0.5, 0.5]} rotation={[0, Math.PI * 0.15, 0]}>

      {/* === BOOTS === */}
      {/* Left boot (lead foot, forward) */}
      <mesh position={[0.14, -0.52, 0.16]} castShadow>
        <boxGeometry args={[0.18, 0.12, 0.3]} />
        <meshStandardMaterial color={BOOT} roughness={0.9} metalness={0} />
      </mesh>
      {/* Left boot heel bump */}
      <mesh position={[0.14, -0.5, 0.02]} castShadow>
        <boxGeometry args={[0.16, 0.08, 0.08]} />
        <meshStandardMaterial color={BOOT} roughness={0.9} metalness={0} />
      </mesh>
      {/* Right boot (rear foot) */}
      <mesh position={[-0.14, -0.52, -0.1]} castShadow>
        <boxGeometry args={[0.18, 0.12, 0.3]} />
        <meshStandardMaterial color={BOOT} roughness={0.9} metalness={0} />
      </mesh>
      {/* Right boot heel bump */}
      <mesh position={[-0.14, -0.5, -0.22]} castShadow>
        <boxGeometry args={[0.16, 0.08, 0.08]} />
        <meshStandardMaterial color={BOOT} roughness={0.9} metalness={0} />
      </mesh>

      {/* === LOWER LEGS === */}
      {/* Left lower leg (slightly forward lean) */}
      <mesh position={[0.14, -0.28, 0.1]} rotation={[-0.12, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.08, 0.46, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>
      {/* Right lower leg */}
      <mesh position={[-0.14, -0.3, -0.06]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.08, 0.44, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>

      {/* === UPPER LEGS / THIGHS === */}
      {/* Left thigh */}
      <mesh position={[0.13, 0.02, 0.06]} rotation={[-0.08, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.38, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>
      {/* Right thigh */}
      <mesh position={[-0.13, 0.0, -0.04]} castShadow receiveShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.38, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>

      {/* === SHORTS === */}
      {/* Main shorts body */}
      <mesh position={[0, 0.12, 0.02]} castShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.32, 10]} />
        <meshStandardMaterial color={shortsColor} roughness={0.9} metalness={0} />
      </mesh>
      {/* Waistband */}
      <mesh position={[0, 0.28, 0.02]} castShadow>
        <cylinderGeometry args={[0.23, 0.23, 0.06, 10]} />
        <meshStandardMaterial color={waistbandColor} roughness={0.85} metalness={0.1} />
      </mesh>
      {/* Gold trim stripe */}
      <mesh position={[0, 0.31, 0.02]}>
        <cylinderGeometry args={[0.234, 0.234, 0.018, 10]} />
        <meshStandardMaterial color="#f0a500" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* === TORSO === */}
      <group ref={torsoRef} position={[0, 0.38, 0]}>
        {/* Main torso - BoxGeometry wider at shoulders */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.46, 0.52, 0.3]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        {/* Chest muscle left */}
        <mesh position={[-0.11, 0.06, 0.15]} castShadow>
          <boxGeometry args={[0.16, 0.14, 0.06]} />
          <meshStandardMaterial color={SKIN} roughness={0.75} metalness={0} />
        </mesh>
        {/* Chest muscle right */}
        <mesh position={[0.11, 0.06, 0.15]} castShadow>
          <boxGeometry args={[0.16, 0.14, 0.06]} />
          <meshStandardMaterial color={SKIN} roughness={0.75} metalness={0} />
        </mesh>
        {/* Shoulder left (wider silhouette) */}
        <mesh position={[-0.26, 0.18, 0]} castShadow>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        {/* Shoulder right */}
        <mesh position={[0.26, 0.18, 0]} castShadow>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>

        {/* === NECK === */}
        <mesh position={[0, 0.32, 0.02]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.16, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>

        {/* === HEAD === */}
        <group ref={headRef} position={[0, 0.52, 0.04]}>
          {/* Skull */}
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[0.17, 16, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
          </mesh>
          {/* Jaw / chin - slightly wider lower */}
          <mesh position={[0, -0.08, 0.02]}>
            <sphereGeometry args={[0.135, 10, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
          </mesh>
          {/* Hair cap */}
          <mesh position={[0, 0.08, -0.03]} castShadow>
            <sphereGeometry args={[0.155, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
            <meshStandardMaterial color={HAIR} roughness={0.95} metalness={0} />
          </mesh>
          {/* Ear left */}
          <mesh position={[-0.17, -0.02, 0]}>
            <sphereGeometry args={[0.04, 6, 5]} />
            <meshStandardMaterial color={SKIN} roughness={0.9} metalness={0} />
          </mesh>
          {/* Ear right */}
          <mesh position={[0.17, -0.02, 0]}>
            <sphereGeometry args={[0.04, 6, 5]} />
            <meshStandardMaterial color={SKIN} roughness={0.9} metalness={0} />
          </mesh>
        </group>

        {/* === RIGHT ARM - back hand near chin (guard) === */}
        {/* Right upper arm - pulled back and up */}
        <mesh position={[0.3, 0.1, 0.1]} rotation={[0.55, 0, -0.18]} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 0.3, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        {/* Right forearm - angled up toward chin */}
        <mesh position={[0.3, 0.28, 0.24]} rotation={[0.9, 0, -0.12]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.26, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        {/* Right glove - near chin/cheek */}
        <mesh position={[0.26, 0.44, 0.38]} scale={[1, 1.25, 1]} castShadow>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={GLOVE} roughness={0.6} metalness={0.05} />
        </mesh>

        {/* === LEFT ARM - lead hand extended forward === */}
        {/* Left upper arm */}
        <mesh position={[-0.3, 0.08, 0.08]} rotation={[0.42, 0, 0.15]} castShadow>
          <cylinderGeometry args={[0.065, 0.075, 0.3, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        {/* Left forearm - extended forward */}
        <mesh position={[-0.27, 0.2, 0.34]} rotation={[0.75, 0, 0.1]} castShadow>
          <cylinderGeometry args={[0.055, 0.065, 0.28, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
        </mesh>
        {/* Left glove - extended toward opponent at face height */}
        <mesh position={[-0.23, 0.36, 0.58]} scale={[1, 1.25, 1]} castShadow>
          <sphereGeometry args={[0.095, 12, 10]} />
          <meshStandardMaterial color={GLOVE} roughness={0.6} metalness={0.05} />
        </mesh>
      </group>

    </group>
  );
}
