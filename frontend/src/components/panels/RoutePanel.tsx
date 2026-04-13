import { useState } from 'react'
import { MapPin, Radio, X, Map, Ruler, Clock, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react'
import { theme as t } from '../../theme'
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
      (err) => {
        const msg = err.code === 1
          ? 'Доступ к GPS запрещён. Разрешите в настройках браузера.'
          : err.code === 3
          ? 'GPS не ответил за 15 секунд. Попробуйте на открытом месте.'
          : 'GPS недоступен. Проверьте настройки местоположения.'
        setLocError(msg)
        setTimeout(() => setLocError(''), 5000)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )
  }

  const renderPoint = (which: 'from' | 'to') => {
    const label = which === 'from' ? 'Откуда' : 'Куда'
    const color = which === 'from' ? t.success : t.error
    const wp = which === 'from' ? from : to

    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: t.text.dim, marginBottom: 8 }}>{label}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={searchQuery[which]}
            onChange={e => handleSearch(which, e.target.value)}
            placeholder="Поиск объекта..."
            style={{
              flex: 1, padding: '8px 12px',
              fontSize: 16, /* 16px — без автозума на iOS/Android */
              background: t.bg.surface, color: t.text.primary,
              border: `1px solid ${wp ? color : t.border.default}`,
              borderRadius: 6, outline: 'none',
            }}
          />
          <button
            onClick={() => setRouteSelectMode(routeSelectMode === which ? null : which)}
            title="Выбрать на карте"
            aria-label={`Выбрать точку "${label}" на карте`}
            style={{
              minWidth: 44, minHeight: 44, padding: '8px',
              background: routeSelectMode === which ? color : t.bg.surface,
              color: routeSelectMode === which ? t.onColor : t.text.secondary,
              border: `1px solid ${t.border.default}`, borderRadius: 6, cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          ><MapPin size={18} /></button>
          <button
            onClick={() => locateMe(which)}
            title="Моё местоположение"
            aria-label={`Моё местоположение как "${label}"`}
            style={{
              minWidth: 44, minHeight: 44, padding: '8px',
              background: t.bg.surface, color: t.text.secondary,
              border: `1px solid ${t.border.default}`, borderRadius: 6, cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          ><Radio size={18} /></button>
        </div>

        {/* Результаты поиска */}
        {activeSearch === which && searchResults[which].length > 0 && (
          <div style={{
            background: t.bg.surface, border: `1px solid ${t.border.default}`,
            borderRadius: 6, marginTop: 4, maxHeight: 150, overflowY: 'auto'
          }}>
            {searchResults[which].map((r, i) => (
              <div
                key={i}
                role="option"
                tabIndex={0}
                onClick={() => selectResult(which, r)}
                onKeyDown={e => e.key === 'Enter' && selectResult(which, r)}
                style={{
                  padding: '12px', fontSize: 13, cursor: 'pointer',
                  borderBottom: `1px solid ${t.bg.base}`,
                  display: 'flex', gap: 8, alignItems: 'center',
                  touchAction: 'manipulation',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.type === 'well' ? t.text.muted : r.type === 'bkns' ? t.error : t.warning, flexShrink: 0 }} />
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
          background: t.accentBlue, color: t.onColor,
          padding: '8px 12px', borderRadius: 6, fontSize: 13,
          marginBottom: 8, textAlign: 'center'
        }}>
          Кликните на карте — "{routeSelectMode === 'from' ? 'Откуда' : 'Куда'}"
        </div>
      )}

      {renderPoint('from')}
      {renderPoint('to')}

      {/* Сообщение об ошибке геолокации */}
      {locError && (
        <div style={{
          background: t.errorBg, border: `1px solid ${t.errorBorder}`,
          borderRadius: 6, padding: '8px 12px',
          fontSize: 12, color: t.errorText, marginBottom: 8
        }}>
          <AlertCircle size={14} /> {locError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          disabled={!from || !to}
          onClick={buildRoute}
          style={{
            flex: 1, padding: '12px', fontSize: 15, fontWeight: 600, minHeight: 48,
            background: from && to ? t.accentBlue : t.bg.surface,
            color: from && to ? t.onColor : t.text.dim,
            border: 'none', borderRadius: 6,
            cursor: from && to ? 'pointer' : 'default',
            touchAction: 'manipulation',
          }}
        >
          <Map size={16} /> Построить маршрут
        </button>
        <button
          onClick={clearRoute}
          aria-label="Очистить маршрут"
          style={{
            minWidth: 48, minHeight: 48, padding: '12px',
            background: t.bg.surface, color: t.text.secondary,
            border: `1px solid ${t.border.default}`, borderRadius: 6, cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        ><X size={16} /></button>
      </div>

      {routeInfo && (
        <div style={{
          marginTop: 12, padding: 12,
          background: t.bg.surface, borderRadius: 8,
          border: `1px solid ${t.border.default}`
        }}>
          <div style={{ fontSize: 15, color: t.success, fontWeight: 600, marginBottom: 4 }}>
            <CheckCircle size={14} /> Маршрут построен
          </div>
          <div style={{ fontSize: 13, color: t.text.secondary, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ruler size={13} /> {(routeInfo.distance / 1000).toFixed(1)} км
          </div>
          <div style={{ fontSize: 13, color: t.text.secondary, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={13} /> ~{routeInfo.duration.toFixed(0)} мин (30 км/ч)
          </div>
        </div>
      )}

      {routePath !== null && routePath.length === 0 && from && to && (
        <div style={{ marginTop: 8, fontSize: 13, color: t.warning, textAlign: 'center' }}>
          <AlertTriangle size={14} /> Маршрут не найден — нет дороги
        </div>
      )}
    </div>
  )
}
