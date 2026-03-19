'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TRAINING_SESSIONS, isSessionUnlocked, type TrainingSessionKey } from '@/lib/arena-training'

const BoxerDisplay = dynamic(
  () => import('@/components/arena/BoxerDisplay'),
  { ssr: false }
)

const STAT_CAP = 99

export default function ArenaTrainPage() {
  const router = useRouter()
  const [fighter, setFighter] = useState<any>(null)
  const [balanceCents, setBalanceCents] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [trainingKey, setTrainingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = () => {
    Promise.all([
      fetch('/api/arena/me', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/wallet/get', { credentials: 'include' }).then(r => r.json()),
    ]).then(([meData, walletData]) => {
      if (meData?.fighter) setFighter(meData.fighter)
      if (typeof walletData?.balance_cents === 'number') setBalanceCents(walletData.balance_cents)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const runTrain = (sessionKey: TrainingSessionKey) => {
    if (!fighter || trainingKey) return
    setError(null)
    setMessage(null)
    setTrainingKey(sessionKey)
    fetch('/api/arena/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionKey }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.message && !data.stat) {
          setError(data.message)
          return
        }
        setMessage(data.stat ? `+${data.gain ?? 0} ${data.stat}! Sessions: ${data.trainingSessions ?? 0}` : 'Trained!')
        if (typeof data.balance_cents === 'number') setBalanceCents(data.balance_cents)
        fetchData()
      })
      .catch(() => setError('Network error'))
      .finally(() => setTrainingKey(null))
  }

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
        <p style={{ color: '#666', marginBottom: 16 }}>You need a fighter to train.</p>
        <button onClick={() => router.push('/dashboard/arena')} style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer' }}>Back to Arena</button>
      </div>
    )
  }

  const sessions = fighter?.training_sessions ?? 0
  const balanceDollars = balanceCents != null ? (balanceCents / 100).toFixed(2) : '—'

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#fff', padding: '24px 16px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button onClick={() => router.push('/dashboard/arena')} style={{ background: 'transparent', border: 'none', color: '#f0a500', fontSize: 18, cursor: 'pointer' }}>←</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Training Gym</h1>
        <span style={{ fontSize: 14, color: '#888' }}>Wallet: ${balanceDollars}</span>
      </div>

      {error && <div style={{ padding: 12, marginBottom: 16, background: 'rgba(239,68,68,0.2)', borderRadius: 8, color: '#fca5a5', fontSize: 14 }}>{error}</div>}
      {message && <div style={{ padding: 12, marginBottom: 16, background: 'rgba(34,197,94,0.2)', borderRadius: 8, color: '#86efac', fontSize: 14 }}>{message}</div>}

      <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden', border: '1px solid #30363d', minHeight: 280 }}>
        <BoxerDisplay
          fighter={fighter}
          size="medium"
        />
      </div>

      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>Stats cap at {STAT_CAP}. Real wallet deduction.</p>

      <div style={{ display: 'grid', gap: 12 }}>
        {TRAINING_SESSIONS.map(s => {
          const unlocked = isSessionUnlocked(s.requiredSessions, sessions)
          const currentVal = Number(fighter?.stats?.[s.stat] ?? fighter?.[s.stat] ?? 0)
          const atCap = currentVal >= STAT_CAP
          const canAfford = balanceCents != null && balanceCents >= s.priceCents
          const disabled = !unlocked || atCap || !canAfford || trainingKey !== null
          const priceDollars = (s.priceCents / 100).toFixed(2)
          return (
            <div
              key={s.key}
              style={{
                background: unlocked ? '#161b22' : '#0d1117',
                border: '1px solid #30363d',
                borderRadius: 12,
                padding: 16,
                opacity: unlocked ? 1 : 0.7,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>{s.name}</h3>
                <span style={{ color: '#f0a500', fontSize: 14 }}>${priceDollars}</span>
              </div>
              <p style={{ margin: '0 0 8px', color: '#666', fontSize: 12 }}>+{s.minGain}–{s.maxGain} {s.stat} · Current: {currentVal}/{STAT_CAP}</p>
              {!unlocked && <p style={{ margin: '0 0 8px', color: '#f59e0b', fontSize: 11 }}>Unlocks after {s.requiredSessions} sessions</p>}
              <button
                disabled={disabled}
                onClick={() => runTrain(s.key)}
                style={{
                  width: '100%',
                  padding: 12,
                  background: disabled ? '#30363d' : '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {trainingKey === s.key ? 'Training…' : atCap ? 'Maxed' : !canAfford ? 'Insufficient balance' : 'Train'}
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
