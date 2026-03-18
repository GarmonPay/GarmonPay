'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ArenaPage() {
  const router = useRouter()
  const [fighter, setFighter] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/arena/me', {
      credentials: 'include'
    })
    .then(r => r.json())
    .then(data => {
      if (data?.fighter) setFighter(data.fighter)
    })
    .catch(() => {})
    .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0d1117'
    }}>
      <div style={{ color: '#f0a500', fontSize: 48 }}>🥊</div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d1117',
      color: '#ffffff',
      padding: '24px 16px',
      fontFamily: 'sans-serif'
    }}>
      
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24
      }}>
        <span style={{ fontSize: 32 }}>🥊</span>
        <div>
          <h1 style={{ 
            margin: 0, 
            fontSize: 24, 
            color: '#ffffff',
            fontWeight: 800
          }}>
            GARMONPAY ARENA
          </h1>
          <p style={{ 
            margin: 0, 
            fontSize: 13, 
            color: '#666' 
          }}>
            Train. Fight. Earn.
          </p>
        </div>
      </div>

      {!fighter ? (
        /* No fighter yet */
        <div style={{
          background: '#161b22',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
          border: '1px solid #30363d'
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>👊</div>
          <h2 style={{ color: '#f0a500', marginBottom: 8 }}>
            Create Your Fighter
          </h2>
          <p style={{ color: '#666', marginBottom: 24 }}>
            One fighter per account. Train, fight, earn real money.
          </p>
          <button
            onClick={() => router.push('/dashboard/arena/create/manual')}
            style={{
              padding: '14px 32px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%'
            }}
          >
            Create Fighter
          </button>
        </div>
      ) : (
        /* Fighter exists */
        <div>
          {/* Fighter card */}
          <div style={{
            background: '#161b22',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            border: '1px solid #30363d'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 16,
              marginBottom: 16
            }}>
              <div style={{ fontSize: 48 }}>
                {fighter.avatar || '🥊'}
              </div>
              <div>
                <h2 style={{ 
                  margin: 0, 
                  fontSize: 22,
                  color: fighter.fighter_color || '#f0a500'
                }}>
                  {fighter.name || 'Fighter'}
                </h2>
                <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
                  {fighter.style || 'Boxer'} • {fighter.wins || 0}W - {fighter.losses || 0}L
                </p>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'STR', value: fighter.stats?.strength ?? fighter.strength ?? 48 },
                { label: 'SPD', value: fighter.stats?.speed ?? fighter.speed ?? 48 },
                { label: 'STA', value: fighter.stats?.stamina ?? fighter.stamina ?? 48 },
                { label: 'DEF', value: fighter.stats?.defense ?? fighter.defense ?? 48 },
                { label: 'CHN', value: fighter.stats?.chin ?? fighter.chin ?? 48 },
                { label: 'SPC', value: fighter.stats?.special ?? fighter.special ?? 20 },
              ].map(stat => (
                <div key={stat.label}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginBottom: 3,
                    color: '#888'
                  }}>
                    <span>{stat.label}</span>
                    <span style={{ color: '#f0a500' }}>{stat.value}</span>
                  </div>
                  <div style={{ 
                    height: 5, 
                    background: '#0d1117', 
                    borderRadius: 3,
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: Math.min(100, stat.value) + '%',
                      height: '100%',
                      background: stat.value >= 70 ? '#f0a500' : '#3b82f6',
                      borderRadius: 3
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 12
          }}>
            <button
              onClick={() => router.push('/dashboard/arena/fight')}
              style={{
                padding: '16px',
                background: '#c1272d',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🥊 FIGHT
            </button>
            <button
              onClick={() => router.push('/dashboard/arena/train')}
              style={{
                padding: '16px',
                background: '#161b22',
                color: 'white',
                border: '1px solid #30363d',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              💪 TRAIN
            </button>
            <button
              onClick={() => router.push('/dashboard/arena/store')}
              style={{
                padding: '16px',
                background: '#161b22',
                color: 'white',
                border: '1px solid #30363d',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🛍️ STORE
            </button>
            <button
              onClick={() => router.push('/dashboard/arena/leaderboard')}
              style={{
                padding: '16px',
                background: '#161b22',
                color: 'white',
                border: '1px solid #30363d',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🏆 RANKS
            </button>
          </div>

          <button
            onClick={() => router.push('/dashboard/arena/corner')}
            style={{
              width: '100%',
              padding: '14px',
              background: '#161b22',
              color: '#f0a500',
              border: '1px solid #f0a500',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🧠 CORNER MAN AI
          </button>
        </div>
      )}
    </div>
  )
}
