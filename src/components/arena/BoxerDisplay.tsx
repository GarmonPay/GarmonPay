'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

const BoxerCanvas = dynamic(
  () => import('./BoxerCanvas'),
  { 
    ssr: false,
    loading: () => (
      <div style={{
        width: '100%',
        height: 380,
        background: '#000',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ fontSize: 48 }}>🥊</div>
        <div style={{ 
          color: '#f0a500', 
          fontSize: 12,
          letterSpacing: 2,
          fontFamily: 'monospace'
        }}>
          LOADING FIGHTER...
        </div>
      </div>
    )
  }
)

interface BoxerDisplayProps {
  fighter?: any
  facingRight?: boolean
  size?: 'small' | 'medium' | 'large'
}

export default function BoxerDisplay({
  fighter,
  facingRight = false,
  size = 'medium'
}: BoxerDisplayProps) {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  const heights = { small: 220, medium: 380, large: 560 }
  const color = fighter?.fighter_color || '#f0a500'

  if (!mounted) {
    return (
      <div style={{
        width: '100%',
        height: heights[size],
        background: '#000',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ fontSize: 48 }}>🥊</div>
      </div>
    )
  }

  return (
    <BoxerCanvas
      modelUrl={
        fighter?.model_3d_url || 
        '/models/default-boxer.glb'
      }
      facingRight={facingRight}
      fighterColor={color}
      size={size}
    />
  )
}
