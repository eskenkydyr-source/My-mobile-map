import { useState } from 'react'
import { MapPin, Crosshair, Flag, Loader, AlertCircle } from 'lucide-react'
import { theme as t } from '../../theme'
import { useStore } from '../../store/useStore'

export default function ObjectPanel() {
  const { selectedObject, setFrom, setTo, setActiveTab, setFlyTarget, setMyLocation, buildRoute } = useStore()
  const [routing, setRouting] = useState(false)
  const [locError, setLocError] = useState('')

  if (!selectedObject) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center' }}>
        <MapPin size={36} style={{ marginBottom: 12, opacity: 0.4, margin: '0 auto 12px' }} />
        <div style={{ color: t.text.secondary, fontSize: 15, fontWeight: 500, marginBottom: 8 }}>
          Объект не выбран
        </div>
        <div style={{ color: t.text.dim, fontSize: 12, lineHeight: 1.5 }}>
          Нажмите на скважину, БКНС или ГУ на карте, чтобы увидеть информацию
        </div>
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
    setFlyTarget([myLat, myLon])
    setMyLocation([myLat, myLon])
    setFrom({ lat: myLat, lon: myLon, name: 'Моё местоположение' })
    setTo({ lat, lon, name })
    setTimeout(() => {
      buildRoute()
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
      <div style={{ fontSize: 15, fontWeight: 700, color: t.accent, marginBottom: 8 }}>
        {name}
      </div>
      <div style={{ fontSize: 12, color: t.text.dim, marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>
        {type === 'well' ? 'Скважина' : type === 'bkns' ? 'БКНС' : 'ГУ'} •{' '}
        {lat.toFixed(5)}, {lon.toFixed(5)}
      </div>

      {/* Свойства */}
      <div style={{ fontSize: 12, color: t.text.secondary, marginBottom: 16 }}>
        {Object.entries(properties || {})
          .filter(([k, v]) => v && !['id', 'layer_type', 'OBJECTID', 'OBJECTID_1', 'Shape_Leng', 'Shape_Area', 'PERIMETER', 'GU_', 'GU_ID'].includes(k))
          .map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: t.text.dim }}>{k}:</span>
              <span>{String(v)}</span>
            </div>
          ))
        }
      </div>

      {/* Ошибка геолокации */}
      {locError && (
        <div style={{
          background: t.errorBg, border: `1px solid ${t.errorBorder}`,
          borderRadius: 6, padding: '8px 12px',
          fontSize: 12, color: t.errorText, marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertCircle size={14} /> {locError}
        </div>
      )}

      {/* Маршрут от меня */}
      <button
        onClick={routeFromMe}
        disabled={routing}
        style={{
          width: '100%', padding: '12px', fontSize: 15, fontWeight: 600,
          minHeight: 48, marginBottom: 8,
          background: routing ? t.bg.elevated : t.accentBlue,
          color: t.onColor, border: 'none', borderRadius: 6,
          cursor: routing ? 'wait' : 'pointer',
          boxShadow: '0 2px 6px rgba(29,78,216,0.4)',
          touchAction: 'manipulation',
        }}
      >
        {routing ? <><Loader size={14} className="spin" /> Определяю местоположение...</> : <><Crosshair size={14} /> Маршрут от меня сюда</>}
      </button>

      {/* Кнопки откуда/куда */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setAsRoute('from')}
          style={{
            flex: 1, padding: '12px', fontSize: 13, minHeight: 48,
            background: t.bg.surface, color: t.success,
            border: `1px solid ${t.success}`, borderRadius: 6, cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          <MapPin size={14} /> Откуда
        </button>
        <button
          onClick={() => setAsRoute('to')}
          style={{
            flex: 1, padding: '12px', fontSize: 13, minHeight: 48,
            background: t.bg.surface, color: t.error,
            border: `1px solid ${t.error}`, borderRadius: 6, cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          <Flag size={14} /> Куда
        </button>
      </div>
    </div>
  )
}
