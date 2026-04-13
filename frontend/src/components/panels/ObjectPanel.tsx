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

    if (!navigator.geolocation) {
      setRouting(false)
      setLocError('Геолокация не поддерживается. Откройте в браузере с GPS.')
      setTimeout(() => setLocError(''), 5000)
      return
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        // Проверяем точность — если >500м, предупреждаем
        if (pos.coords.accuracy > 500) {
          setLocError(`Низкая точность GPS (~${Math.round(pos.coords.accuracy)}м). Подождите фиксацию.`)
          setTimeout(() => setLocError(''), 4000)
        }
        applyMyLocation(pos.coords.latitude, pos.coords.longitude)
      },
      (err) => {
        setRouting(false)
        if (err.code === 1) {
          setLocError('Доступ к GPS запрещён. Разрешите в настройках браузера.')
        } else if (err.code === 3) {
          setLocError('GPS не ответил за 15 секунд. Попробуйте на открытом месте.')
        } else {
          setLocError('GPS недоступен. Проверьте настройки местоположения.')
        }
        setTimeout(() => setLocError(''), 5000)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )
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
