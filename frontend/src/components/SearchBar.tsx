import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'

interface SearchResult {
  name: string
  type: string
  lat: number
  lon: number
  properties: any
}

export default function SearchBar() {
  const { setSelectedObject } = useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = (q: string) => {
    setQuery(q)
    if (q.trim().length < 1) { setResults([]); setOpen(false); return }

    const data = (window as any).__KALAMKAS_DATA
    if (!data) return

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
    ;(window as any).__FLY_TO?.([r.lat, r.lon], 16)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  // Закрыть при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.search-bar-wrap')) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const typeIcon: Record<string, string> = {
    'dob.': '🟢', 'nagn.': '🔵', 'likv.': '⚫', 'water': '🩵',
    'gaz': '🟡', 'kontr.': '🟣', 'razv.': '🟠', 'bkns': '🏭', 'gu': '⚙️'
  }

  return (
    <div className="search-bar-wrap" style={{
      position: 'absolute',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(340px, calc(100vw - 80px))',
      zIndex: 1000,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: open && results.length > 0 ? '10px 10px 0 0' : 10,
        padding: '0 12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}>
        <span style={{ fontSize: 16, marginRight: 8, opacity: 0.5 }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Поиск скважин, БКНС, ГУ..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f1f5f9',
            fontSize: 14,
            padding: '11px 0',
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus() }}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, padding: '0 0 0 8px' }}
          >✕</button>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => select(r)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                borderTop: i > 0 ? '1px solid #1e3a5f22' : 'none',
                color: '#f1f5f9',
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 14 }}>{typeIcon[r.type] || '📍'}</span>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
