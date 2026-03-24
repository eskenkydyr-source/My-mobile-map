import { useState } from 'react'
import { useStore } from '../../store/useStore'

export default function ObjectPanel() {
  const { selectedObject, setFrom, setTo, setActiveTab } = useStore()
  const [routing, setRouting] = useState(false)
  const [locError, setLocError] = useState('')

  if (!selectedObject) {
    return (
      <div style={{ padding: 20, color: '#475569', fontSize: 13, textAlign: 'center' }}>
        Выберите объект на карте
      </div>
    )
  }

  const { name, type, lat, lon, properties } = selectedObject

  const setAsRoute = (which: 'from' | 'to') => {
    const wp = { lat, lon, name }
    which === 'from' ? setFrom(wp) : setTo(wp)
    setActiveTab('route')
  }

  const applyMyLocation = (myLat: number, myLon: number) => {
    ;(window as any).__FLY_TO?.([myLat, myLon])
    ;(window as any).__SET_MY_LOCATION?.([myLat, myLon])
    setFrom({ lat: myLat, lon: myLon, name: 'Моё местоположение' })
    setTo({ lat, lon, name })
    setTimeout(() => {
      ;(window as any).__BUILD_ROUTE?.()
      setActiveTab('route')
    }, 150)
    setRouting(false)
  }

  const routeFromMe = () => {
    setRouting(true)
    setLocError('')

    const tryGPS = () => {
      if (!navigator.geolocation) { tryIP(); return }
      navigator.geolocation.getCurrentPosition(
        pos => applyMyLocation(pos.coords.latitude, pos.coords.longitude),
        () => tryIP(),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      )
    }

    const tryIP = async () => {
      const services = [
        async () => {
          const r = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(5000) })
          const d = await r.json()
          if (d.loc) { const [lat, lon] = d.loc.split(',').map(Number); return { lat, lon } }
          throw new Error('no loc')
        },
        async () => {
          const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) })
          const d = await r.json()
          if (d.latitude) return { lat: d.latitude, lon: d.longitude }
          throw new Error('no data')
        },
        async () => {
          const r = await fetch('https://freeipapi.com/api/json', { signal: AbortSignal.timeout(5000) })
          const d = await r.json()
          if (d.latitude) return { lat: d.latitude, lon: d.longitude }
          throw new Error('no data')
        },
      ]
      for (const service of services) {
        try { const { lat, lon } = await service(); applyMyLocation(lat, lon); return } catch {}
      }
      setRouting(false)
      setLocError('Не удалось определить местоположение. Проверьте интернет.')
      setTimeout(() => setLocError(''), 4000)
    }

    tryGPS()
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8', marginBottom: 6 }}>
        {name}
      </div>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
        {type === 'well' ? 'Скважина' : type === 'bkns' ? 'БКНС' : 'ГУ'} •{' '}
        {lat.toFixed(5)}, {lon.toFixed(5)}
      </div>

      {/* Свойства */}
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
        {Object.entries(properties || {})
          .filter(([k, v]) => v && !['id', 'layer_type', 'OBJECTID', 'OBJECTID_1', 'Shape_Leng', 'Shape_Area', 'PERIMETER', 'GU_', 'GU_ID'].includes(k))
          .map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <span style={{ color: '#475569' }}>{k}:</span>
              <span>{String(v)}</span>
            </div>
          ))
        }
      </div>

      {/* Ошибка геолокации */}
      {locError && (
        <div style={{
          background: '#450a0a', border: '1px solid #7f1d1d',
          borderRadius: 6, padding: '8px 10px',
          fontSize: 12, color: '#fca5a5', marginBottom: 10
        }}>
          ❌ {locError}
        </div>
      )}

      {/* Маршрут от меня */}
      <button
        onClick={routeFromMe}
        disabled={routing}
        style={{
          width: '100%', padding: '12px', fontSize: 14, fontWeight: 600,
          minHeight: 48, marginBottom: 10,
          background: routing ? '#1e3a5f' : '#1d4ed8',
          color: '#fff', border: 'none', borderRadius: 6,
          cursor: routing ? 'wait' : 'pointer',
          boxShadow: '0 2px 6px rgba(29,78,216,0.4)',
          touchAction: 'manipulation',
        }}
      >
        {routing ? '⏳ Определяю местоположение...' : '🎯 Маршрут от меня сюда'}
      </button>

      {/* Кнопки откуда/куда */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setAsRoute('from')}
          style={{
            flex: 1, padding: '12px', fontSize: 13, minHeight: 48,
            background: '#1e293b', color: '#22c55e',
            border: '1px solid #22c55e', borderRadius: 6, cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          📍 Откуда
        </button>
        <button
          onClick={() => setAsRoute('to')}
          style={{
            flex: 1, padding: '12px', fontSize: 13, minHeight: 48,
            background: '#1e293b', color: '#ef4444',
            border: '1px solid #ef4444', borderRadius: 6, cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          🏁 Куда
        </button>
      </div>
    </div>
  )
}
