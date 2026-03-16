"use client";

import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { Referee3D, type RefereeState } from "./Referee3D";
import "./boxing-ring.css";

const GOLD = "#f0a500";
const RED = "#c1272d";
const NAVY = "#0f172a";
const DARK_GREY = "#1a1a1a";

function RingFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color={DARK_GREY} roughness={0.9} metalness={0.1} />
      </mesh>
      <Text
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.35}
        color="#f0a500"
        anchorX="center"
        anchorY="middle"
        maxWidth={3}
      >
        GARMONPAY
      </Text>
    </group>
  );
}

function CornerPostWithPad({
  position,
  padColor,
}: {
  position: [number, number, number];
  padColor: string;
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.06, 0.07, 1.1, 16]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.5, 16]} />
        <meshStandardMaterial color={padColor} roughness={0.85} metalness={0.1} />
      </mesh>
    </group>
  );
}

function Rope({ path, color }: { path: THREE.Vector3[]; color: string }) {
  const curve = new THREE.CatmullRomCurve3(path);
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 20, 0.04, 8, false]} />
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.7} />
    </mesh>
  );
}

function Ropes() {
  const y = 0.5;
  const half = 3.8;
  const ropes = [
    { color: GOLD, offset: 0.2 },
    { color: RED, offset: 0.35 },
    { color: GOLD, offset: 0.5 },
    { color: RED, offset: 0.65 },
  ];
  return (
    <group>
      {ropes.map((r, i) => (
        <Rope
          key={i}
          color={r.color}
          path={[
            new THREE.Vector3(-half, y + r.offset, -half),
            new THREE.Vector3(0, y + r.offset + 0.1, -half),
            new THREE.Vector3(half, y + r.offset, -half),
            new THREE.Vector3(half, y + r.offset, 0),
            new THREE.Vector3(half, y + r.offset, half),
            new THREE.Vector3(0, y + r.offset + 0.1, half),
            new THREE.Vector3(-half, y + r.offset, half),
            new THREE.Vector3(-half, y + r.offset, 0),
            new THREE.Vector3(-half, y + r.offset, -half),
          ]}
        />
      ))}
    </group>
  );
}

function Apron() {
  return (
    <group position={[0, -0.15, 0]}>
      <mesh position={[0, -0.2, 4.2]} receiveShadow>
        <boxGeometry args={[9, 0.3, 1.5]} />
        <meshStandardMaterial color={NAVY} roughness={0.9} metalness={0} />
      </mesh>
      <Text
        position={[0, -0.2, 4.2]}
        rotation={[0, 0, 0]}
        fontSize={0.25}
        color="#f0a500"
        anchorX="center"
        anchorY="middle"
        maxWidth={4}
      >
        GARMONPAY ARENA
      </Text>
    </group>
  );
}

const CROWD_COUNT = 80;
const CONFETTI_COUNT = 40;
function CrowdParticles({
  intensity = 1,
  celebration = 0,
  armsUp = false,
}: {
  intensity?: number;
  celebration?: number;
  armsUp?: boolean;
}) {
  const ref = useRef<THREE.Points>(null);
  const positions = useRef<Float32Array>(new Float32Array(CROWD_COUNT * 3));
  const rand = useRef(() => Math.random() - 0.5);

  useEffect(() => {
    const p = positions.current;
    for (let i = 0; i < CROWD_COUNT; i++) {
      p[i * 3] = rand.current() * 20;
      p[i * 3 + 1] = Math.random() * 4 + 1;
      p[i * 3 + 2] = 6 + Math.random() * 8;
    }
  }, []);

  const mult = 1 + celebration * 2;
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * (0.3 + intensity * 0.4 * mult);
    const pos = ref.current.geometry.attributes.position;
    const sway = armsUp ? 0.08 : 0.02;
    for (let i = 0; i < CROWD_COUNT; i++) {
      const baseX = pos.getX(i);
      pos.setX(i, baseX + Math.sin(t + i * 0.2) * sway);
      if (armsUp) pos.setY(i, pos.getY(i) + Math.sin(t * 2 + i * 0.3) * 0.03);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions.current, 3]}
          count={CROWD_COUNT}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color={celebration > 0 ? "#f0a500" : "#0a0a0a"}
        transparent
        opacity={0.5 + celebration * 0.2}
        sizeAttenuation
      />
    </points>
  );
}

function ConfettiParticles({ active = false }: { active?: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useRef<Float32Array>(new Float32Array(CONFETTI_COUNT * 3));
  const velocities = useRef<Float32Array>(new Float32Array(CONFETTI_COUNT * 3));

  useEffect(() => {
    const p = positions.current;
    const v = velocities.current;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      p[i * 3] = (Math.random() - 0.5) * 6;
      p[i * 3 + 1] = 5 + Math.random() * 3;
      p[i * 3 + 2] = (Math.random() - 0.5) * 4;
      v[i * 3] = (Math.random() - 0.5) * 0.02;
      v[i * 3 + 1] = -0.03 - Math.random() * 0.02;
      v[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    }
  }, [active]);

  useFrame((_, delta) => {
    if (!active || !ref.current) return;
    const p = ref.current.geometry.attributes.position;
    const v = velocities.current;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      p.setX(i, p.getX(i) + v[i * 3] * 60 * delta);
      p.setY(i, p.getY(i) + v[i * 3 + 1] * 60 * delta);
      p.setZ(i, p.getZ(i) + v[i * 3 + 2] * 60 * delta);
      if (p.getY(i) < -1) {
        p.setY(i, 5 + Math.random() * 2);
        p.setX(i, (Math.random() - 0.5) * 6);
      }
    }
    p.needsUpdate = true;
  });

  if (!active) return null;
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions.current, 3]}
          count={CONFETTI_COUNT}
        />
      </bufferGeometry>
      <pointsMaterial size={0.12} color="#f0a500" transparent opacity={0.9} sizeAttenuation />
    </points>
  );
}

function SpotLights({ winnerSide = null }: { winnerSide?: "left" | "right" | null }) {
  const ref1 = useRef<THREE.SpotLight>(null);
  const ref2 = useRef<THREE.SpotLight>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const sweep = winnerSide === "left" ? 1.5 : winnerSide === "right" ? 1.5 : 1;
    const f = 0.98 + Math.sin(t * 2) * 0.02;
    if (ref1.current) ref1.current.intensity = (winnerSide === "left" ? 3 : 2) * f * sweep;
    if (ref2.current) ref2.current.intensity = (winnerSide === "right" ? 3 : 2) * (1.02 - f * 0.02) * sweep;
  });
  return (
    <>
      <spotLight
        ref={ref1}
        position={[-2, 6, 0]}
        angle={0.4}
        penumbra={0.5}
        intensity={2}
        color={GOLD}
        castShadow
      />
      <spotLight
        ref={ref2}
        position={[2, 6, 0]}
        angle={0.4}
        penumbra={0.5}
        intensity={2}
        color={RED}
        castShadow
      />
      <spotLight position={[0, 8, 2]} angle={0.3} penumbra={0.6} intensity={1.5} color="#ffffff" />
      <spotLight position={[0, 6, -2]} angle={0.35} penumbra={0.5} intensity={1} color="#fff8e7" />
      {/* Spotlights directly above each fighter for shadow */}
      <spotLight
        position={[-1.2, 5, 0]}
        angle={0.25}
        penumbra={0.6}
        intensity={1.2}
        color="#ffffff"
        castShadow
      />
      <spotLight
        position={[1.2, 5, 0]}
        angle={0.25}
        penumbra={0.6}
        intensity={1.2}
        color="#ffffff"
        castShadow
      />
    </>
  );
}

type BoxingRing3DProps = {
  fighterASlot?: React.ReactNode;
  fighterBSlot?: React.ReactNode;
  mode?: "fight" | "setup" | "victory";
  koIntensity?: number;
  cameraShakeRef?: React.MutableRefObject<(() => void) | null>;
  refereeState?: RefereeState;
  winnerSide?: "left" | "right" | null;
  knockdownCount?: number;
  modelGenerating?: boolean;
};

function SceneContent({
  fighterASlot,
  fighterBSlot,
  koIntensity = 0,
  cameraShakeRef,
  refereeState = "watching",
  winnerSide = null,
  knockdownCount = 0,
}: {
  fighterASlot?: React.ReactNode;
  fighterBSlot?: React.ReactNode;
  koIntensity?: number;
  cameraShakeRef?: React.MutableRefObject<(() => void) | null>;
  refereeState?: RefereeState;
  winnerSide?: "left" | "right" | null;
  knockdownCount?: number;
}) {
  const sceneRef = useRef<THREE.Group>(null);
  const shakeTime = useRef(0);
  const celebration = refereeState === "stopped" ? 3 : refereeState === "arm_raise" ? 2 : koIntensity;
  const armsUp = refereeState === "stopped" || refereeState === "arm_raise";
  const confettiActive = refereeState === "arm_raise" && winnerSide != null;

  useFrame((_, delta) => {
    if (sceneRef.current && shakeTime.current > 0) {
      sceneRef.current.position.x = (Math.random() - 0.5) * 0.15;
      sceneRef.current.position.y = (Math.random() - 0.5) * 0.15;
      shakeTime.current -= delta;
    } else if (sceneRef.current) {
      sceneRef.current.position.x = 0;
      sceneRef.current.position.y = 0;
    }
  });

  useEffect(() => {
    if (!cameraShakeRef) return;
    cameraShakeRef.current = () => {
      shakeTime.current = 0.25;
    };
    return () => {
      if (cameraShakeRef) cameraShakeRef.current = null;
    };
  }, [cameraShakeRef]);

  return (
    <group ref={sceneRef}>
      <ambientLight intensity={0.25} />
      <SpotLights winnerSide={confettiActive ? winnerSide : null} />
      <RingFloor />
      <Ropes />
      <Apron />
      <CornerPostWithPad position={[-3.8, 0.6, -3.8]} padColor={GOLD} />
      <CornerPostWithPad position={[3.8, 0.6, -3.8]} padColor={RED} />
      <CornerPostWithPad position={[3.8, 0.6, 3.8]} padColor={RED} />
      <CornerPostWithPad position={[-3.8, 0.6, 3.8]} padColor={GOLD} />
      <CrowdParticles
        intensity={1 + koIntensity * 0.5}
        celebration={celebration}
        armsUp={armsUp}
      />
      <ConfettiParticles active={confettiActive} />
      {fighterASlot && <group position={[-1.2, 0, 0]}>{fighterASlot}</group>}
      {fighterBSlot && <group position={[1.2, 0, 0]}>{fighterBSlot}</group>}
      <Referee3D
        state={refereeState}
        winnerSide={winnerSide}
        knockdownCount={knockdownCount}
        position={[0, 0, 0]}
      />
    </group>
  );
}

export const BoxingRing3D = forwardRef<
  { shake: () => void },
  BoxingRing3DProps
>(function BoxingRing3D(
  {
    fighterASlot,
    fighterBSlot,
    mode = "fight",
    koIntensity = 0,
    refereeState = "watching",
    winnerSide = null,
    knockdownCount = 0,
    modelGenerating = false,
  },
  ref
) {
  const cameraShakeRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    shake: () => cameraShakeRef.current?.(),
  }));

  return (
    <div
      className="arena-ring-3d-container"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 320,
        background: "#0a0a0a",
        position: "relative",
      }}
    >
      <Canvas
        shadows
        camera={{ position: [0, 3.5, 8], fov: 42 }}
        gl={{ antialias: true, alpha: false }}
      >
        <SceneContent
          fighterASlot={fighterASlot}
          fighterBSlot={fighterBSlot}
          koIntensity={koIntensity}
          cameraShakeRef={cameraShakeRef}
          refereeState={refereeState}
          winnerSide={winnerSide}
          knockdownCount={knockdownCount}
        />
      </Canvas>
      {modelGenerating && (
        <div className="arena-ring-3d-generating-badge">
          ✨ 3D Model Generating...
        </div>
      )}
    </div>
  );
});
