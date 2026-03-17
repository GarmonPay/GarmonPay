'use client'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  FIGHTER_POSES,
  ANIMATIONS,
  getFighterConfig
} from '@/lib/arena/characterAssets'

interface RealisticFighterProps {
  fighter: any
  pose?: 'orthodox_guard' | 'victory' | 'defeat'
  animation?: string
  position?: [number, number, number]
  scale?: number
  facingRight?: boolean
}

export default function RealisticFighter({
  fighter,
  pose = 'orthodox_guard',
  animation = 'idle',
  position = [0, 0, 0],
  scale = 1,
  facingRight = false
}: RealisticFighterProps) {
  const groupRef = useRef<THREE.Group>(null)
  const timeRef = useRef(0)

  const config = useMemo(() =>
    getFighterConfig(fighter), [fighter])

  const poseData = FIGHTER_POSES[pose]
  const animData = ANIMATIONS.idle

  useFrame((state, delta) => {
    timeRef.current += delta
    if (!groupRef.current) return

    const t = timeRef.current

    // Breathing animation
    const breathe = Math.sin(t * animData.breathing.speed * Math.PI * 2)
    groupRef.current.scale.y = scale * (1 + breathe * animData.breathing.amplitude)

    // Weight shift
    const shift = Math.sin(t * animData.weightShift.speed * Math.PI * 2)
    groupRef.current.position.x = position[0] + shift * animData.weightShift.amplitude
  })

  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.skinColor),
    roughness: 0.8,
    metalness: 0.0
  }), [config.skinColor])

  const shortsMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.shorts.color),
    roughness: 0.9
  }), [config.shorts.color])

  const gloveMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.gloves.color),
    roughness: config.gloves.roughness,
    metalness: config.gloves.metalness,
    emissive: new THREE.Color(config.gloves.emissive)
  }), [config.gloves])

  const bootMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.shoes.color),
    roughness: 0.7
  }), [config.shoes.color])

  const bd = config.bodyType

  return (
    <group
      ref={groupRef}
      position={position}
      scale={scale}
      rotation={[0, facingRight ? Math.PI : poseData.bodyRotationY, 0]}
    >
      {/* HEAD */}
      <mesh position={[0, 1.72, 0]} castShadow material={skinMat}>
        <sphereGeometry args={[0.18, 16, 16]} />
      </mesh>

      {/* NECK */}
      <mesh position={[0, 1.52, 0]} castShadow material={skinMat}>
        <cylinderGeometry args={[0.075, 0.09, 0.18, 10]} />
      </mesh>

      {/* TORSO - CHEST */}
      <mesh position={[0, 1.15, 0]} castShadow material={skinMat}>
        <boxGeometry args={[bd.torsoScale[0], bd.torsoScale[1] * 0.6, bd.torsoScale[2]]} />
      </mesh>

      {/* TORSO - WAIST */}
      <mesh position={[0, 0.82, 0]} castShadow material={skinMat}>
        <boxGeometry args={[bd.torsoScale[0] * 0.85, bd.torsoScale[1] * 0.4, bd.torsoScale[2] * 0.9]} />
      </mesh>

      {/* SHORTS */}
      <mesh position={[0, 0.58, 0]} castShadow material={shortsMat}>
        <cylinderGeometry args={[bd.torsoScale[0] * 0.52, bd.torsoScale[0] * 0.48, 0.42, 12]} />
      </mesh>

      {/* LEFT UPPER ARM */}
      <mesh
        position={[
          -(bd.shoulderWidth * 0.5 + 0.12),
          1.28,
          -0.1
        ]}
        rotation={[0.5, 0, -0.2]}
        castShadow
        material={skinMat}
      >
        <cylinderGeometry args={[bd.armThickness, bd.armThickness * 0.9, 0.38, 10]} />
      </mesh>

      {/* LEFT FOREARM */}
      <mesh
        position={[
          -(bd.shoulderWidth * 0.5 + 0.18),
          1.12,
          -0.38
        ]}
        rotation={[0.9, 0, -0.15]}
        castShadow
        material={skinMat}
      >
        <cylinderGeometry args={[bd.armThickness * 0.85, bd.armThickness * 0.75, 0.34, 10]} />
      </mesh>

      {/* LEFT GLOVE - jab position */}
      <mesh
        position={[
          -(bd.shoulderWidth * 0.4 + 0.12),
          1.44,
          -0.65
        ]}
        castShadow
        material={gloveMat}
      >
        <sphereGeometry args={[0.13, 12, 12]} />
      </mesh>

      {/* RIGHT UPPER ARM - tucked */}
      <mesh
        position={[
          bd.shoulderWidth * 0.5 + 0.10,
          1.25,
          0.0
        ]}
        rotation={[0.25, 0, 0.15]}
        castShadow
        material={skinMat}
      >
        <cylinderGeometry args={[bd.armThickness, bd.armThickness * 0.9, 0.36, 10]} />
      </mesh>

      {/* RIGHT FOREARM - angled up to chin */}
      <mesh
        position={[
          bd.shoulderWidth * 0.45 + 0.1,
          1.28,
          -0.12
        ]}
        rotation={[-0.4, 0, 0.1]}
        castShadow
        material={skinMat}
      >
        <cylinderGeometry args={[bd.armThickness * 0.85, bd.armThickness * 0.75, 0.32, 10]} />
      </mesh>

      {/* RIGHT GLOVE - guard position near chin */}
      <mesh
        position={[
          bd.shoulderWidth * 0.38 + 0.08,
          1.42,
          -0.08
        ]}
        castShadow
        material={gloveMat}
      >
        <sphereGeometry args={[0.13, 12, 12]} />
      </mesh>

      {/* LEFT UPPER LEG */}
      <mesh position={[-0.14, 0.28, -0.06]}
            rotation={[0.08, 0, 0]}
            castShadow
            material={skinMat}>
        <cylinderGeometry args={[bd.legThickness * 1.1, bd.legThickness, 0.46, 10]} />
      </mesh>

      {/* RIGHT UPPER LEG */}
      <mesh position={[0.14, 0.28, 0.06]}
            rotation={[-0.05, 0, 0]}
            castShadow
            material={skinMat}>
        <cylinderGeometry args={[bd.legThickness * 1.1, bd.legThickness, 0.46, 10]} />
      </mesh>

      {/* LEFT LOWER LEG */}
      <mesh position={[-0.15, -0.06, -0.06]}
            rotation={[0.05, 0, 0]}
            castShadow
            material={skinMat}>
        <cylinderGeometry args={[bd.legThickness, bd.legThickness * 0.85, 0.44, 10]} />
      </mesh>

      {/* RIGHT LOWER LEG */}
      <mesh position={[0.15, -0.06, 0.06]} castShadow material={skinMat}>
        <cylinderGeometry args={[bd.legThickness, bd.legThickness * 0.85, 0.44, 10]} />
      </mesh>

      {/* LEFT BOOT */}
      <mesh position={[-0.15, -0.34, -0.04]} castShadow material={bootMat}>
        <boxGeometry args={[0.14, 0.28, 0.22]} />
      </mesh>
      <mesh position={[-0.15, -0.46, -0.02]}>
        <boxGeometry args={[0.16, 0.06, 0.26]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* RIGHT BOOT */}
      <mesh position={[0.15, -0.34, 0.06]} castShadow material={bootMat}>
        <boxGeometry args={[0.14, 0.28, 0.22]} />
      </mesh>
      <mesh position={[0.15, -0.46, 0.08]}>
        <boxGeometry args={[0.16, 0.06, 0.26]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* Fighter accent light */}
      <pointLight
        position={[0, 2, 1]}
        intensity={0.4}
        color={config.color}
        distance={3}
      />
    </group>
  )
}
