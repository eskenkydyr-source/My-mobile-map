/**
 * Голосовые подсказки навигации, как в 2ГИС: что и когда сказать.
 * Только логика, без браузерных API — сама озвучка в utils/speech.ts.
 *
 * Подсказки на подъезде к повороту (зоны не стыкуются, чтобы округлённые
 * расстояния не звучали дважды подряд, например «200 м» на 210 м и снова на 200 м):
 *   дальше 1 км      → «Прямо 1,5 километра»
 *   500…300 м        → «Через 500 метров поверните направо»
 *   200…30 м         → «Через 200 метров поверните направо[, затем налево]»
 *   ближе 30 м       → «Поверните направо[, затем налево]»
 */

export type TurnKind = 'straight' | 'slight-right' | 'right' | 'slight-left' | 'left' | 'uturn'

export interface NavSnapshot {
  // Ближайший поворот; null — поворотов до места назначения больше нет
  turn: {
    key: string                // вершина поворота, см. turnKey()
    angle: number
    dist: number               // метров до поворота
    afterAngle: number | null  // следующий манёвр после этого поворота
    afterDist: number | null   // метров между поворотами
  } | null
  remaining: number            // метров до места назначения
  arrived: boolean
}

export interface Announcement {
  id: string   // по нему не повторяем уже сказанное
  text: string
}

const STRAIGHT_FROM_M = 1000
const FAR_M = 500
const FAR_UNTIL_M = 300
const NEAR_M = 200
const NOW_M = 30
const THEN_MAX_M = 100 // «затем …», если второй поворот ближе этого

const STAGES = ['straight', 'far', 'near', 'now'] as const
type Stage = typeof STAGES[number]

export function turnKind(angle: number): TurnKind {
  if (Math.abs(angle) <= 30) return 'straight'
  if (angle > 120 || angle < -120) return 'uturn'
  if (angle > 70) return 'right'
  if (angle > 30) return 'slight-right'
  if (angle < -70) return 'left'
  return 'slight-left'
}

// Вершина графа как идентификатор поворота: после перестроения маршрута
// поворот в той же вершине не озвучивается заново (5 знаков ≈ 1 м)
export function turnKey(ll: [number, number]): string {
  return `${ll[0].toFixed(5)},${ll[1].toFixed(5)}`
}

const ACTION: Record<Exclude<TurnKind, 'straight'>, string> = {
  'slight-right': 'держитесь правее',
  'right': 'поверните направо',
  'slight-left': 'держитесь левее',
  'left': 'поверните налево',
  'uturn': 'развернитесь',
}

const THEN: Record<Exclude<TurnKind, 'straight'>, string> = {
  'slight-right': 'правее',
  'right': 'направо',
  'slight-left': 'левее',
  'left': 'налево',
  'uturn': 'разворот',
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

// Расстояние так, как его удобно слышать: 60 метров, 450 метров, 1,2 километра
export function speakDistance(m: number): string {
  const meters = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50
  if (meters < 1000) return `${meters} ${plural(meters, 'метр', 'метра', 'метров')}`

  const km = m < 10_000 ? Math.round(m / 100) / 10 : Math.round(m / 1000)
  if (!Number.isInteger(km)) return `${String(km).replace('.', ',')} километра`
  return `${km} ${plural(km, 'километр', 'километра', 'километров')}`
}

function stageFor(dist: number): Stage | null {
  if (dist <= NOW_M) return 'now'
  if (dist <= NEAR_M) return 'near'
  if (dist <= FAR_M && dist > FAR_UNTIL_M) return 'far'
  if (dist > STRAIGHT_FROM_M) return 'straight'
  return null
}

// Стадия пройдена, если сказана она сама или любая более поздняя — защита от скачков GPS назад
function passed(key: string, stage: Stage, spoken: ReadonlySet<string>): boolean {
  return STAGES.slice(STAGES.indexOf(stage)).some(s => spoken.has(`${key}:${s}`))
}

export function nextAnnouncement(s: NavSnapshot, spoken: ReadonlySet<string>): Announcement | null {
  if (s.arrived) return spoken.has('arrive') ? null : { id: 'arrive', text: 'Вы прибыли' }

  if (!s.turn) {
    const stage = s.remaining > STRAIGHT_FROM_M ? 'straight'
      : s.remaining <= FAR_M && s.remaining > FAR_UNTIL_M ? 'far'
      : null
    if (!stage || passed('end', stage, spoken)) return null
    const text = stage === 'straight'
      ? `Прямо ${speakDistance(s.remaining)} до места назначения`
      : `Через ${speakDistance(s.remaining)} место назначения`
    return { id: `end:${stage}`, text }
  }

  const { key, angle, dist, afterAngle, afterDist } = s.turn
  const kind = turnKind(angle)
  const stage = stageFor(dist)
  if (kind === 'straight' || !stage || passed(key, stage, spoken)) return null

  if (stage === 'straight') return { id: `${key}:straight`, text: `Прямо ${speakDistance(dist)}` }

  const action = ACTION[kind]
  let text = stage === 'now'
    ? action[0].toUpperCase() + action.slice(1)
    : `Через ${speakDistance(dist)} ${action}`

  const thenKind = afterAngle !== null && afterDist !== null && afterDist <= THEN_MAX_M ? turnKind(afterAngle) : 'straight'
  if (stage !== 'far' && thenKind !== 'straight') text += `, затем ${THEN[thenKind]}`

  return { id: `${key}:${stage}`, text }
}
