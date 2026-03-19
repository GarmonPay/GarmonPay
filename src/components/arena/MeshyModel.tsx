'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, ContactShadows, Environment, PresentationControls } from '@react-three/drei'

const DEFAULT_GLB = '/models/default-boxer.glb'

function GLBScene({
  modelUrl,
  facingRight = false,
  color = '#f0a500'
}: {
  modelUrl: string
  facingRight?: boolean
  color?: string
}) {
  const url = modelUrl && modelUrl.trim() ? modelUrl : DEFAULT_GLB
  const gltf = useGLTF(url)
  const scene = gltf?.scene
  if (!scene || typeof scene.clone !== 'function') return null
  try {
    const clone = scene.clone()
    return (
      <primitive
        object={clone}
        scale={1.8}
        position={[0, -1.2, 0]}
        rotation={[0, facingRight ? Math.PI : 0, 0]}
      />
    )
  } catch {
    return null
  }
}

export default function MeshyModel({
  modelUrl = DEFAULT_GLB,
  facingRight = false,
  fighterColor = '#f0a500',
  stats = { speed: 50, strength: 50, stamina: 50, defense: 50, chin: 50, special: 20 },
  height = 380
}: {
  modelUrl?: string
  facingRight?: boolean
  fighterColor?: string
  stats?: { speed: number; strength: number; stamina: number; defense: number; chin: number; special: number }
  height?: number
}) {
  if (typeof window === 'undefined') return <div style={{ width: '100%', height, background: '#000', borderRadius: 8 }} />

  return (
    <div
      style={{
        width: '100%',
        height,
        background: 'radial-gradient(ellipse at 50% 0%, #1a0808, #000000)',
        borderRadius: 8,
        overflow: 'hidden'
      }}
    >
      <Canvas shadows camera={{ position: [0, 0.5, 4], fov: 42 }}>
        <ambientLight intensity={0.04} />
        <spotLight position={[0, 8, 3]} angle={0.4} penumbra={0.5} intensity={4} color="#fff5e0" castShadow />
        <spotLight position={[-3, 4, 2]} angle={0.6} penumbra={0.8} intensity={0.8} color="#b0c8ff" />
        <pointLight position={[0, 2, -3]} intensity={0.6} color={fighterColor} distance={5} />
        <Suspense fallback={null}>
          <PresentationControls global polar={[-0.1, 0.1]} azimuth={[-0.4, 0.4]} snap>
            <GLBScene modelUrl={modelUrl} facingRight={facingRight} color={fighterColor} />
          </PresentationControls>
          <ContactShadows position={[0, -1.4, 0]} opacity={0.9} scale={6} blur={2} color="#000" />
          <Environment preset="night" />
        </Suspense>
      </Canvas>
    </div>
  )
}

