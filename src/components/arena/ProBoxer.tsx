'use client'
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { 
  useGLTF, 
  ContactShadows,
  Environment,
  PresentationControls
} from '@react-three/drei'

function Model({ facingRight = false }: { facingRight?: boolean }) {
  const { scene } = useGLTF('/models/default-boxer.glb')
  return (
    <primitive 
      object={scene.clone()} 
      scale={1.8}
      position={[0, -1.2, 0]}
      rotation={[0, facingRight ? Math.PI : 0, 0]}
    />
  )
}

export default function ProBoxer({
  facingRight = false,
  fighterColor = '#f0a500',
  size = 'medium'
}: {
  facingRight?: boolean
  fighterColor?: string  
  size?: 'small' | 'medium' | 'large'
}) {
  const h = { small: 220, medium: 400, large: 560 }
  
  return (
    <div style={{
      width: '100%',
      height: h[size],
      background: '#000000',
      borderRadius: 8,
      overflow: 'hidden'
    }}>
      <Canvas
        shadows
        camera={{ position: [0, 0.5, 4], fov: 42 }}
      >
        <ambientLight intensity={0.04} />
        <spotLight
          position={[0, 8, 3]}
          angle={0.4}
          penumbra={0.5}
          intensity={4}
          color="#fff5e0"
          castShadow
        />
        <spotLight
          position={[-3, 4, 2]}
          angle={0.6}
          penumbra={0.8}
          intensity={0.8}
          color="#b0c8ff"
        />
        <pointLight
          position={[0, 2, -3]}
          intensity={0.6}
          color={fighterColor}
          distance={5}
        />
        <Suspense fallback={null}>
          <PresentationControls
            global
            polar={[-0.1, 0.1]}
            azimuth={[-0.4, 0.4]}
            snap
          >
            <Model facingRight={facingRight} />
          </PresentationControls>
          <ContactShadows
            position={[0, -1.4, 0]}
            opacity={0.9}
            scale={6}
            blur={2}
            color="#000000"
          />
          <Environment preset="night" />
        </Suspense>
      </Canvas>
    </div>
  )
}

useGLTF.preload('/models/default-boxer.glb')
