import { useState, useEffect, useRef, useCallback } from 'react'
import { Compass, Crosshair, MapPin, Loader } from 'lucide-react'
import { theme as t } from './theme'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import BottomSheet from './components/BottomSheet'
import SearchBar from './components/SearchBar'
import NavigationPanel from './components/NavigationPanel'
import OfflineBanner from './components/OfflineBanner'
import { useStore } from './store/useStore'
import { haversine, nearestNode } from './utils/distance'
import { astar, buildAdj } from './utils/astar'
import './App.css'

/** Порог схода с маршрута (метры) */
const OFF_ROUTE_THRESHOLD = 50
/** Минимальный интервал между пересчётами (мс) */
const REROUTE_COOLDOWN = 5000

const FAB_SIZE = 48
const fabStyle = (overrides: React.CSSProperties = {}): React.CSSProperties => ({
  width: FAB_SIZE, height: FAB_SIZE, borderRadius: '50%',
  color: t.onColor, cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  ...overrides,
})

export default function App() {
  const {
    markerMode, setMarkerMode, routePath, navActive, setNavActive,
    setFlyTarget, setMyLocation, setGpsHeading: storeSetHeading,
    setFrom, setRoutePath, setRouteInfo, setRerouting,
  } = useStore()
  const [locating, setLocating] = useState(false)
  const [locMsg, setLocMsg] = useState('')

  const [gpsPos, setGpsPos] = useState<[number, number] | null>(null)
  const [gpsSpeed, setGpsSpeed] = useState<number | null>(null)
  const [gpsHeading, setGpsHeading] = useState<number | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const rerouteCooldownRef = useRef(false)

  // --- Пересчёт маршрута от текущего GPS ---
  const rebuildRoute = useCallback((fromPos: [number, number]) => {
    const { editGraph: graph, to: dest } = useStore.getState()
    if (!graph || !dest) return
    const { nodes, edges } = graph
    const adj = buildAdj(nodes, edges)
    const startIdx = nearestNode(fromPos[0], fromPos[1], nodes)
    const goalIdx = nearestNode(dest.lat, dest.lon, nodes)
    if (startIdx === null || goalIdx === null) return

    const path = astar(startIdx, goalIdx, nodes, adj)
    if (!path) return

    const coords: [number, number][] = path.map(i => [nodes[i].lat, nodes[i].lon])
    let dist = 0
    for (let i = 0; i < coords.length - 1; i++) {
      dist += haversine(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
    }
    dist += haversine(fromPos[0], fromPos[1], coords[0][0], coords[0][1])

    setFrom({ lat: fromPos[0], lon: fromPos[1], name: 'Моё местоположение' })
    setRoutePath(coords)
    setRouteInfo({ distance: dist, duration: (dist / 1000) / 30 * 60 })
  }, [setFrom, setRoutePath, setRouteInfo])

  // --- GPS watchPosition при навигации ---
  useEffect(() => {
    if (navActive) {
      if (!navigator.geolocation) { setNavActive(false); return }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          setGpsPos(coords)
          setGpsSpeed(pos.coords.speed)
          setGpsHeading(pos.coords.heading)
          storeSetHeading(pos.coords.heading)
          setMyLocation(coords)
          setFlyTarget(coords)
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
      storeSetHeading(null)
      setRerouting(false)
    }
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [navActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Обнаружение схода с маршрута → авто-пересчёт ---
  useEffect(() => {
    if (!navActive || !gpsPos || !routePath || routePath.length < 2) return
    if (rerouteCooldownRef.current) return

    // Расстояние до ближайшей точки маршрута
    let minDist = Infinity
    for (const pt of routePath) {
      const d = haversine(gpsPos[0], gpsPos[1], pt[0], pt[1])
      if (d < minDist) minDist = d
    }

    if (minDist > OFF_ROUTE_THRESHOLD) {
      // Сошли с маршрута — пересчитываем
      rerouteCooldownRef.current = true
      setRerouting(true)
      rebuildRoute(gpsPos)
      setTimeout(() => {
        rerouteCooldownRef.current = false
        setRerouting(false)
      }, REROUTE_COOLDOWN)
    }
  }, [gpsPos, navActive, routePath, rebuildRoute, setRerouting])

  const applyLocation = (lat: number, lng: number) => {
    setFlyTarget([lat, lng])
    setMyLocation([lat, lng])
    setLocating(false)
    setLocMsg('')
  }

  const locateByIP = async () => {
    setLocMsg('Определяю по IP...')
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
    setLocMsg('Не удалось определить местоположение')
    setTimeout(() => setLocMsg(''), 3000)
  }

  const goToMyLocation = () => {
    setLocating(true)
    setLocMsg('Определяю местоположение...')
    if (!navigator.geolocation) { locateByIP(); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        setLocMsg(err.code === 1 ? 'GPS запрещён, пробую IP...' : 'GPS недоступен, пробую IP...')
        locateByIP()
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    )
  }

  const canNavigate = routePath && routePath.length > 1 && !navActive

  return (
    <div className="app">
      <OfflineBanner />
      <div className="sidebar-wrap">
        <Sidebar />
      </div>

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <MapView />
        {!navActive && <SearchBar />}
        {navActive && (
          <NavigationPanel gpsPos={gpsPos} gpsSpeed={gpsSpeed} gpsHeading={gpsHeading} />
        )}
      </div>

      {!navActive && <BottomSheet />}

      <div className="fab-container">
        {locMsg && (
          <div style={{
            position: 'absolute', right: 56, top: 0, maxWidth: 200,
            background: t.bg.base, color: t.text.secondary,
            border: `1px solid ${t.border.default}`, borderRadius: 8,
            padding: '8px 12px', fontSize: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
          }}>
            {locMsg}
          </div>
        )}

        {canNavigate && (
          <button onClick={() => setNavActive(true)} title="Начать навигацию" aria-label="Начать навигацию" style={fabStyle({
            background: t.successDark, border: `2px solid ${t.successBorder}`,
            boxShadow: '0 4px 16px rgba(22,163,74,0.5)',
          })}><Compass size={22} /></button>
        )}

        {!navActive && (
          <button onClick={goToMyLocation} title="Моё местоположение" aria-label="Моё местоположение" style={fabStyle({
            background: locating ? t.accentBlue : t.bg.base,
            border: `2px solid ${locating ? t.accent : t.border.default}`,
          })}>{locating ? <Loader size={20} className="spin" /> : <Crosshair size={20} />}</button>
        )}

        {!navActive && (
          <button onClick={() => setMarkerMode(!markerMode)} title="Поставить метку" aria-label="Поставить метку" style={fabStyle({
            background: markerMode ? t.warning : t.bg.base,
            border: `2px solid ${markerMode ? t.warning : t.border.default}`,
          })}><MapPin size={20} /></button>
        )}
      </div>
    </div>
  )
}
