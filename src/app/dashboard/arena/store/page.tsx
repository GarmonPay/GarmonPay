'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const BoxerDisplay = dynamic(
  () => import('@/components/arena/BoxerDisplay'),
  { ssr: false }
)

export default function ArenaStorePage() {
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [arenaCoins, setArenaCoins] = useState<number | null>(null)
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [fighter, setFighter] = useState<any>(null)

  const fetchData = () => {
    Promise.all([
      fetch('/api/arena/store/items', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/arena/store/inventory', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/arena/me', { credentials: 'include' }).then(r => r.json()),
    ]).then(([itemsData, invData, meData]) => {
      if (meData?.fighter) setFighter(meData.fighter)
      if (itemsData?.items) {
        setItems(itemsData.items)
        setCategories(itemsData.categories ?? [])
      }
      if (typeof invData?.arenaCoins === 'number') setArenaCoins(invData.arenaCoins)
      if (Array.isArray(invData?.inventory)) {
        const ids = new Set<string>(
          invData.inventory.map((e: any) => String(e.storeItemId || e.store_item_id || '')).filter(Boolean)
        )
        setOwnedIds(ids)
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const buyWithCoins = (item: any) => {
    const id = item.id
    const price = Number(item.coin_price ?? 0)
    if (!(price > 0) || (arenaCoins ?? 0) < price) return
    setError(null)
    setBuyingId(id)
    fetch('/api/arena/store/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ storeItemId: id }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.message && !data.inventory) setError(data.message)
        else fetchData()
      })
      .catch(() => setError('Network error'))
      .finally(() => setBuyingId(null))
  }

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
        <div style={{ color: '#f0a500', fontSize: 48 }}>🛍️</div>
      </div>
    )
  }

  const filtered = selectedCategory ? items.filter((i: any) => i.category === selectedCategory) : items
  const displayCategories = categories.length > 0 ? categories : Array.from(new Set(items.map((i: any) => i.category)))

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#fff', padding: '24px 16px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button onClick={() => router.push('/dashboard/arena')} style={{ background: 'transparent', border: 'none', color: '#f0a500', fontSize: 18, cursor: 'pointer' }}>←</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Arena Store</h1>
        <span style={{ fontSize: 14, color: '#f0a500' }}>Coins: {arenaCoins ?? 0}</span>
      </div>

      {error && <div style={{ padding: 12, marginBottom: 16, background: 'rgba(239,68,68,0.2)', borderRadius: 8, color: '#fca5a5', fontSize: 14 }}>{error}</div>}

      <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden', border: '1px solid #30363d', minHeight: 260 }}>
        <BoxerDisplay
          fighter={fighter}
          size="medium"
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setSelectedCategory(null)}
          style={{
            padding: '8px 14px',
            background: selectedCategory === null ? '#f0a500' : '#161b22',
            color: selectedCategory === null ? '#000' : '#fff',
            border: '1px solid #30363d',
            borderRadius: 8,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          All
        </button>
        {displayCategories.map((c: string) => (
          <button
            key={c}
            onClick={() => setSelectedCategory(c)}
            style={{
              padding: '8px 14px',
              background: selectedCategory === c ? '#f0a500' : '#161b22',
              color: selectedCategory === c ? '#000' : '#fff',
              border: '1px solid #30363d',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {filtered.map((item: any) => {
          const owned = ownedIds.has(item.id)
          const coinPrice = Number(item.coin_price ?? 0)
          const canBuyCoins = coinPrice > 0 && (arenaCoins ?? 0) >= coinPrice
          const bonuses = item.stat_bonuses && typeof item.stat_bonuses === 'object' ? Object.entries(item.stat_bonuses) : []
          const isBuying = buyingId === item.id
          return (
            <div
              key={item.id}
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{item.emoji || '📦'}</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>{item.category}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{item.name}</div>
              {item.description && <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{item.description}</div>}
              {bonuses.length > 0 && (
                <div style={{ fontSize: 11, color: '#86efac', marginBottom: 8 }}>
                  {bonuses.map(([k, v]: [string, any]) => `+${v} ${k}`).join(', ')}
                </div>
              )}
              {owned ? (
                <span style={{ display: 'block', padding: '6px 0', fontSize: 12, color: '#86efac' }}>Owned</span>
              ) : coinPrice > 0 ? (
                <button
                  disabled={!canBuyCoins || isBuying}
                  onClick={() => buyWithCoins(item)}
                  style={{
                    width: '100%',
                    padding: 10,
                    background: canBuyCoins && !isBuying ? '#f0a500' : '#30363d',
                    color: canBuyCoins && !isBuying ? '#000' : '#888',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: canBuyCoins && !isBuying ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isBuying ? '…' : `${coinPrice} coins`}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: '#666' }}>—</span>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && <p style={{ color: '#666', marginTop: 20 }}>No items in this category.</p>}

      <button
        onClick={() => router.push('/dashboard/arena')}
        style={{ marginTop: 24, width: '100%', padding: 12, background: '#161b22', color: '#888', border: '1px solid #30363d', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
      >
        Back to Arena
      </button>
    </div>
  )
}
