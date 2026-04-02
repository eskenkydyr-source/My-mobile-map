import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { haversine } from '../utils/distance'

// Рассчитать азимут от точки A к точке B (в градусах 0-360)
function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Найти ближайшую точку маршрута к текущей позиции
function findProgress(pos: [number, number], path: [number, number][]): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < path.length; i++) {
    const d = haversine(pos[0], pos[1], path[i][0], path[i][1])
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

// Оставшееся расстояние от текущего индекса до конца маршрута
function remainingDist(fromIdx: number, path: [number, number][]): number {
  let dist = 0
  for (let i = fromIdx; i < path.length - 1; i++) {
    dist += haversine(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1])
  }
  return dist
}

// Стрелка и текст направления
function directionInfo(brg: number): { arrow: string; text: string } {
  const dirs = [
    { arrow: '↑', text: 'Прямо' },
    { arrow: '↗', text: 'Правее' },
    { arrow: '→', text: 'Направо' },
    { arrow: '↘', text: 'Правее назад' },
    { arrow: '↓', text: 'Назад' },
    { arrow: '↙', text: 'Левее назад' },
    { arrow: '←', text: 'Налево' },
    { arrow: '↖', text: 'Левее' },
  ]
  const idx = Math.round(brg / 45) % 8
  return dirs[idx]
}

function formatDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} км`
  return `${Math.round(m)} м`
}

interface Props {
  gpsPos: [number, number] | null
  gpsSpeed: number | null  // м/с
  gpsHeading: number | null
}

export default function NavigationPanel({ gpsPos, gpsSpeed, gpsHeading }: Props) {
  const { routePath, to, setNavActive, rerouting } = useStore()
  const watchRef = useRef<number | null>(null)

  // Сброс при размонтировании
  useEffect(() => () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current) }, [])

  if (!routePath || routePath.length < 2 || !gpsPos) return null

  const progressIdx = findProgress(gpsPos, routePath)
  const remaining = remainingDist(progressIdx, routePath)
  const isArrived = remaining < 30

  // Следующая точка маршрута для направления
  const nextIdx = Math.min(progressIdx + 3, routePath.length - 1)
  const nextPt = routePath[nextIdx]
  const brg = bearing(gpsPos[0], gpsPos[1], nextPt[0], nextPt[1])

  // Относительный азимут (если GPS даёт heading)
  const relativeBrg = gpsHeading !== null ? ((brg - gpsHeading + 360) % 360) : brg
  const dir = directionInfo(relativeBrg)

  const speedKmh = gpsSpeed !== null && gpsSpeed > 0.5 ? Math.round(gpsSpeed * 3.6) : null
  const eta = speedKmh && speedKmh > 0 ? Math.round(remaining / (gpsSpeed! * 60)) : null

  if (isArrived) {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: 48, textAlign: 'center' }}>🏁</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e', textAlign: 'center' }}>
          Вы прибыли!
        </div>
        <button onClick={() => setNavActive(false)} style={stopBtnStyle}>
          ✕ Завершить
        </button>
      </div>
    )
  }

  return (
    <div style={panelStyle}>
      {/* Индикатор пересчёта маршрута */}
      {rerouting && (
        <div style={{
          background: '#1e3a5f', border: '1px solid #2563eb',
          borderRadius: 8, padding: '8px 12px', marginBottom: 10,
          fontSize: 13, color: '#93c5fd', textAlign: 'center',
          animation: 'pulse 1s infinite',
        }}>
          🔄 Пересчёт маршрута...
        </div>
      )}

      {/* Направление */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, flexShrink: 0, boxShadow: '0 2px 12px rgba(29,78,216,0.5)',
        }}>
          {dir.arrow}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>
            {dir.text}
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
            до цели: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{formatDist(remaining)}</span>
          </div>
          {to && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📍 {to.name}
            </div>
          )}
        </div>
      </div>

      {/* Скорость и ETA */}
      <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
        {speedKmh !== null && (
          <div style={statBox}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>{speedKmh}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>км/ч</div>
          </div>
        )}
        {eta !== null && (
          <div style={statBox}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>{eta}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>мин</div>
          </div>
        )}
        <button onClick={() => setNavActive(false)} style={stopBtnStyle}>
          ✕ Стоп
        </button>
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(16px + env(safe-area-inset-bottom))',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(380px, calc(100vw - 16px))',
  background: '#0f172a',
  border: '1px solid #1e3a5f',
  borderRadius: 16,
  padding: '14px 16px',
  zIndex: 1000,
  boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
}

const statBox: React.CSSProperties = {
  flex: 1,
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 10,
  padding: '8px 0',
  textAlign: 'center',
}

const stopBtnStyle: React.CSSProperties = {
  flex: 1,
  background: '#450a0a',
  color: '#fca5a5',
  border: '1px solid #7f1d1d',
  borderRadius: 10,
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  touchAction: 'manipulation',
}
