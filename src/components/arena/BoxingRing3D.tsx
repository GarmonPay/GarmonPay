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
const FLOOR_COLOR = "#3d2510";
const CHROME = "#d0d0d0";

function SceneFog() {
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.FogExp2("#000000", 0.035);
    return () => { scene.fog = null; };
  }, [scene]);
  return null;
}

function RingFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} metalness={0} />
      </mesh>
      <Text
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.28}
        color={GOLD}
        anchorX="center"
        anchorY="middle"
        maxWidth={3}
        fillOpacity={0.35}
      >
        GARMONPAY
      </Text>
    </group>
  );
}

function CornerPost({ position, padColor }: { position: [number, number, number]; padColor: string }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.05, 2.2, 16]} />
        <meshStandardMaterial color={CHROME} metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.17, 0.44, 16]} />
        <meshStandardMaterial color={padColor} roughness={0.85} metalness={0} />
      </mesh>
    </group>
  );
}

function Ropes() {
  const configs = [
    { y: 0.65, color: GOLD },
    { y: 0.95, color: RED },
    { y: 1.25, color: GOLD },
    { y: 1.55, color: RED },
  ];
  const half = 3.8;
  const sag = 0.08;
  return (
    <group>
      {configs.map((r, i) => {
        const curve = new THREE.CatmullRomCurve3(
          [
            new THREE.Vector3(-half, r.y, -half),
            new THREE.Vector3(0, r.y - sag, -half),
            new THREE.Vector3(half, r.y, -half),
            new THREE.Vector3(half, r.y, 0),
            new THREE.Vector3(half, r.y, half),
            new THREE.Vector3(0, r.y - sag, half),
            new THREE.Vector3(-half, r.y, half),
            new THREE.Vector3(-half, r.y, 0),
            new THREE.Vector3(-half, r.y, -half),
          ],
          true
        );
        return (
          <mesh key={i} castShadow>
            <tubeGeometry args={[curve, 80, 0.028, 8, true]} />
            <meshStandardMaterial
              color={r.color}
              metalness={0.15}
              roughness={0.65}
              emissive={r.color}
              emissiveIntensity={0.04}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Apron() {
  return (
    <group>
      <mesh position={[0, -0.12, 4.45]} receiveShadow>
        <boxGeometry args={[9.2, 0.22, 1.3]} />
        <meshStandardMaterial color={NAVY} roughness={0.95} metalness={0} />
      </mesh>
      <Text position={[0, -0.0, 4.46]} fontSize={0.2} color={GOLD} anchorX="center" anchorY="middle" maxWidth={5} fillOpacity={0.9}>
        GARMONPAY ARENA
      </Text>
      <mesh position={[0, -0.12, -4.45]} receiveShadow>
        <boxGeometry args={[9.2, 0.22, 1.3]} />
        <meshStandardMaterial color={NAVY} roughness={0.95} metalness={0} />
      </mesh>
      <mesh position={[4.45, -0.12, 0]} receiveShadow>
        <boxGeometry args={[1.3, 0.22, 9.2]} />
        <meshStandardMaterial color={NAVY} roughness={0.95} metalness={0} />
      </mesh>
      <mesh position={[-4.45, -0.12, 0]} receiveShadow>
        <boxGeometry args={[1.3, 0.22, 9.2]} />
        <meshStandardMaterial color={NAVY} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}

const CROWD_COUNT = 200;
function CrowdParticles({ celebration = 0 }: { celebration?: number }) {
  const ref = useRef<THREE.Points>(null);
  const posArr = useRef(new Float32Array(CROWD_COUNT * 3));

  useEffect(() => {
    const p = posArr.current;
    for (let i = 0; i < CROWD_COUNT; i++) {
      const angle = (i / CROWD_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const radius = 9 + Math.random() * 5;
      p[i * 3] = Math.cos(angle) * radius;
      p[i * 3 + 1] = 1 + Math.random() * 2.5;
      p[i * 3 + 2] = Math.sin(angle) * radius;
    }
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const pos = ref.current.geometry.attributes.position;
    for (let i = 0; i < CROWD_COUNT; i++) {
      const base = posArr.current[i * 3 + 1];
      pos.setY(i, base + Math.sin(t * 0.8 + i * 0.4) * (0.05 + celebration * 0.25));
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[posArr.current, 3]} count={CROWD_COUNT} />
      </bufferGeometry>
      <pointsMaterial size={celebration > 0 ? 0.2 : 0.13} color="#111111" transparent opacity={0.85} sizeAttenuation />
    </points>
  );
}

const CONFETTI_COUNT = 50;
function ConfettiParticles({ active = false }: { active?: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const posArr = useRef(new Float32Array(CONFETTI_COUNT * 3));
  const velArr = useRef(new Float32Array(CONFETTI_COUNT * 3));

  useEffect(() => {
    const p = posArr.current;
    const v = velArr.current;
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
    const v = velArr.current;
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
        <bufferAttribute attach="attributes-position" args={[posArr.current, 3]} count={CONFETTI_COUNT} />
      </bufferGeometry>
      <pointsMaterial size={0.12} color={GOLD} transparent opacity={0.9} sizeAttenuation />
    </points>
  );
}

function SpotLights({ winnerSide = null }: { winnerSide?: "left" | "right" | null }) {
  const refL = useRef<THREE.SpotLight>(null);
  const refR = useRef<THREE.SpotLight>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f = 0.97 + Math.sin(t * 2) * 0.03;
    if (refL.current) refL.current.intensity = (winnerSide === "left" ? 2.5 : 0.6) * f;
    if (refR.current) refR.current.intensity = (winnerSide === "right" ? 2.5 : 0.6) * (1.03 - f * 0.03);
  });
  return (
    <>
      <spotLight ref={refL} position={[-2, 7, 1]} angle={0.4} penumbra={0.6} intensity={0.6} color={GOLD} castShadow />
      <spotLight ref={refR} position={[2, 7, 1]} angle={0.4} penumbra={0.6} intensity={0.6} color={RED} castShadow />
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
    cameraShakeRef.current = () => { shakeTime.current = 0.25; };
    return () => { if (cameraShakeRef) cameraShakeRef.current = null; };
  }, [cameraShakeRef]);

  return (
    <group ref={sceneRef}>
      <SceneFog />
      <ambientLight intensity={0.08} />
      <spotLight position={[0, 12, 0]} angle={0.3} penumbra={0.7} intensity={4} color="#ffffff" castShadow shadow-mapSize={[2048, 2048]} />
      <SpotLights winnerSide={confettiActive ? winnerSide : null} />
      <RingFloor />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.65} scale={12} blur={2.5} color="#000000" />
      <Ropes />
      <Apron />
      <CornerPost position={[-3.8, 0.6, -3.8]} padColor={GOLD} />
      <CornerPost position={[-3.8, 0.6, 3.8]} padColor={GOLD} />
      <CornerPost position={[3.8, 0.6, -3.8]} padColor={RED} />
      <CornerPost position={[3.8, 0.6, 3.8]} padColor={RED} />
      <CrowdParticles celebration={celebration} />
      <ConfettiParticles active={confettiActive} />
      {fighterASlot && <group position={[-1.2, 0, 0]}>{fighterASlot}</group>}
      {fighterBSlot && <group position={[1.2, 0, 0]}>{fighterBSlot}</group>}
      <Referee3D state={refereeState} winnerSide={winnerSide} knockdownCount={knockdownCount} position={[0, 0, 0]} />
    </group>
  );
}

export const BoxingRing3D = forwardRef<{ shake: () => void }, BoxingRing3DProps>(
  function BoxingRing3D(
    { fighterASlot, fighterBSlot, mode = "fight", koIntensity = 0, refereeState = "watching", winnerSide = null, knockdownCount = 0, modelGenerating = false },
    ref
  ) {
    const cameraShakeRef = useRef<(() => void) | null>(null);
    useImperativeHandle(ref, () => ({ shake: () => cameraShakeRef.current?.() }));

    return (
      <div
        className="arena-ring-3d-container"
        style={{ width: "100%", height: "100%", minHeight: 320, background: "#000000", position: "relative" }}
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
