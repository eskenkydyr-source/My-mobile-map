import { useEffect, useRef } from 'react'
import { X, Navigation, CornerUpRight, CornerUpLeft, ArrowUp, RotateCcw, MapPin } from 'lucide-react'
import { theme as t } from '../theme'
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

// Найти следующий поворот на маршруте
// Возвращает: угол поворота (0-360, 0=прямо), расстояние до поворота, индекс
function findNextTurn(fromIdx: number, path: [number, number][]): { angle: number; dist: number; idx: number } | null {
  const TURN_THRESHOLD = 30 // градусов — считаем поворотом
  let accumulated = 0

  for (let i = fromIdx; i < path.length - 2; i++) {
    accumulated += haversine(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1])

    const brg1 = bearing(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1])
    const brg2 = bearing(path[i + 1][0], path[i + 1][1], path[i + 2][0], path[i + 2][1])
    let diff = brg2 - brg1
    if (diff > 180) diff -= 360
    if (diff < -180) diff += 360

    if (Math.abs(diff) > TURN_THRESHOLD) {
      return { angle: diff, dist: accumulated, idx: i + 1 }
    }
  }
  return null
}

// Следующий маневр после текущего поворота
function findTurnAfter(turnIdx: number, path: [number, number][]): { angle: number; dist: number } | null {
  const result = findNextTurn(turnIdx + 1, path)
  return result ? { angle: result.angle, dist: result.dist } : null
}

interface TurnInfo {
  icon: React.ReactNode
  text: string
  color: string
}

function getTurnInfo(angle: number): TurnInfo {
  const abs = Math.abs(angle)
  if (abs <= 30) return { icon: <ArrowUp size={32} />, text: 'Прямо', color: t.accent }
  if (angle > 30 && angle <= 70) return { icon: <CornerUpRight size={32} />, text: 'Правее', color: t.accent }
  if (angle > 70 && angle <= 120) return { icon: <CornerUpRight size={32} />, text: 'Направо', color: t.warning }
  if (angle > 120) return { icon: <RotateCcw size={32} style={{ transform: 'scaleX(-1)' }} />, text: 'Разворот', color: t.error }
  if (angle < -30 && angle >= -70) return { icon: <CornerUpLeft size={32} />, text: 'Левее', color: t.accent }
  if (angle < -70 && angle >= -120) return { icon: <CornerUpLeft size={32} />, text: 'Налево', color: t.warning }
  if (angle < -120) return { icon: <RotateCcw size={32} />, text: 'Разворот', color: t.error }
  return { icon: <ArrowUp size={32} />, text: 'Прямо', color: t.accent }
}

function getSmallTurnIcon(angle: number): React.ReactNode {
  if (Math.abs(angle) <= 30) return <ArrowUp size={14} />
  if (angle > 0) return <CornerUpRight size={14} />
  return <CornerUpLeft size={14} />
}

function formatDistShort(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)}`
  return `${Math.round(m)}`
}

function formatDistUnit(m: number): string {
  return m >= 1000 ? 'км' : 'м'
}

interface Props {
  gpsPos: [number, number] | null
  gpsSpeed: number | null
  gpsHeading: number | null
}

export default function NavigationPanel({ gpsPos, gpsSpeed }: Props) {
  const { routePath, to, setNavActive, rerouting } = useStore()
  const watchRef = useRef<number | null>(null)

  useEffect(() => () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current) }, [])

  if (!routePath || routePath.length < 2 || !gpsPos) return null

  const progressIdx = findProgress(gpsPos, routePath)
  const remaining = remainingDist(progressIdx, routePath)
  const isArrived = remaining < 30

  const speedKmh = gpsSpeed !== null && gpsSpeed > 0.5 ? Math.round(gpsSpeed * 3.6) : 0
  const etaMin = gpsSpeed && gpsSpeed > 0.5 ? Math.round(remaining / (gpsSpeed * 60)) : null

  // Время прибытия
  const arrivalTime = etaMin !== null ? (() => {
    const d = new Date(Date.now() + etaMin * 60000)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  })() : null

  // Поворот
  const nextTurn = findNextTurn(progressIdx, routePath)
  const turnInfo = nextTurn ? getTurnInfo(nextTurn.angle) : { icon: <ArrowUp size={32} />, text: 'Прямо', color: t.accent }
  const distToTurn = nextTurn ? nextTurn.dist : remaining

  // Следующий маневр после поворота
  const turnAfter = nextTurn ? findTurnAfter(nextTurn.idx, routePath) : null

  // Прибыли
  if (isArrived) {
    return (
      <>
        {/* Верхняя карточка */}
        <div style={topCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ ...turnIconBox, background: t.success }}>
              <MapPin size={32} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: t.text.primary }}>Прибыли</div>
              {to && <div style={{ fontSize: 13, color: t.text.secondary }}>{to.name}</div>}
            </div>
          </div>
        </div>
        {/* Нижняя панель */}
        <div style={bottomBarStyle}>
          <button onClick={() => setNavActive(false)} aria-label="Завершить навигацию" style={stopBtnFullStyle}>
            <X size={18} /> Завершить
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Верхняя карточка — текущий маневр */}
      <div style={topCardStyle}>
        {/* Пересчёт */}
        {rerouting && (
          <div style={{
            background: t.bg.elevated, borderRadius: 8, padding: '6px 12px',
            fontSize: 12, color: t.accent, textAlign: 'center', marginBottom: 8,
            animation: 'pulse 1s infinite',
          }}>
            Пересчёт маршрута...
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Иконка поворота */}
          <div style={{ ...turnIconBox, background: turnInfo.color === t.accent ? t.accentBlue : turnInfo.color }}>
            {turnInfo.icon}
          </div>

          {/* Расстояние до поворота */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {formatDistShort(distToTurn)}
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: t.text.secondary }}>
                {formatDistUnit(distToTurn)}
              </span>
            </div>
            {/* "Then" — следующий маневр */}
            {turnAfter && (
              <div style={{ fontSize: 13, color: t.text.muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                Затем {getSmallTurnIcon(turnAfter.angle)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Кружок скорости — справа сверху */}
      <div style={speedCircleStyle}>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
          {speedKmh}
        </div>
      </div>

      {/* Нижняя панель — время, прибытие, расстояние, стоп */}
      <div style={bottomBarStyle}>
        <div style={bottomStatStyle}>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
            {etaMin !== null ? etaMin : '--'}
          </div>
          <div style={{ fontSize: 11, color: t.text.muted }}>мин</div>
        </div>

        <div style={bottomDivider} />

        <div style={bottomStatStyle}>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
            {arrivalTime || '--:--'}
          </div>
          <div style={{ fontSize: 11, color: t.text.muted }}>прибытие</div>
        </div>

        <div style={bottomDivider} />

        <div style={bottomStatStyle}>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
            {(remaining / 1000).toFixed(1)}
          </div>
          <div style={{ fontSize: 11, color: t.text.muted }}>км</div>
        </div>

        <div style={bottomDivider} />

        <button onClick={() => setNavActive(false)} aria-label="Остановить навигацию" style={stopBtnStyle}>
          <X size={20} />
        </button>
      </div>

      {/* Пункт назначения — над нижней панелью */}
      {to && (
        <div style={destinationStyle}>
          <Navigation size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {to.name}
          </span>
        </div>
      )}
    </>
  )
}

// === Стили ===

const topCardStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(12px + env(safe-area-inset-top))',
  left: 12,
  right: 80, // место для спидометра
  background: t.bg.base,
  borderRadius: 16,
  padding: '12px 16px',
  zIndex: 1001,
  boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
}

const turnIconBox: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  flexShrink: 0,
}

const speedCircleStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(12px + env(safe-area-inset-top))',
  right: 12,
  width: 60,
  height: 60,
  borderRadius: '50%',
  background: t.bg.base,
  border: `3px solid ${t.text.muted}`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1001,
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
}

const bottomBarStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  background: t.bg.base,
  borderTop: `1px solid ${t.border.default}`,
  display: 'flex',
  alignItems: 'center',
  padding: '8px 16px calc(8px + env(safe-area-inset-bottom))',
  zIndex: 1001,
  gap: 0,
}

const bottomStatStyle: React.CSSProperties = {
  flex: 1,
  textAlign: 'center',
}

const bottomDivider: React.CSSProperties = {
  width: 1,
  height: 32,
  background: t.border.default,
  flexShrink: 0,
}

const stopBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  background: t.errorBg,
  color: t.errorText,
  border: `1px solid ${t.errorBorder}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  touchAction: 'manipulation',
  flexShrink: 0,
  marginLeft: 8,
}

const stopBtnFullStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  fontSize: 15,
  fontWeight: 600,
  background: t.errorBg,
  color: t.errorText,
  border: `1px solid ${t.errorBorder}`,
  borderRadius: 10,
  cursor: 'pointer',
  touchAction: 'manipulation',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}

const destinationStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(52px + env(safe-area-inset-bottom))',
  left: 12,
  right: 12,
  background: t.bg.surface,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  color: t.text.muted,
  zIndex: 1001,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
}
