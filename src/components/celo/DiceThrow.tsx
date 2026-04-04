'use client'

import { useEffect, useRef, useState } from 'react'

interface DiceThrowProps {
  rolling: boolean
  dice: [number, number, number] | null
  diceType?: 'standard' | 'gold' | 'street' | 'midnight'
  onAnimationComplete?: () => void
}

const DOT_POSITIONS: Record<number, { cx: number; cy: number }[]> = {
  1: [{ cx: 50, cy: 50 }],
  2: [{ cx: 25, cy: 25 }, { cx: 75, cy: 75 }],
  3: [{ cx: 25, cy: 25 }, { cx: 50, cy: 50 }, { cx: 75, cy: 75 }],
  4: [{ cx: 25, cy: 25 }, { cx: 75, cy: 25 }, { cx: 25, cy: 75 }, { cx: 75, cy: 75 }],
  5: [{ cx: 25, cy: 25 }, { cx: 75, cy: 25 }, { cx: 50, cy: 50 }, { cx: 25, cy: 75 }, { cx: 75, cy: 75 }],
  6: [{ cx: 25, cy: 20 }, { cx: 75, cy: 20 }, { cx: 25, cy: 50 }, { cx: 75, cy: 50 }, { cx: 25, cy: 80 }, { cx: 75, cy: 80 }],
}

const DICE_COLORS = {
  standard: { bg: '#DC2626', dot: '#ffffff', border: '#991B1B' },
  gold:     { bg: '#F59E0B', dot: '#1a0a00', border: '#92400E' },
  street:   { bg: '#16A34A', dot: '#ffffff', border: '#14532D' },
  midnight: { bg: '#1E1B4B', dot: '#ffffff', border: '#0F0A2E' },
}

function DieFace({
  value,
  color,
}: {
  value: number
  color: { bg: string; dot: string; border: string }
}) {
  const dots = DOT_POSITIONS[value] ?? DOT_POSITIONS[1]
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect x="4" y="4" width="92" height="92" rx="18" ry="18"
        fill={color.bg} stroke={color.border} strokeWidth="3" />
      <rect x="8" y="8" width="84" height="40" rx="14" ry="14"
        fill="rgba(255,255,255,0.12)" />
      {dots.map((pos, i) => (
        <circle
          key={i}
          cx={pos.cx}
          cy={pos.cy}
          r="9"
          fill={color.dot}
          style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }}
        />
      ))}
    </svg>
  )
}

type DicePos = { x: number; y: number; rotate: number; scale: number; opacity: number }
type Phase = 'idle' | 'holding' | 'shaking' | 'throwing' | 'landing' | 'settled'

const SETTLED_POSITIONS: DicePos[] = [
  { x: -60, y: 20, rotate: -15, scale: 1, opacity: 1 },
  { x: 0,   y: 10, rotate: 5,   scale: 1, opacity: 1 },
  { x: 60,  y: 25, rotate: 20,  scale: 1, opacity: 1 },
]

export default function DiceThrow({
  rolling,
  dice,
  diceType = 'standard',
  onAnimationComplete,
}: DiceThrowProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [dicePositions, setDicePositions] = useState<DicePos[]>([
    { x: 0, y: 0, rotate: 0, scale: 1, opacity: 0 },
    { x: 0, y: 0, rotate: 0, scale: 1, opacity: 0 },
    { x: 0, y: 0, rotate: 0, scale: 1, opacity: 0 },
  ])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const color = DICE_COLORS[diceType]

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const after = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timers.current.push(t)
  }

  useEffect(() => {
    if (!rolling) {
      clearTimers()
      if (dice) {
        setPhase('settled')
        setDicePositions(SETTLED_POSITIONS)
      } else {
        setPhase('idle')
        setDicePositions((prev) => prev.map((d) => ({ ...d, opacity: 0 })))
      }
      return
    }

    clearTimers()

    // PHASE 1 — dice appear clustered in hand
    setPhase('holding')
    setDicePositions([
      { x: -20, y: 60, rotate: -10, scale: 0.7, opacity: 1 },
      { x: 0,   y: 55, rotate: 5,   scale: 0.7, opacity: 1 },
      { x: 20,  y: 62, rotate: 15,  scale: 0.7, opacity: 1 },
    ])

    // PHASE 2 — hand shakes
    after(() => { setPhase('shaking') }, 200)

    // PHASE 3 — dice launch forward
    after(() => {
      setPhase('throwing')
      setDicePositions([
        { x: -80, y: -60, rotate: -180, scale: 1.1, opacity: 1 },
        { x: 10,  y: -80, rotate: 270,  scale: 1.1, opacity: 1 },
        { x: 90,  y: -50, rotate: 200,  scale: 1.1, opacity: 1 },
      ])
    }, 1000)

    // PHASE 4 — dice spin down to table
    after(() => {
      setPhase('landing')
      setDicePositions([
        { x: -60, y: 20, rotate: -720, scale: 1, opacity: 1 },
        { x: 0,   y: 10, rotate: 540,  scale: 1, opacity: 1 },
        { x: 60,  y: 25, rotate: 660,  scale: 1, opacity: 1 },
      ])
    }, 1400)

    // PHASE 5 — settle to final faces
    after(() => {
      setPhase('settled')
      setDicePositions(SETTLED_POSITIONS)
      onAnimationComplete?.()
    }, 2500)

    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, dice])

  useEffect(() => () => clearTimers(), [])

  // Show real faces only when settled with actual dice values
  const displayDice: [number, number, number] =
    phase === 'settled' && dice ? dice : [1, 1, 1]

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* ── FELT TABLE ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 300,
          height: 180,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, #1a4a2e 0%, #0d2b1a 60%, #061508 100%)',
          border: '4px solid #2d7a4a',
          boxShadow: '0 0 40px rgba(0,0,0,0.9), inset 0 0 40px rgba(0,0,0,0.5)',
        }}
      />

      {/* ── HAND ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 200,
          height: 240,
          animation:
            phase === 'shaking'
              ? 'handShake 0.15s ease-in-out infinite alternate'
              : phase === 'throwing'
              ? 'handThrow 0.4s ease-in forwards'
              : 'none',
          zIndex: 10,
        }}
      >
        <svg viewBox="0 0 200 280" width="200" height="280" style={{ overflow: 'visible' }}>
          {/* Palm */}
          <ellipse cx="100" cy="220" rx="55" ry="45" fill="#8D5524" />
          <ellipse cx="95" cy="210" rx="35" ry="28" fill="#A0692F" opacity="0.6" />
          {/* Pinky */}
          <rect x="48" y="140" width="22" height="80" rx="11" fill="#8D5524" />
          <rect x="50" y="138" width="18" height="50" rx="9" fill="#A0692F" opacity="0.5" />
          {/* Ring */}
          <rect x="72" y="120" width="24" height="100" rx="12" fill="#8D5524" />
          <rect x="74" y="118" width="20" height="55" rx="10" fill="#A0692F" opacity="0.5" />
          {/* Middle */}
          <rect x="98" y="110" width="26" height="110" rx="13" fill="#8D5524" />
          <rect x="100" y="108" width="22" height="60" rx="11" fill="#A0692F" opacity="0.5" />
          {/* Index */}
          <rect x="126" y="118" width="24" height="100" rx="12" fill="#8D5524" />
          <rect x="128" y="116" width="20" height="55" rx="10" fill="#A0692F" opacity="0.5" />
          {/* Thumb */}
          <ellipse cx="155" cy="195" rx="16" ry="38" fill="#8D5524" transform="rotate(-25 155 195)" />
          <ellipse cx="153" cy="188" rx="12" ry="25" fill="#A0692F" opacity="0.5" transform="rotate(-25 153 188)" />
          {/* Knuckles */}
          <line x1="60" y1="180" x2="60" y2="185" stroke="#6B3F19" strokeWidth="2" strokeLinecap="round" />
          <line x1="84" y1="175" x2="84" y2="180" stroke="#6B3F19" strokeWidth="2" strokeLinecap="round" />
          <line x1="111" y1="172" x2="111" y2="177" stroke="#6B3F19" strokeWidth="2" strokeLinecap="round" />
          <line x1="138" y1="174" x2="138" y2="179" stroke="#6B3F19" strokeWidth="2" strokeLinecap="round" />
          {/* Wrist crease */}
          <path d="M 55 235 Q 100 250 145 235" stroke="#6B3F19" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* ── THREE DICE ── */}
      {([0, 1, 2] as const).map((i) => {
        const pos = dicePositions[i]
        const isLanding = phase === 'landing'
        const isSettled = phase === 'settled'
        const durations = [1.1, 1.3, 1.2]
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 70,
              height: 70,
              left: '50%',
              top: '50%',
              marginLeft: -35,
              marginTop: -35,
              transform: `translate(${pos.x}px, ${pos.y}px) rotate(${pos.rotate}deg) scale(${pos.scale})`,
              opacity: pos.opacity,
              transition: isLanding
                ? `transform ${durations[i]}s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s`
                : phase === 'throwing'
                ? 'transform 0.35s ease-in, opacity 0.2s'
                : phase === 'settled'
                ? 'transform 0.4s ease-out'
                : 'transform 0.15s ease-out, opacity 0.2s',
              zIndex: isSettled ? 20 : 15,
              filter: isSettled
                ? `drop-shadow(0 8px 16px rgba(0,0,0,0.8)) drop-shadow(0 0 8px ${color.border})`
                : 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <DieFace value={displayDice[i]} color={color} />
          </div>
        )
      })}

      {/* ── CSS KEYFRAMES ── */}
      <style>{`
        @keyframes handShake {
          from { transform: translateX(-50%) rotate(-8deg) translateY(0px); }
          to   { transform: translateX(-50%) rotate(8deg)  translateY(-8px); }
        }
        @keyframes handThrow {
          0%   { transform: translateX(-50%) rotate(0deg)   translateY(0px);   opacity: 1; }
          60%  { transform: translateX(-50%) rotate(-30deg) translateY(-60px);  opacity: 1; }
          100% { transform: translateX(-50%) rotate(-45deg) translateY(-120px); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
