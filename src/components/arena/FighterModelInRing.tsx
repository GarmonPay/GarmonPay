"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

const GOLD = "#f0a500";
const RED = "#c1272d";

function PlaceholderBox({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.3;
  });
  return (
    <mesh ref={ref} position={[0, 0.5, 0]} scale={[0.4, 0.8, 0.3]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} metalness={0.4} roughness={0.6} />
    </mesh>
  );
}

function ModelInRing({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const clone = scene.clone();
  return (
    <primitive
      object={clone}
      position={[0, 0, 0]}
      scale={0.8}
      rotation={[0, 0, 0]}
    />
  );
}

export function FighterModelInRing({
  modelUrl,
  color = GOLD,
  animation = "idle",
}: {
  modelUrl?: string | null;
  color?: string;
  animation?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const punchTime = useRef(0);

  if (animation === "punch-left" || animation === "fighting") punchTime.current = 0.2;
  if (animation === "punch-right") punchTime.current = 0.2;

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (punchTime.current > 0) {
      groupRef.current.position.x = (Math.random() - 0.5) * 0.05;
      punchTime.current -= delta;
    } else {
      groupRef.current.position.x = 0;
    }
  });

  return (
    <group ref={groupRef}>
      {modelUrl ? (
        <ModelInRing url={modelUrl} />
      ) : (
        <PlaceholderBox color={color} />
      )}
    </group>
  );
}
