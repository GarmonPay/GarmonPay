'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const BoxerDisplay = dynamic(
  () => import('@/components/arena/BoxerDisplay'),
  { ssr: false }
)

const STAT_KEYS = ['strength', 'speed', 'stamina', 'defense', 'chin', 'special'] as const

export default function ArenaFighterPage() {
  const router = useRouter()
  const [fighter, setFighter] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/arena/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data?.fighter) setFighter(data.fighter)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
        <div style={{ color: '#f0a500', fontSize: 48 }}>🥊</div>
      </div>
    )
  }

  if (!fighter) {
    return (
      <div style={{ padding: 24, background: '#0d1117', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#666', marginBottom: 16 }}>You don&apos;t have a fighter yet.</p>
        <button
          onClick={() => router.push('/dashboard/arena/create/manual')}
          style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          Create Fighter
        </button>
        <br />
        <button
          onClick={() => router.push('/dashboard/arena')}
          style={{ marginTop: 12, padding: '10px 20px', background: 'transparent', color: '#f0a500', border: '1px solid #f0a500', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
        >
          Back to Arena
        </button>
      </div>
    )
  }

  const wins = fighter.wins ?? 0
  const losses = fighter.losses ?? 0
  const gear: string[] = []
  if (fighter.equipped_gloves) gear.push(String(fighter.equipped_gloves).replace(/_/g, ' '))
  if (fighter.equipped_shorts) gear.push(String(fighter.equipped_shorts).replace(/_/g, ' '))
  if (fighter.equipped_shoes) gear.push(String(fighter.equipped_shoes).replace(/_/g, ' '))
  if (fighter.equipped_headgear && fighter.equipped_headgear !== 'none') gear.push(String(fighter.equipped_headgear).replace(/_/g, ' '))

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#fff', padding: '24px 16px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.push('/dashboard/arena')} style={{ background: 'transparent', border: 'none', color: '#f0a500', fontSize: 18, cursor: 'pointer' }}>←</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>My Fighter</h1>
      </div>

      <div style={{ background: '#161b22', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #30363d' }}>
        <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden', minHeight: 280 }}>
          <BoxerDisplay
            fighter={fighter}
            size="medium"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, color: fighter.fighter_color || '#f0a500' }}>{fighter.name || 'Fighter'}</h2>
            <p style={{ margin: 0, color: '#666', fontSize: 14 }}>{fighter.style || 'Boxer'}</p>
            <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>Record: {wins}W – {losses}L</p>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888', textTransform: 'uppercase' }}>Stats</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {STAT_KEYS.map(key => {
              const val = fighter?.stats?.[key] ?? fighter?.[key] ?? 48
              return (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, color: '#888' }}>
                    <span>{key.slice(0, 3).toUpperCase()}</span>
                    <span style={{ color: '#f0a500' }}>{val}</span>
                  </div>
                  <div style={{ height: 6, background: '#0d1117', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: Math.min(100, val) + '%', height: '100%', background: '#3b82f6', borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {gear.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888', textTransform: 'uppercase' }}>Equipped</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {gear.map((g, i) => (
                <span key={i} style={{ padding: '4px 10px', background: '#0d1117', borderRadius: 6, fontSize: 12, color: '#f0a500', border: '1px solid #30363d' }}>{g}</span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => router.push('/dashboard/arena/create/manual')}
          style={{ width: '100%', padding: 14, background: '#f0a500', color: '#000', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          Edit / Customize
        </button>
      </div>

      <button
        onClick={() => router.push('/dashboard/arena')}
        style={{ width: '100%', padding: 12, background: '#161b22', color: '#888', border: '1px solid #30363d', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
      >
        Back to Arena
      </button>
    </div>
  )
}
