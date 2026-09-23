import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navWaitStatus } from '../src/utils/navStatus.ts'

test('до первой точки GPS — «Ищем GPS…», это не ошибка', () => {
  const s = navWaitStatus(true, null)
  assert.equal(s.title, 'Ищем GPS…')
  assert.equal(s.problem, false)
})

test('GPS не ответил вовремя — телефон всё ещё ищет спутники', () => {
  const s = navWaitStatus(true, 3)
  assert.equal(s.title, 'Ищем GPS…')
  assert.equal(s.problem, false)
})

test('доступ к геолокации запрещён — говорим, что сделать', () => {
  const s = navWaitStatus(true, 1)
  assert.equal(s.title, 'Нет доступа к GPS')
  assert.equal(s.problem, true)
  assert.match(s.hint, /разрешите/i)
})

test('GPS выключен или недоступен', () => {
  const s = navWaitStatus(true, 2)
  assert.equal(s.title, 'GPS недоступен')
  assert.equal(s.problem, true)
})

test('маршрут пропал — это важнее состояния GPS', () => {
  const s = navWaitStatus(false, 1)
  assert.equal(s.title, 'Маршрут не найден')
  assert.equal(s.problem, true)
})
