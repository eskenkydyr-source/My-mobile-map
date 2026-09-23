/**
 * Где машина на маршруте и что впереди.
 *
 * Позицию считаем проекцией GPS-точки на отрезок маршрута, а не ближайшей вершиной:
 * вершины графа стоят через сотни метров, и «ближайшая вершина» переключалась
 * на поворот примерно на полпути к нему — поворот пропадал с панели раньше времени.
 */
// Расширение .ts — чтобы модуль загружался и в тестах (node --test)
import { haversine } from './distance.ts'

export type LatLon = [number, number]

export interface RouteProgress {
  seg: number     // машина на отрезке path[seg] → path[seg + 1]
  toNext: number  // метров от машины до path[seg + 1]
  offRoute: number // метров от машины до линии маршрута
}

export interface Turn {
  idx: number     // вершина маршрута, в которой поворот
  angle: number   // градусы: > 0 направо, < 0 налево
  dist: number    // метров до поворота
}

const TURN_THRESHOLD_DEG = 30
const M_PER_DEG = 111_195 // метров в градусе широты (R = 6371 км)

function segLen(path: LatLon[], i: number): number {
  return haversine(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1])
}

function bearing(a: LatLon, b: LatLon): number {
  const φ1 = a[0] * Math.PI / 180
  const φ2 = b[0] * Math.PI / 180
  const Δλ = (b[1] - a[1]) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export function locateOnRoute(pos: LatLon, path: LatLon[]): RouteProgress {
  let best: RouteProgress = { seg: 0, toNext: 0, offRoute: Infinity }
  for (let i = 0; i < path.length - 1; i++) {
    const [aLat, aLon] = path[i]
    const [bLat, bLon] = path[i + 1]
    // Плоская проекция вокруг начала отрезка, в метрах
    const k = Math.cos(aLat * Math.PI / 180) * M_PER_DEG
    const dx = (bLon - aLon) * k
    const dy = (bLat - aLat) * M_PER_DEG
    const px = (pos[1] - aLon) * k
    const py = (pos[0] - aLat) * M_PER_DEG
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 1 : Math.min(1, Math.max(0, (px * dx + py * dy) / len2))
    const off = Math.hypot(px - t * dx, py - t * dy)
    if (off < best.offRoute) best = { seg: i, toNext: (1 - t) * Math.sqrt(len2), offRoute: off }
  }
  return best
}

export function remainingFrom(p: RouteProgress, path: LatLon[]): number {
  let dist = p.toNext
  for (let i = p.seg + 1; i < path.length - 1; i++) dist += segLen(path, i)
  return dist
}

// Первый поворот в вершинах начиная с fromVertex; startDist — сколько метров до fromVertex
function scanTurns(fromVertex: number, startDist: number, path: LatLon[]): Turn | null {
  let dist = startDist
  for (let v = fromVertex; v < path.length - 1; v++) {
    if (v > fromVertex) dist += segLen(path, v - 1)
    let angle = bearing(path[v], path[v + 1]) - bearing(path[v - 1], path[v])
    if (angle > 180) angle -= 360
    if (angle < -180) angle += 360
    if (Math.abs(angle) > TURN_THRESHOLD_DEG) return { idx: v, angle, dist }
  }
  return null
}

export function nextTurn(p: RouteProgress, path: LatLon[]): Turn | null {
  return scanTurns(p.seg + 1, p.toNext, path)
}

// Следующий манёвр после поворота turn; dist — от вершины поворота
export function turnAfter(turn: Turn, path: LatLon[]): Turn | null {
  return turn.idx + 1 < path.length ? scanTurns(turn.idx + 1, segLen(path, turn.idx), path) : null
}
