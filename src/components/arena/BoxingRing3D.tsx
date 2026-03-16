"use client";

import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Text, ContactShadows } from "@react-three/drei";
import { Referee3D, type RefereeState } from "./Referee3D";
import "./boxing-ring.css";

const GOLD = "#f0a500";
const RED = "#c1272d";
const NAVY = "#0a0f1e";

// ─── Scene fog ───────────────────────────────────────────────────────────────
function SceneFog() {
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.FogExp2("#000000", 0.035);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  return null;
}

// ─── Floor ───────────────────────────────────────────────────────────────────
function RingFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[8, 8]} />
      <meshStandardMaterial color="#3d2510" roughness={0.95} metalness={0} />
    </mesh>
  );
}

// ─── Corner posts ─────────────────────────────────────────────────────────────
function CornerPost({
  position,
  padColor,
}: {
  position: [number, number, number];
  padColor: string;
}) {
  return (
    <group position={position}>
      {/* Main post - silver chrome */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.06, 0.07, 2.2, 16]} />
        <meshStandardMaterial color="#c8c8c8" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Padding cylinder */}
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.12, 0.13, 0.7, 16]} />
        <meshStandardMaterial color={padColor} roughness={0.85} metalness={0.05} />
      </mesh>
    </group>
  );
}

// ─── Single rope ─────────────────────────────────────────────────────────────
function Rope({ height, color }: { height: number; color: string }) {
  const half = 3.8;
  const sag = 0.08;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-half, height, -half),
    new THREE.Vector3(0, height - sag, -half),
    new THREE.Vector3(half, height, -half),
    new THREE.Vector3(half, height - sag, 0),
    new THREE.Vector3(half, height, half),
    new THREE.Vector3(0, height - sag, half),
    new THREE.Vector3(-half, height, half),
    new THREE.Vector3(-half, height - sag, 0),
    new THREE.Vector3(-half, height, -half),
  ], true);
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 80, 0.028, 8, true]} />
      <meshStandardMaterial color={color} metalness={0.2} roughness={0.75} />
    </mesh>
  );
}

function Ropes() {
  const ropes = [
    { height: 0.65, color: GOLD },
    { height: 0.95, color: RED },
    { height: 1.25, color: GOLD },
    { height: 1.55, color: RED },
  ];
  return (
    <group>
      {ropes.map((r, i) => (
        <Rope key={i} height={r.height} color={r.color} />
      ))}
    </group>
  );
}

// ─── Apron ───────────────────────────────────────────────────────────────────
function Apron() {
  return (
    <group>
      {/* Front apron */}
      <mesh position={[0, -0.18, 4.55]} receiveShadow>
        <boxGeometry args={[9.5, 0.38, 1.4]} />
        <meshStandardMaterial color={NAVY} roughness={0.9} metalness={0} />
      </mesh>
      <Text
        position={[0, -0.18, 4.56]}
        fontSize={0.22}
        color={GOLD}
        anchorX="center"
        anchorY="middle"
        maxWidth={5}
      >
        GARMONPAY ARENA
      </Text>
      {/* Back apron */}
      <mesh position={[0, -0.18, -4.55]} receiveShadow>
        <boxGeometry args={[9.5, 0.38, 1.4]} />
        <meshStandardMaterial color={NAVY} roughness={0.9} metalness={0} />
      </mesh>
      {/* Left apron */}
      <mesh position={[-4.55, -0.18, 0]} receiveShadow>
        <boxGeometry args={[1.4, 0.38, 9.5]} />
        <meshStandardMaterial color={NAVY} roughness={0.9} metalness={0} />
      </mesh>
      {/* Right apron */}
      <mesh position={[4.55, -0.18, 0]} receiveShadow>
        <boxGeometry args={[1.4, 0.38, 9.5]} />
        <meshStandardMaterial color={NAVY} roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}

// ─── Crowd particles ──────────────────────────────────────────────────────────
const CROWD_COUNT = 200;

function CrowdParticles({
  intensity = 1,
  celebration = 0,
}: {
  intensity?: number;
  celebration?: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const positions = useRef(new Float32Array(CROWD_COUNT * 3));

  useEffect(() => {
    const p = positions.current;
    for (let i = 0; i < CROWD_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 9 + Math.random() * 5;
      p[i * 3] = Math.cos(angle) * r;
      p[i * 3 + 1] = 0.5 + Math.random() * 3.5;
      p[i * 3 + 2] = Math.sin(angle) * r;
    }
    if (ref.current) {
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * (0.3 + intensity * 0.15);
    const pos = ref.current.geometry.attributes.position;
    const sway = 0.002;
    for (let i = 0; i < CROWD_COUNT; i++) {
      const baseX = pos.getX(i);
      pos.setX(i, baseX + Math.sin(t + i * 0.3) * sway);
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
        size={celebration > 0 ? 0.22 : 0.14}
        color="#111111"
        transparent
        opacity={0.7}
        sizeAttenuation
      />
    </points>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COUNT = 60;

function ConfettiParticles({ active = false }: { active?: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useRef(new Float32Array(CONFETTI_COUNT * 3));
  const velocities = useRef(new Float32Array(CONFETTI_COUNT * 3));

  useEffect(() => {
    const p = positions.current;
    const v = velocities.current;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      p[i * 3] = (Math.random() - 0.5) * 8;
      p[i * 3 + 1] = 4 + Math.random() * 4;
      p[i * 3 + 2] = (Math.random() - 0.5) * 6;
      v[i * 3] = (Math.random() - 0.5) * 0.02;
      v[i * 3 + 1] = -0.025 - Math.random() * 0.025;
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
        p.setY(i, 5 + Math.random() * 3);
        p.setX(i, (Math.random() - 0.5) * 8);
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
      <pointsMaterial size={0.12} color={GOLD} transparent opacity={0.9} sizeAttenuation />
    </points>
  );
}

// ─── Winner spotlights ────────────────────────────────────────────────────────
function SpotLights({ winnerSide = null }: { winnerSide?: "left" | "right" | null }) {
  const ref1 = useRef<THREE.SpotLight>(null);
  const ref2 = useRef<THREE.SpotLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f = 0.98 + Math.sin(t * 2) * 0.02;
    if (ref1.current) ref1.current.intensity = (winnerSide === "left" ? 3.5 : 2) * f;
    if (ref2.current) ref2.current.intensity = (winnerSide === "right" ? 3.5 : 2) * (1.02 - f * 0.02);
  });

  return (
    <>
      <spotLight
        ref={ref1}
        position={[-2, 8, 0]}
        angle={0.4}
        penumbra={0.5}
        intensity={2}
        color={GOLD}
        castShadow
      />
      <spotLight
        ref={ref2}
        position={[2, 8, 0]}
        angle={0.4}
        penumbra={0.5}
        intensity={2}
        color={RED}
        castShadow
      />
    </>
  );
}

// ─── BoxingRing3D props ───────────────────────────────────────────────────────
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

// ─── Scene content (inside Canvas) ────────────────────────────────────────────
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
      <SceneFog />

      {/* Lighting */}
      <ambientLight intensity={0.08} />
      {/* Main overhead dramatic spotlight */}
      <spotLight
        position={[0, 12, 0]}
        angle={0.3}
        penumbra={0.7}
        intensity={4}
        castShadow
        color="#ffffff"
      />
      {/* Side fills */}
      <spotLight position={[-5, 8, 0]} angle={0.5} penumbra={0.8} intensity={0.6} color="#fff8e0" />
      <spotLight position={[5, 8, 0]} angle={0.5} penumbra={0.8} intensity={0.6} color="#fff8e0" />

      <SpotLights winnerSide={confettiActive ? winnerSide : null} />

      <RingFloor />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.6}
        scale={10}
        blur={2}
        color="#000000"
      />

      <Ropes />
      <Apron />

      {/* Corner posts: GOLD on LEFT, RED on RIGHT */}
      <CornerPost position={[-3.8, 0, -3.8]} padColor={GOLD} />
      <CornerPost position={[-3.8, 0, 3.8]} padColor={GOLD} />
      <CornerPost position={[3.8, 0, -3.8]} padColor={RED} />
      <CornerPost position={[3.8, 0, 3.8]} padColor={RED} />

      <CrowdParticles intensity={1 + koIntensity * 0.5} celebration={celebration} />
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

// ─── Exported component ───────────────────────────────────────────────────────
export const BoxingRing3D = forwardRef<{ shake: () => void }, BoxingRing3DProps>(
  function BoxingRing3D(
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
          background: "#000000",
          position: "relative",
        }}
      >
        <Canvas
          shadows
          camera={{ position: [0, 6, 12], fov: 40 }}
          gl={{ antialias: true, alpha: false }}
          style={{ background: "#000000" }}
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
          <div className="arena-ring-3d-generating-badge">✨ 3D Model Generating...</div>
        )}
      </div>
    );
  }
);
