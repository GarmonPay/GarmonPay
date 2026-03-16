"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";

export type RefereeState =
  | "pre_fight"
  | "watching"
  | "knockdown"
  | "stopped"
  | "warning"
  | "round_end"
  | "arm_raise";

const SKIN = "#f4a460";
const SHIRT = "#ffffff";
const BOW_TIE = "#111111";
const TROUSERS = "#333333";
const SHOES = "#111111";

const REF_SCALE = 0.5;
const OVAL_X = 0.8;
const OVAL_Z = 0.6;
const WALK_SPEED = 0.25;

export function Referee3D({
  state = "watching",
  winnerSide = null,
  knockdownCount = 0,
  position = [0, 0, 0],
}: {
  state?: RefereeState;
  winnerSide?: "left" | "right" | null;
  knockdownCount?: number;
  position?: [number, number, number];
}) {
  const rootRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const phaseRef = useRef(0);
  const countStartRef = useRef(0);
  const lastStateRef = useRef(state);

  if (state !== lastStateRef.current) {
    lastStateRef.current = state;
    if (state === "knockdown") countStartRef.current = -1;
    phaseRef.current = 0;
  }

  useFrame((stateClock, delta) => {
    const t = stateClock.clock.elapsedTime;
    phaseRef.current += delta;
    const root = rootRef.current;
    const head = headRef.current;
    const leftArm = leftArmRef.current;
    const rightArm = rightArmRef.current;
    const bodyGroup = bodyGroupRef.current;
    if (!root) return;

    const [px, py, pz] = position;
    root.position.set(px, py, pz);

    switch (state) {
      case "watching": {
        const angle = t * WALK_SPEED;
        root.position.x = px + Math.cos(angle) * OVAL_X;
        root.position.z = pz + Math.sin(angle) * OVAL_Z;
        root.position.y = py + Math.sin(t * 3) * 0.02;
        if (head) head.rotation.y = Math.sin(angle) * 0.15;
        if (leftArm) {
          leftArm.rotation.x = 0.1 + Math.sin(t * 2) * 0.05;
          leftArm.rotation.z = 0.2;
        }
        if (rightArm) {
          rightArm.rotation.x = 0.1 + Math.sin(t * 2 + 0.5) * 0.05;
          rightArm.rotation.z = -0.2;
        }
        break;
      }
      case "pre_fight": {
        if (phaseRef.current < 1.5) {
          if (leftArm) {
            leftArm.rotation.x = THREE.MathUtils.lerp(0.2, -0.5, Math.min(1, phaseRef.current / 0.5));
            leftArm.rotation.z = THREE.MathUtils.lerp(0.2, 0.8, Math.min(1, phaseRef.current / 0.5));
          }
          if (rightArm) {
            rightArm.rotation.x = THREE.MathUtils.lerp(0.2, -0.5, Math.min(1, phaseRef.current / 0.5));
            rightArm.rotation.z = THREE.MathUtils.lerp(-0.2, -0.8, Math.min(1, phaseRef.current / 0.5));
          }
        } else if (phaseRef.current < 2.2) {
          root.position.z = pz + (phaseRef.current - 1.5) * 0.4;
          if (rightArm) {
            rightArm.rotation.x = -0.5 + (phaseRef.current - 1.5) * 2.2;
            rightArm.rotation.z = -0.8;
          }
        } else {
          if (rightArm) rightArm.rotation.x = 1.05;
        }
        break;
      }
      case "knockdown": {
        if (bodyGroup) bodyGroup.rotation.x = 0.6;
        if (countStartRef.current < 0) countStartRef.current = stateClock.clock.elapsedTime;
        if (rightArm) {
          rightArm.rotation.x = 0.4 + Math.sin(t * 8) * 0.3;
        }
        break;
      }
      case "stopped": {
        if (leftArm) {
          leftArm.rotation.x = -0.7 + Math.sin(t * 4) * 0.2;
          leftArm.rotation.z = 0.5;
        }
        if (rightArm) {
          rightArm.rotation.x = -0.7 + Math.sin(t * 4 + 0.5) * 0.2;
          rightArm.rotation.z = -0.5;
        }
        break;
      }
      case "warning": {
        root.position.x = px + 0.2;
        if (rightArm) {
          rightArm.rotation.x = -0.3;
          rightArm.rotation.z = -0.9;
        }
        if (leftArm) leftArm.rotation.x = 0.2;
        break;
      }
      case "round_end": {
        if (leftArm) {
          leftArm.rotation.x = -0.4;
          leftArm.rotation.z = 0.7;
        }
        if (rightArm) {
          rightArm.rotation.x = -0.4;
          rightArm.rotation.z = -0.7;
        }
        break;
      }
      case "arm_raise": {
        const side = winnerSide === "left" ? -1 : 1;
        root.position.x = px + side * 0.6;
        if (side < 0 && rightArm) {
          rightArm.rotation.x = -0.2;
          rightArm.rotation.z = -0.9;
          rightArm.rotation.y = 0.3;
        }
        if (side > 0 && leftArm) {
          leftArm.rotation.x = -0.2;
          leftArm.rotation.z = 0.9;
          leftArm.rotation.y = -0.3;
        }
        break;
      }
      default:
        break;
    }
  });

  const showFightText = state === "pre_fight" && phaseRef.current > 1.8 && phaseRef.current < 2.8;
  const showCount = state === "knockdown" && knockdownCount > 0 && knockdownCount <= 10;
  const showKO = state === "stopped" || (state === "arm_raise" && winnerSide);
  const showWarning = state === "warning";

  return (
    <group ref={rootRef} scale={REF_SCALE}>
      {/* Torso group: neck, head, body, bow tie, arms */}
      <group ref={bodyGroupRef} position={[0, 0.75, 0]}>
        {/* Head */}
        <group ref={headRef} position={[0, 0.22, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.15, 12, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0} />
          </mesh>
        </group>
        {/* Neck */}
        <mesh position={[0, 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 0.12, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0} />
        </mesh>
        {/* Torso / shirt */}
        <mesh position={[0, -0.05, 0]} castShadow>
          <boxGeometry args={[0.22, 0.28, 0.12]} />
          <meshStandardMaterial color={SHIRT} roughness={0.9} metalness={0} />
        </mesh>
        {/* Bow tie */}
        <mesh position={[0, 0.02, 0.07]} castShadow>
          <boxGeometry args={[0.08, 0.03, 0.02]} />
          <meshStandardMaterial color={BOW_TIE} roughness={0.5} metalness={0} />
        </mesh>
        {/* Left arm: upper + lower + hand */}
        <group ref={leftArmRef} position={[0.14, 0.02, 0]} rotation={[0.1, 0, 0.2]}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.04, 0.24, 8]} />
            <meshStandardMaterial color={SHIRT} roughness={0.9} metalness={0} />
          </mesh>
          <mesh position={[0, -0.28, 0.02]} castShadow>
            <cylinderGeometry args={[0.025, 0.035, 0.2, 8]} />
            <meshStandardMaterial color={SHIRT} roughness={0.9} metalness={0} />
          </mesh>
          <mesh position={[0, -0.4, 0.03]} castShadow>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0} />
          </mesh>
        </group>
        {/* Right arm */}
        <group ref={rightArmRef} position={[-0.14, 0.02, 0]} rotation={[0.1, 0, -0.2]}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.04, 0.24, 8]} />
            <meshStandardMaterial color={SHIRT} roughness={0.9} metalness={0} />
          </mesh>
          <mesh position={[0, -0.28, 0.02]} castShadow>
            <cylinderGeometry args={[0.025, 0.035, 0.2, 8]} />
            <meshStandardMaterial color={SHIRT} roughness={0.9} metalness={0} />
          </mesh>
          <mesh position={[0, -0.4, 0.03]} castShadow>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0} />
          </mesh>
        </group>
      </group>
      {/* Legs */}
      <group position={[0, 0.35, 0]}>
        <mesh position={[0.06, -0.2, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.055, 0.28, 8]} />
          <meshStandardMaterial color={TROUSERS} roughness={0.9} metalness={0} />
        </mesh>
        <mesh position={[0.06, -0.42, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.22, 8]} />
          <meshStandardMaterial color={TROUSERS} roughness={0.9} metalness={0} />
        </mesh>
        <mesh position={[0.06, -0.56, 0.04]} castShadow>
          <boxGeometry args={[0.1, 0.05, 0.14]} />
          <meshStandardMaterial color={SHOES} roughness={0.7} metalness={0.1} />
        </mesh>
        <mesh position={[-0.06, -0.2, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.055, 0.28, 8]} />
          <meshStandardMaterial color={TROUSERS} roughness={0.9} metalness={0} />
        </mesh>
        <mesh position={[-0.06, -0.42, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.22, 8]} />
          <meshStandardMaterial color={TROUSERS} roughness={0.9} metalness={0} />
        </mesh>
        <mesh position={[-0.06, -0.56, 0.04]} castShadow>
          <boxGeometry args={[0.1, 0.05, 0.14]} />
          <meshStandardMaterial color={SHOES} roughness={0.7} metalness={0.1} />
        </mesh>
      </group>
      {/* Floating labels */}
      {showFightText && (
        <Text position={[0, 0.8, 0.5]} fontSize={0.2} color="#f0a500" anchorX="center" anchorY="middle">
          FIGHT!
        </Text>
      )}
      {showCount && (
        <Text position={[0, 0.6, 0.3]} fontSize={0.25} color="#ffffff" anchorX="center" anchorY="middle">
          {knockdownCount}
        </Text>
      )}
      {showKO && (
        <Text position={[0, 0.9, 0.2]} fontSize={0.18} color="#f0a500" anchorX="center" anchorY="middle">
          {state === "arm_raise" ? "VICTORY" : "FIGHT OVER"}
        </Text>
      )}
      {showWarning && (
        <Text position={[0.4, 0.5, 0]} fontSize={0.15} color="#eab308" anchorX="center" anchorY="middle">
          WARNING
        </Text>
      )}
    </group>
  );
}
