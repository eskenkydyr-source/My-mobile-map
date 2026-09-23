import { test } from 'node:test'
import assert from 'node:assert/strict'
import { locateOnRoute, remainingFrom, nextTurn, turnAfter, type LatLon } from '../src/utils/routeProgress.ts'

// Точки задаём в метрах (восток, север) от начала координат рядом с Қаламқас
const LAT0 = 45.37
const LON0 = 51.9
const M_PER_DEG = 111_195
const pt = (east: number, north: number): LatLon =>
  [LAT0 + north / M_PER_DEG, LON0 + east / (M_PER_DEG * Math.cos(LAT0 * Math.PI / 180))]

// 600 м на север (вершина без поворота посередине), направо 400 м на восток, налево 400 м на север
const route: LatLon[] = [pt(0, 0), pt(0, 300), pt(0, 600), pt(400, 600), pt(400, 1000)]

function near(actual: number, expected: number, tol = 3) {
  assert.ok(Math.abs(actual - expected) <= tol, `${actual.toFixed(1)} ≠ ${expected} ± ${tol}`)
}

test('на первом отрезке: следующий поворот — направо через 500 м, всего осталось 1300 м', () => {
  const p = locateOnRoute(pt(0, 100), route)
  assert.equal(p.seg, 0)
  near(p.toNext, 200)
  const turn = nextTurn(p, route)
  assert.ok(turn)
  assert.equal(turn.idx, 2)
  near(turn.angle, 90, 1)
  near(turn.dist, 500)
  near(remainingFrom(p, route), 1300)
})

test('поворот не пропадает раньше времени: за 120 м до него он всё ещё следующий', () => {
  // Ближайшая вершина здесь — сам поворот (120 м против 180 м до предыдущей),
  // но машина до него ещё не доехала
  const turn = nextTurn(locateOnRoute(pt(0, 480), route), route)
  assert.ok(turn)
  assert.equal(turn.idx, 2)
  near(turn.dist, 120)
})

test('погрешность GPS в сторону от дороги не сбивает отрезок', () => {
  const p = locateOnRoute(pt(8, 480), route)
  assert.equal(p.seg, 1)
  near(p.toNext, 120)
})

test('после поворота направо следующий — налево', () => {
  const turn = nextTurn(locateOnRoute(pt(100, 600), route), route)
  assert.ok(turn)
  assert.equal(turn.idx, 3)
  near(turn.angle, -90, 1)
  near(turn.dist, 300)
})

test('turnAfter: через 400 м после правого поворота идёт левый', () => {
  const first = nextTurn(locateOnRoute(pt(0, 100), route), route)
  assert.ok(first)
  const after = turnAfter(first, route)
  assert.ok(after)
  assert.equal(after.idx, 3)
  near(after.angle, -90, 1)
  near(after.dist, 400)
})

test('съезд с маршрута меряется до линии дороги, а не до вершин', () => {
  // Середина 300-метрового отрезка: до вершин по 150 м, но машина на дороге
  near(locateOnRoute(pt(0, 150), route).offRoute, 0, 1)
  near(locateOnRoute(pt(80, 150), route).offRoute, 80, 1)
})

test('в конце маршрута поворотов нет и ехать почти нечего', () => {
  const p = locateOnRoute(pt(400, 1000), route)
  assert.equal(nextTurn(p, route), null)
  near(remainingFrom(p, route), 0)
})
