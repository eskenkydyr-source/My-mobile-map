import { useState, useRef, useEffect } from 'react'
import { Search, X, MapPin, Factory, Settings } from 'lucide-react'
import { theme as t } from '../theme'
import { useStore } from '../store/useStore'

interface SearchResult {
  name: string
  type: string
  lat: number
  lon: number
  properties: any
}

export default function SearchBar() {
  const { setSelectedObject, setFlyTarget, wells, bkns, gu } = useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = (q: string) => {
    setQuery(q)
    if (q.trim().length < 1) { setResults([]); setOpen(false); return }

    const data = { wells, bkns, gu }
    if (!data.wells) return

    const q2 = q.trim().toLowerCase()
    const found: SearchResult[] = []

    // Скважины
    if (data.wells?.features) {
      for (const f of data.wells.features) {
        const num = String(f.properties.well_num || f.properties.name || '')
        if (num.toLowerCase().includes(q2)) {
          const [lon, lat] = f.geometry.coordinates
          found.push({ name: `Скв. ${num}`, type: f.properties.type || 'well', lat, lon, properties: f.properties })
          if (found.length >= 10) break
        }
      }
    }

    // БКНС
    if (data.bkns?.features && found.length < 10) {
      for (const f of data.bkns.features) {
        const name = String(f.properties.NAME || '')
        if (name.toLowerCase().includes(q2)) {
          const geom = f.geometry as any
          const coords = geom.coordinates[0]
          const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length
          const lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length
          found.push({ name, type: 'bkns', lat, lon, properties: f.properties })
        }
      }
    }

    // ГУ
    if (data.gu?.features && found.length < 10) {
      for (const f of data.gu.features) {
        const name = String(f.properties.NAME || f.properties.FIND || '')
        if (name.toLowerCase().includes(q2)) {
          const geom = f.geometry as any
          const coords = geom.coordinates[0]
          const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length
          const lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length
          found.push({ name, type: 'gu', lat, lon, properties: f.properties })
        }
      }
    }

    setResults(found)
    setOpen(found.length > 0)
  }

  const select = (r: SearchResult) => {
    setSelectedObject({ name: r.name, type: r.type, lat: r.lat, lon: r.lon, properties: r.properties })
    setFlyTarget([r.lat, r.lon])
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.blur()
  }

  // Закрыть при тапе/клике вне (поддержка и touch, и mouse)
  useEffect(() => {
    const handler = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  const typeColor: Record<string, string> = {
    'dob.': '#22c55e', 'nagn.': '#3b82f6', 'likv.': '#6b7280', 'water': '#06b6d4',
    'gaz': '#eab308', 'kontr.': '#8b5cf6', 'razv.': '#f97316', 'bkns': '#ef4444', 'gu': '#f59e0b'
  }

  return (
    <div ref={wrapRef} className="search-bar-wrap" style={{
      position: 'absolute',
      top: 'max(12px, env(safe-area-inset-top))',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(360px, calc(100vw - 24px))',
      zIndex: 1000,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: t.bg.base,
        border: `1px solid ${t.border.default}`,
        borderRadius: open && results.length > 0 ? '12px 12px 0 0' : 12,
        padding: '0 12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}>
        <Search size={16} style={{ marginRight: 8, opacity: 0.5, flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Поиск скважин, БКНС, ГУ..."
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: t.text.primary,
            fontSize: 16, /* 16px — без автозума на iOS */
            padding: '12px 0',
            minHeight: 44,
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus() }}
            aria-label="Очистить поиск"
            style={{
              background: 'none', border: 'none', color: t.text.secondary, cursor: 'pointer',
              padding: 8, minWidth: 44, minHeight: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'manipulation',
            }}
          ><X size={16} /></button>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          background: t.bg.base,
          border: `1px solid ${t.border.default}`,
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          overflow: 'hidden',
          maxHeight: '40vh',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          WebkitOverflowScrolling: 'touch',
        }}>
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => select(r)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                borderTop: i > 0 ? `1px solid ${t.border.subtle}` : 'none',
                color: t.text.primary,
                padding: '12px',
                minHeight: 48,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                touchAction: 'manipulation',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: typeColor[r.type] || t.text.secondary, flexShrink: 0 }} />
              <span style={{ fontWeight: 500 }}>{r.name}</span>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && query.trim().length >= 1 && (
        <div style={{
          background: t.bg.base,
          border: `1px solid ${t.border.default}`,
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
          padding: '16px 12px',
          color: t.text.muted,
          fontSize: 13,
          textAlign: 'center',
        }}>
          Ничего не найдено
        </div>
      )}
    </div>
  )
}
