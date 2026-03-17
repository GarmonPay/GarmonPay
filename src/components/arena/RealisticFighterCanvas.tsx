'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import RealisticFighter from './RealisticFighter'
import type { FighterData } from '@/lib/arena-fighter-types'

interface RealisticFighterCanvasProps {
  fighter: FighterData
  pose?: 'orthodox_guard' | 'victory' | 'defeat'
  animation?: string
  mirrored?: boolean
  style?: React.CSSProperties
  className?: string
}

export function RealisticFighterCanvas({
  fighter,
  pose = 'orthodox_guard',
  animation = 'idle',
  mirrored = false,
  style,
  className,
}: RealisticFighterCanvasProps) {
  return (
    <div
      style={{ width: '100%', height: '100%', minHeight: '200px', ...style }}
      className={className}
    >
      <Canvas
        camera={{ fov: 45, position: [0, 0.3, 3.5] }}
        shadows
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.15} />
        <spotLight
          position={[0, 6, 2]}
          intensity={3}
          angle={0.35}
          penumbra={0.4}
          color="#fff5e0"
          castShadow
        />
        <pointLight position={[-2, 2, 2]} intensity={0.3} color="#3050ff" />
        <Suspense fallback={null}>
          <RealisticFighter
            fighter={fighter}
            pose={pose}
            animation={animation}
            position={[0, -1, 0]}
            scale={1}
            facingRight={mirrored}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
