"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import RealisticFighter from "./RealisticFighter";

function ModelInRing({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const clone = scene.clone();
  return <primitive object={clone} position={[0, 0, 0]} scale={0.8} rotation={[0, 0, 0]} />;
}

export function FighterModelInRing({
  modelUrl,
  color = "#f0a500",
  animation = "idle",
  fighter,
}: {
  modelUrl?: string | null;
  color?: string;
  animation?: string;
  fighter?: any;
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
      ) : fighter ? (
        <RealisticFighter
          fighter={fighter}
          pose={animation === 'victory' ? 'victory' : animation === 'defeat' ? 'defeat' : 'orthodox_guard'}
          animation={animation}
          position={[0, -0.5, 0]}
          scale={0.8}
        />
      ) : (
        <RealisticFighter
          fighter={{
            fighter_color: color,
            body_type: 'middleweight',
            skin_tone: 'tone3',
            equipped_gloves: 'default',
            equipped_shorts: 'default',
            equipped_shoes: 'default',
          }}
          pose="orthodox_guard"
          animation={animation}
          position={[0, -0.5, 0]}
          scale={0.8}
        />
      )}
    </group>
  );
}
