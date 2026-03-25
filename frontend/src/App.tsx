import { useState, useEffect, useRef } from 'react'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import BottomSheet from './components/BottomSheet'
import SearchBar from './components/SearchBar'
import NavigationPanel from './components/NavigationPanel'
import { useStore } from './store/useStore'
import './App.css'

export default function App() {
  const { markerMode, setMarkerMode, routePath, navActive, setNavActive } = useStore()
  const [locating, setLocating] = useState(false)
  const [locMsg, setLocMsg] = useState('')

  // GPS состояние для навигации
  const [gpsPos, setGpsPos]         = useState<[number, number] | null>(null)
  const [gpsSpeed, setGpsSpeed]     = useState<number | null>(null)
  const [gpsHeading, setGpsHeading] = useState<number | null>(null)
  const watchIdRef = useRef<number | null>(null)

  // Запуск / остановка GPS слежения при навигации
  useEffect(() => {
    if (navActive) {
      if (!navigator.geolocation) { setNavActive(false); return }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lon = pos.coords.longitude
          const coords: [number, number] = [lat, lon]
          setGpsPos(coords)
          setGpsSpeed(pos.coords.speed)
          setGpsHeading(pos.coords.heading)
          // Обновить синюю точку и центрировать карту
          ;(window as any).__SET_MY_LOCATION?.(coords)
          ;(window as any).__NAV_FLY?.(coords)
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
      )
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setGpsPos(null)
      setGpsSpeed(null)
      setGpsHeading(null)
    }
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [navActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyLocation = (lat: number, lng: number) => {
    ;(window as any).__FLY_TO?.([lat, lng], 16)
    ;(window as any).__SET_MY_LOCATION?.([lat, lng])
    setLocating(false)
    setLocMsg('')
  }

  const locateByIP = async () => {
    setLocMsg('📡 Определяю по IP...')
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
      try { const { lat, lon } = await service(); applyLocation(lat, lon); return }
      catch { /* пробуем следующий */ }
    }
    setLocating(false)
    setLocMsg('❌ Не удалось определить местоположение')
    setTimeout(() => setLocMsg(''), 3000)
  }

  const goToMyLocation = () => {
    setLocating(true)
    setLocMsg('🔍 Определяю местоположение...')
    if (!navigator.geolocation) { locateByIP(); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        setLocMsg(err.code === 1 ? '🌐 GPS запрещён, пробую IP...' : '⏱ GPS недоступен, пробую IP...')
        locateByIP()
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    )
  }

  // Показать кнопку "Начать навигацию" когда есть маршрут
  const canNavigate = routePath && routePath.length > 1 && !navActive

  return (
    <div className="app">
      {/* Десктопный сайдбар (скрыт на мобильном через CSS) */}
      <div className="sidebar-wrap">
        <Sidebar />
      </div>

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <MapView />
        {!navActive && <SearchBar />}

        {/* Панель навигации */}
        {navActive && (
          <NavigationPanel gpsPos={gpsPos} gpsSpeed={gpsSpeed} gpsHeading={gpsHeading} />
        )}
      </div>

      {/* Мобильный bottom sheet (скрыт на десктопе через CSS) */}
      {!navActive && <BottomSheet />}

      {/* Плавающие кнопки */}
      <div className="fab-container">
        {locMsg && (
          <div style={{
            position: 'absolute', right: 64, top: 0, maxWidth: 200,
            background: '#1e293b', color: '#94a3b8',
            border: '1px solid #334155', borderRadius: 8,
            padding: '8px 10px', fontSize: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
          }}>
            {locMsg}
          </div>
        )}

        {/* Кнопка "Начать навигацию" — появляется когда построен маршрут */}
        {canNavigate && (
          <button
            onClick={() => setNavActive(true)}
            title="Начать навигацию"
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#16a34a',
              color: '#fff', border: '2px solid #22c55e',
              fontSize: 24, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(22,163,74,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >🧭</button>
        )}

        {!navActive && (
          <button
            onClick={goToMyLocation}
            title="Моё местоположение"
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: locating ? '#1d4ed8' : '#1e293b',
              color: '#fff', border: '2px solid ' + (locating ? '#3b82f6' : '#334155'),
              fontSize: 24, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {locating ? '⏳' : '🎯'}
          </button>
        )}

        {!navActive && (
          <button
            onClick={() => setMarkerMode(!markerMode)}
            title="Поставить метку"
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: markerMode ? '#f59e0b' : '#1e293b',
              color: '#fff', border: '2px solid ' + (markerMode ? '#f59e0b' : '#334155'),
              fontSize: 24, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >📍</button>
        )}
      </div>
    </div>
  )
}
