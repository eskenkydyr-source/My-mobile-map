import { useEffect } from 'react'
import { X, Navigation, CornerUpRight, CornerUpLeft, ArrowUp, RotateCcw, MapPin, Crosshair, Volume2, VolumeX } from 'lucide-react'
import { theme as t } from '../theme'
import { useStore } from '../store/useStore'
import { locateOnRoute, remainingFrom, nextTurn as findNextTurn, turnAfter as findTurnAfter } from '../utils/routeProgress'
import type { LatLon } from '../utils/routeProgress'
import { turnKind, turnKey } from '../utils/navVoice'
import { speak, speechSupported, stopSpeaking, updateVoiceGuidance } from '../utils/speech'

interface TurnInfo {
  icon: React.ReactNode
  text: string
  color: string
}

// Границы поворотов общие с голосом (turnKind) — значок и фраза всегда совпадают
function getTurnInfo(angle: number): TurnInfo {
  switch (turnKind(angle)) {
    case 'slight-right': return { icon: <CornerUpRight size={32} />, text: 'Правее', color: t.accent }
    case 'right': return { icon: <CornerUpRight size={32} />, text: 'Направо', color: t.warning }
    case 'slight-left': return { icon: <CornerUpLeft size={32} />, text: 'Левее', color: t.accent }
    case 'left': return { icon: <CornerUpLeft size={32} />, text: 'Налево', color: t.warning }
    case 'uturn': return angle > 0
      ? { icon: <RotateCcw size={32} style={{ transform: 'scaleX(-1)' }} />, text: 'Разворот', color: t.error }
      : { icon: <RotateCcw size={32} />, text: 'Разворот', color: t.error }
    default: return { icon: <ArrowUp size={32} />, text: 'Прямо', color: t.accent }
  }
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
  const routePath = useStore(s => s.routePath)
  if (!routePath || routePath.length < 2 || !gpsPos) return null
  return <NavigationView gpsPos={gpsPos} gpsSpeed={gpsSpeed} routePath={routePath} />
}

function NavigationView({ gpsPos, gpsSpeed, routePath }: { gpsPos: LatLon; gpsSpeed: number | null; routePath: LatLon[] }) {
  const { to, setNavActive, rerouting, followGps, setFollowGps, setFlyTarget, voiceEnabled, setVoiceEnabled } = useStore()

  const progress = locateOnRoute(gpsPos, routePath)
  const remaining = remainingFrom(progress, routePath)
  const isArrived = remaining < 30

  const speedKmh = gpsSpeed !== null && gpsSpeed > 0.5 ? Math.round(gpsSpeed * 3.6) : 0
  const etaMin = gpsSpeed && gpsSpeed > 0.5 ? Math.round(remaining / (gpsSpeed * 60)) : null

  // Время прибытия
  const arrivalTime = etaMin !== null ? (() => {
    const d = new Date(Date.now() + etaMin * 60000)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  })() : null

  // Поворот
  const nextTurn = findNextTurn(progress, routePath)
  const turnInfo = nextTurn ? getTurnInfo(nextTurn.angle) : { icon: <ArrowUp size={32} />, text: 'Прямо', color: t.accent }
  const distToTurn = nextTurn ? nextTurn.dist : remaining

  // Следующий маневр после поворота
  const turnAfter = nextTurn ? findTurnAfter(nextTurn, routePath) : null

  // Голосовые подсказки: фраза звучит, когда машина въезжает в зону 1 км / 500 / 200 / 30 м
  const turnId = nextTurn ? turnKey(routePath[nextTurn.idx]) : null
  const turnAngle = nextTurn?.angle ?? null
  const turnDist = nextTurn?.dist ?? null
  const afterAngle = turnAfter?.angle ?? null
  const afterDist = turnAfter?.dist ?? null
  useEffect(() => {
    if (!voiceEnabled) return
    updateVoiceGuidance({
      turn: turnId !== null && turnAngle !== null && turnDist !== null
        ? { key: turnId, angle: turnAngle, dist: turnDist, afterAngle, afterDist }
        : null,
      remaining,
      arrived: isArrived,
    })
  }, [voiceEnabled, turnId, turnAngle, turnDist, afterAngle, afterDist, remaining, isArrived])

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

      {/* Кнопка рецентровки — появляется когда пользователь сдвинул карту */}
      {!followGps && (
        <button
          onClick={() => {
            setFollowGps(true)
            if (gpsPos) setFlyTarget(gpsPos)
          }}
          aria-label="Вернуться к моему местоположению"
          style={recenterBtnStyle}
        >
          <Crosshair size={22} />
        </button>
      )}

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

        {speechSupported() && (
          <button
            onClick={() => {
              if (voiceEnabled) stopSpeaking()
              else speak('Звук включён') // нажатие заодно разрешает звук в Safari
              setVoiceEnabled(!voiceEnabled)
            }}
            aria-label="Голосовые подсказки"
            aria-pressed={voiceEnabled}
            style={{ ...soundBtnStyle, color: voiceEnabled ? t.text.primary : t.text.muted }}
          >
            {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        )}

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

const soundBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  background: t.bg.surface,
  border: `1px solid ${t.border.default}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  touchAction: 'manipulation',
  flexShrink: 0,
  marginLeft: 8,
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

const recenterBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(80px + env(safe-area-inset-top))',
  right: 12,
  width: 48,
  height: 48,
  borderRadius: '50%',
  background: t.accentBlue,
  color: t.onColor,
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  zIndex: 1001,
  boxShadow: '0 4px 16px rgba(29,78,216,0.5)',
  touchAction: 'manipulation',
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
