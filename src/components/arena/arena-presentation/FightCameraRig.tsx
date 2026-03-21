"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export function FightCameraRig({
  mode,
  exchangeKey,
  koIntensity = 0,
}: {
  mode: string;
  exchangeKey: number;
  koIntensity?: number;
}) {
  const { camera } = useThree();
  const goal = useRef(new THREE.Vector3(0, 1.25, 4.15));
  const look = useRef(new THREE.Vector3(0, 1.05, 0));
  const bump = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (mode === "victory") {
      goal.current.set(-0.35, 1.45, 5.2);
    } else if (mode === "ko") {
      goal.current.set(0.2 + koIntensity * 0.2, 1.0, 3.1);
    } else if (mode === "fight") {
      goal.current.set(0, 1.18, 3.85);
    } else {
      goal.current.set(0, 1.35, 4.6);
    }
  }, [mode, koIntensity]);

  useEffect(() => {
    if (!exchangeKey) return;
    bump.current.set((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.04);
  }, [exchangeKey]);

  useFrame((_, delta) => {
    if (camera == null) return;
    bump.current.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-delta * 5));
    const g = goal.current.clone().add(bump.current);
    camera.position.lerp(g, 1 - Math.exp(-delta * 4.2));
    look.current.lerp(new THREE.Vector3(0, 1.02, 0), 1 - Math.exp(-delta * 3));
    camera.lookAt(look.current);
  });

  return null;
}
