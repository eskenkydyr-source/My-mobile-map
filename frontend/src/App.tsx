import { useState } from 'react'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import { useStore } from './store/useStore'
import './App.css'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { markerMode, setMarkerMode } = useStore()
  const [locating, setLocating] = useState(false)

  const [locMsg, setLocMsg] = useState('')

  const applyLocation = (lat: number, lng: number) => {
    ;(window as any).__FLY_TO?.([lat, lng], 16)
    ;(window as any).__SET_MY_LOCATION?.([lat, lng])
    setLocating(false)
    setLocMsg('')
  }

  // Запасной вариант — IP геолокация (не требует разрешений)
  const locateByIP = async () => {
    setLocMsg('📡 Определяю по IP...')
    // Пробуем несколько сервисов по очереди
    const services = [
      async () => {
        const r = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(5000) })
        const d = await r.json()
        if (d.loc) {
          const [lat, lon] = d.loc.split(',').map(Number)
          return { lat, lon }
        }
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
      try {
        const { lat, lon } = await service()
        applyLocation(lat, lon)
        return
      } catch { /* пробуем следующий */ }
    }
    setLocating(false)
    setLocMsg('')
    alert('Не удалось определить местоположение. Проверьте интернет-соединение.')
  }

  const goToMyLocation = () => {
    setLocating(true)
    setLocMsg('🔍 Определяю местоположение...')

    if (!navigator.geolocation) {
      locateByIP()
      return
    }

    const onSuccess = (pos: GeolocationPosition) => {
      applyLocation(pos.coords.latitude, pos.coords.longitude)
    }

    const onError = (err: GeolocationPositionError) => {
      if (err.code === 1) {
        // Разрешение запрещено — сразу IP
        setLocMsg('🌐 GPS запрещён, пробую IP...')
        locateByIP()
      } else {
        // Таймаут или нет сигнала — IP
        setLocMsg('⏱ GPS недоступен, пробую IP...')
        locateByIP()
      }
    }

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 300000
    })
  }

  return (
    <div className="app">
      <button className="mob-toggle" onClick={() => setSidebarOpen(v => !v)}>
        {sidebarOpen ? '✕' : '☰'}
      </button>
      <div className={`sidebar-wrap ${sidebarOpen ? 'open' : ''}`}>
        <Sidebar />
      </div>
      <MapView />

      {/* Плавающие кнопки */}
      <div style={{
        position: 'fixed', bottom: 20, right: 20,
        display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000
      }}>
        {/* Статус геолокации */}
        {locMsg && (
          <div style={{
            position: 'absolute', right: 52, whiteSpace: 'nowrap',
            background: '#1e293b', color: '#94a3b8',
            border: '1px solid #334155', borderRadius: 8,
            padding: '6px 10px', fontSize: 11,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}>
            {locMsg}
          </div>
        )}

        {/* Моё местоположение */}
        <button
          onClick={goToMyLocation}
          title="Моё местоположение"
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: locating ? '#1d4ed8' : '#1e293b',
            color: '#fff', border: '2px solid ' + (locating ? '#3b82f6' : '#334155'),
            fontSize: 20, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}
        >
          {locating ? '⏳' : '🎯'}
        </button>

        {/* Поставить метку */}
        <button
          onClick={() => setMarkerMode(!markerMode)}
          title="Поставить метку"
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: markerMode ? '#f59e0b' : '#1e293b',
            color: '#fff', border: '2px solid ' + (markerMode ? '#f59e0b' : '#334155'),
            fontSize: 18, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}
        >📍</button>
      </div>
    </div>
  )
}
