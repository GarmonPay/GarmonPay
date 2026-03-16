"use client";

import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";

const GOLD = "#f0a500";
const RED = "#c1272d";
const NAVY = "#0f172a";
const DARK_GREY = "#1a1a1a";

function RingFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[8, 8]} />
      <meshStandardMaterial color={DARK_GREY} roughness={0.9} metalness={0.1} />
    </mesh>
  );
}

function CornerPost({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.08, 0.1, 1.2, 16]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
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
function CrowdParticles({ intensity = 1 }: { intensity?: number }) {
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

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * (0.3 + intensity * 0.4);
    const pos = ref.current.geometry.attributes.position;
    for (let i = 0; i < CROWD_COUNT; i++) {
      const ix = i * 3;
      const baseX = pos.getX(i);
      pos.setX(i, baseX + Math.sin(t + i * 0.2) * 0.02);
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
      <pointsMaterial size={0.15} color="#0a0a0a" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

function SpotLights() {
  const ref1 = useRef<THREE.SpotLight>(null);
  const ref2 = useRef<THREE.SpotLight>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f = 0.98 + Math.sin(t * 2) * 0.02;
    if (ref1.current) ref1.current.intensity = 2 * f;
    if (ref2.current) ref2.current.intensity = 2 * (1.02 - f * 0.02);
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
    </>
  );
}

type BoxingRing3DProps = {
  fighterASlot?: React.ReactNode;
  fighterBSlot?: React.ReactNode;
  mode?: "fight" | "setup" | "victory";
  koIntensity?: number;
  cameraShakeRef?: React.MutableRefObject<(() => void) | null>;
};

function SceneContent({
  fighterASlot,
  fighterBSlot,
  koIntensity = 0,
  cameraShakeRef,
}: {
  fighterASlot?: React.ReactNode;
  fighterBSlot?: React.ReactNode;
  koIntensity?: number;
  cameraShakeRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const sceneRef = useRef<THREE.Group>(null);
  const shakeTime = useRef(0);

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
      <SpotLights />
      <RingFloor />
      <Ropes />
      <Apron />
      <CornerPost position={[-3.8, 0.6, -3.8]} />
      <CornerPost position={[3.8, 0.6, -3.8]} />
      <CornerPost position={[3.8, 0.6, 3.8]} />
      <CornerPost position={[-3.8, 0.6, 3.8]} />
      <CrowdParticles intensity={1 + koIntensity * 0.5} />
      {fighterASlot && <group position={[-1.2, 0, 0]}>{fighterASlot}</group>}
      {fighterBSlot && <group position={[1.2, 0, 0]}>{fighterBSlot}</group>}
    </group>
  );
}

export const BoxingRing3D = forwardRef<
  { shake: () => void },
  BoxingRing3DProps
>(function BoxingRing3D(
  { fighterASlot, fighterBSlot, mode = "fight", koIntensity = 0 },
  ref
) {
  const cameraShakeRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    shake: () => cameraShakeRef.current?.(),
  }));

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 320, background: "#0a0a0a" }}>
      <Canvas
        shadows
        camera={{ position: [0, 2.5, 6], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
      >
        <SceneContent
          fighterASlot={fighterASlot}
          fighterBSlot={fighterBSlot}
          koIntensity={koIntensity}
          cameraShakeRef={cameraShakeRef}
        />
      </Canvas>
    </div>
  );
});
