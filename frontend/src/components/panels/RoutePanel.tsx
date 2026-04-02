import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { searchObjects } from '../../utils/search'
import type { SearchResult } from '../../utils/search'

export default function RoutePanel() {
  const { from, to, setFrom, setTo, routeSelectMode, setRouteSelectMode, routePath, routeInfo, setRoutePath, setRouteInfo, buildRoute } = useStore()
  const [searchQuery, setSearchQuery] = useState({ from: '', to: '' })
  const [searchResults, setSearchResults] = useState<{ from: SearchResult[]; to: SearchResult[] }>({ from: [], to: [] })
  const [activeSearch, setActiveSearch] = useState<'from' | 'to' | null>(null)
  const [locError, setLocError] = useState('')

  const wells = useStore(s => s.wells)
  const bkns  = useStore(s => s.bkns)
  const gu    = useStore(s => s.gu)

  const handleSearch = (which: 'from' | 'to', q: string) => {
    setSearchQuery(prev => ({ ...prev, [which]: q }))
    if (q.length >= 2) {
      const results = searchObjects(q, wells, bkns, gu)
      setSearchResults(prev => ({ ...prev, [which]: results }))
      setActiveSearch(which)
    } else {
      setSearchResults(prev => ({ ...prev, [which]: [] }))
    }
  }

  const selectResult = (which: 'from' | 'to', r: SearchResult) => {
    const wp = { lat: r.lat, lon: r.lon, name: r.name }
    which === 'from' ? setFrom(wp) : setTo(wp)
    setSearchQuery(prev => ({ ...prev, [which]: r.name }))
    setSearchResults({ from: [], to: [] })
    setActiveSearch(null)
  }

  const clearRoute = () => {
    setFrom(null); setTo(null)
    setRoutePath(null); setRouteInfo(null)
    setSearchQuery({ from: '', to: '' })
    setRouteSelectMode(null)
    setLocError('')
  }

  const locateMe = (which: 'from' | 'to') => {
    setLocError('')
    if (!navigator.geolocation) {
      setLocError('Геолокация не поддерживается на этом устройстве')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        const wp = { lat, lon, name: 'Моё местоположение' }
        which === 'from' ? setFrom(wp) : setTo(wp)
        setSearchQuery(prev => ({ ...prev, [which]: 'Моё местоположение' }))
      },
      () => {
        setLocError('Не удалось получить геолокацию. Разрешите доступ к GPS.')
        setTimeout(() => setLocError(''), 4000)
      }
    )
  }

  const renderPoint = (which: 'from' | 'to') => {
    const label = which === 'from' ? 'Откуда' : 'Куда'
    const color = which === 'from' ? '#22c55e' : '#ef4444'
    const wp = which === 'from' ? from : to

    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>{label}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={searchQuery[which]}
            onChange={e => handleSearch(which, e.target.value)}
            placeholder="Поиск объекта..."
            style={{
              flex: 1, padding: '10px 12px',
              fontSize: 16, /* 16px — без автозума на iOS/Android */
              background: '#1e293b', color: '#e2e8f0',
              border: '1px solid ' + (wp ? color : '#334155'),
              borderRadius: 6, outline: 'none',
            }}
          />
          <button
            onClick={() => setRouteSelectMode(routeSelectMode === which ? null : which)}
            title="Выбрать на карте"
            style={{
              minWidth: 44, minHeight: 44, padding: '10px',
              fontSize: 18,
              background: routeSelectMode === which ? color : '#1e293b',
              color: routeSelectMode === which ? '#fff' : '#94a3b8',
              border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >📍</button>
          <button
            onClick={() => locateMe(which)}
            title="Моё местоположение"
            style={{
              minWidth: 44, minHeight: 44, padding: '10px',
              fontSize: 18,
              background: '#1e293b', color: '#94a3b8',
              border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >📡</button>
        </div>

        {/* Результаты поиска */}
        {activeSearch === which && searchResults[which].length > 0 && (
          <div style={{
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 6, marginTop: 4, maxHeight: 150, overflowY: 'auto'
          }}>
            {searchResults[which].map((r, i) => (
              <div
                key={i}
                onClick={() => selectResult(which, r)}
                style={{
                  padding: '12px 10px', fontSize: 13, cursor: 'pointer',
                  borderBottom: '1px solid #0f172a',
                  display: 'flex', gap: 6, alignItems: 'center',
                  touchAction: 'manipulation',
                }}
              >
                <span>{r.type === 'well' ? '⚫' : r.type === 'bkns' ? '🔴' : '🟡'}</span>
                <span>{r.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 12 }}>
      {routeSelectMode && (
        <div style={{
          background: '#1d4ed8', color: '#fff',
          padding: '10px 12px', borderRadius: 6, fontSize: 13,
          marginBottom: 10, textAlign: 'center'
        }}>
          Кликните на карте — "{routeSelectMode === 'from' ? 'Откуда' : 'Куда'}"
        </div>
      )}

      {renderPoint('from')}
      {renderPoint('to')}

      {/* Сообщение об ошибке геолокации */}
      {locError && (
        <div style={{
          background: '#450a0a', border: '1px solid #7f1d1d',
          borderRadius: 6, padding: '8px 10px',
          fontSize: 12, color: '#fca5a5', marginBottom: 8
        }}>
          ❌ {locError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          disabled={!from || !to}
          onClick={buildRoute}
          style={{
            flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, minHeight: 48,
            background: from && to ? '#1d4ed8' : '#1e293b',
            color: from && to ? '#fff' : '#475569',
            border: 'none', borderRadius: 6,
            cursor: from && to ? 'pointer' : 'default',
            touchAction: 'manipulation',
          }}
        >
          🗺 Построить маршрут
        </button>
        <button
          onClick={clearRoute}
          style={{
            minWidth: 48, minHeight: 48, padding: '12px',
            fontSize: 16,
            background: '#1e293b', color: '#94a3b8',
            border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >✕</button>
      </div>

      {routeInfo && (
        <div style={{
          marginTop: 12, padding: 12,
          background: '#1e293b', borderRadius: 8,
          border: '1px solid #334155'
        }}>
          <div style={{ fontSize: 14, color: '#22c55e', fontWeight: 600, marginBottom: 4 }}>
            ✅ Маршрут построен
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            📏 {(routeInfo.distance / 1000).toFixed(1)} км
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            ⏱ ~{routeInfo.duration.toFixed(0)} мин (30 км/ч)
          </div>
        </div>
      )}

      {routePath !== null && routePath.length === 0 && from && to && (
        <div style={{ marginTop: 8, fontSize: 13, color: '#f59e0b', textAlign: 'center' }}>
          ⚠️ Маршрут не найден — нет дороги
        </div>
      )}
    </div>
  )
}
