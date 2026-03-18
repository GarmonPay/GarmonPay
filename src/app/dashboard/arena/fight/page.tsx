'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ArenaFightPage() {
  const router = useRouter()
  const [opponents, setOpponents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiCreating, setAiCreating] = useState(false)

  useEffect(() => {
    fetch('/api/arena/cpu-fighters', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data?.fighters) setOpponents(data.fighters) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const startFight = (cpuId?: string) => {
    setError(null)
    if (cpuId) setCreating(cpuId)
    else setAiCreating(true)
    const body = cpuId ? { cpuFighterId: cpuId } : { opponentType: 'ai' }
    fetch('/api/arena/fights/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.fightId) {
          setError(data.message || 'Failed to create fight')
          return
        }
        router.push(`/dashboard/arena/spectate/${data.fightId}`)
      })
      .catch(() => setError('Network error'))
      .finally(() => { setCreating(null); setAiCreating(false) })
  }

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
        <div style={{ color: '#f0a500', fontSize: 48 }}>🥊</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#fff', padding: '24px 16px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.push('/dashboard/arena')} style={{ background: 'transparent', border: 'none', color: '#f0a500', fontSize: 18, cursor: 'pointer' }}>←</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Find Fight</h1>
      </div>

      {error && <div style={{ padding: 12, marginBottom: 16, background: 'rgba(239,68,68,0.2)', borderRadius: 8, color: '#fca5a5', fontSize: 14 }}>{error}</div>}

      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => startFight()}
          disabled={aiCreating}
          style={{
            width: '100%',
            padding: 16,
            background: aiCreating ? '#30363d' : '#8b5cf6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 700,
            cursor: aiCreating ? 'not-allowed' : 'pointer',
          }}
        >
          {aiCreating ? 'Creating…' : '🤖 Fight AI Opponent'}
        </button>
      </div>

      <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>Or pick a CPU opponent:</p>
      <div style={{ display: 'grid', gap: 12 }}>
        {opponents.length === 0 && <p style={{ color: '#666', fontSize: 14 }}>No CPU fighters available.</p>}
        {opponents.map((cpu: any) => {
          const isCreating = creating === cpu.id
          const str = cpu.strength ?? 50
          const spd = cpu.speed ?? 50
          const def = cpu.defense ?? 50
          return (
            <div
              key={cpu.id}
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{cpu.name || 'CPU'}</div>
                <div style={{ fontSize: 13, color: '#f0a500' }}>{cpu.style || 'Boxer'}</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>STR {str} SPD {spd} DEF {def}</div>
              </div>
              <button
                disabled={creating !== null || aiCreating}
                onClick={() => startFight(cpu.id)}
                style={{
                  padding: '12px 20px',
                  background: isCreating ? '#30363d' : '#c1272d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: creating || aiCreating ? 'not-allowed' : 'pointer',
                }}
              >
                {isCreating ? 'Starting…' : 'Fight'}
              </button>
            </div>
          )
        })}
      </div>

      <button
        onClick={() => router.push('/dashboard/arena')}
        style={{ marginTop: 24, width: '100%', padding: 12, background: '#161b22', color: '#888', border: '1px solid #30363d', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
      >
        Back to Arena
      </button>
    </div>
  )
}
