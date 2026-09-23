import { test } from 'node:test'
import assert from 'node:assert/strict'
import { turnKind, speakDistance, nextAnnouncement, turnKey, type NavSnapshot } from '../src/utils/navVoice.ts'

// Прогоняет последовательность снимков навигации и возвращает всё, что было бы сказано
function drive(snaps: NavSnapshot[]): string[] {
  const spoken = new Set<string>()
  const said: string[] = []
  for (const s of snaps) {
    const a = nextAnnouncement(s, spoken)
    if (a) {
      spoken.add(a.id)
      said.push(a.text)
    }
  }
  return said
}

function turn(dist: number, angle = 90, after: { angle: number; dist: number } | null = null, key = 'T1'): NavSnapshot {
  return {
    turn: { key, angle, dist, afterAngle: after?.angle ?? null, afterDist: after?.dist ?? null },
    remaining: dist + 1000,
    arrived: false,
  }
}

function toEnd(remaining: number, arrived = false): NavSnapshot {
  return { turn: null, remaining, arrived }
}

test('turnKind: те же границы, что у значков поворота на панели', () => {
  const cases: [number, string][] = [
    [0, 'straight'], [30, 'straight'], [-30, 'straight'],
    [31, 'slight-right'], [70, 'slight-right'], [71, 'right'], [120, 'right'], [121, 'uturn'],
    [-31, 'slight-left'], [-70, 'slight-left'], [-71, 'left'], [-120, 'left'], [-121, 'uturn'],
  ]
  for (const [angle, kind] of cases) assert.equal(turnKind(angle), kind, `угол ${angle}`)
})

test('speakDistance: округление для речи и падежи', () => {
  const cases: [number, string][] = [
    [60, '60 метров'], [120, '100 метров'], [195, '200 метров'], [480, '500 метров'],
    [990, '1 километр'], [1000, '1 километр'], [1200, '1,2 километра'], [2000, '2 километра'],
    [5000, '5 километров'], [13_700, '14 километров'], [21_000, '21 километр'], [22_000, '22 километра'],
  ]
  for (const [m, text] of cases) assert.equal(speakDistance(m), text, `${m} м`)
})

test('подъезд к повороту: прямо → за 500 м → за 200 м → «поверните»', () => {
  const said = drive([1500, 1200, 900, 600, 495, 400, 310, 290, 195, 120, 60, 25, 5].map(d => turn(d)))
  assert.deepEqual(said, [
    'Прямо 1,5 километра',
    'Через 500 метров поверните направо',
    'Через 200 метров поверните направо',
    'Поверните направо',
  ])
})

test('если навигацию включили уже близко к повороту, дальние подсказки не звучат', () => {
  assert.deepEqual(drive([180, 90, 20].map(d => turn(d))), [
    'Через 200 метров поверните направо',
    'Поверните направо',
  ])
})

test('скачок GPS назад не повторяет уже пройденную подсказку', () => {
  assert.deepEqual(drive([195, 320, 480, 190].map(d => turn(d))), ['Через 200 метров поверните направо'])
})

test('одна и та же подсказка не повторяется на каждом обновлении GPS', () => {
  assert.deepEqual(drive([450, 450, 440, 430].map(d => turn(d))), ['Через 450 метров поверните направо'])
})

test('два поворота подряд: «затем» только если второй ближе 100 м', () => {
  const close = { angle: -90, dist: 60 }
  assert.deepEqual(drive([turn(180, 90, close), turn(20, 90, close)]), [
    'Через 200 метров поверните направо, затем налево',
    'Поверните направо, затем налево',
  ])
  assert.deepEqual(drive([turn(450, 90, close)]), ['Через 450 метров поверните направо'])
  assert.deepEqual(drive([turn(150, 90, { angle: -90, dist: 150 })]), ['Через 150 метров поверните направо'])
})

test('плавные повороты и разворот', () => {
  assert.deepEqual(drive([turn(450, 45)]), ['Через 450 метров держитесь правее'])
  assert.deepEqual(drive([turn(150, -50)]), ['Через 150 метров держитесь левее'])
  assert.deepEqual(drive([turn(100, 170)]), ['Через 100 метров развернитесь'])
  assert.deepEqual(drive([turn(20, -100)]), ['Поверните налево'])
})

test('следующий поворот получает свои подсказки', () => {
  assert.deepEqual(drive([turn(20, 90, null, 'T1'), turn(480, -90, null, 'T2')]), [
    'Поверните направо',
    'Через 500 метров поверните налево',
  ])
})

test('после последнего поворота — к месту назначения и «Вы прибыли» один раз', () => {
  assert.deepEqual(drive([toEnd(2300), toEnd(1800), toEnd(450), toEnd(200), toEnd(20, true), toEnd(10, true)]), [
    'Прямо 2,3 километра до места назначения',
    'Через 450 метров место назначения',
    'Вы прибыли',
  ])
})

test('turnKey: одна и та же вершина графа даёт один ключ и после перестроения маршрута', () => {
  assert.equal(turnKey([45.3700012, 51.9000049]), turnKey([45.3700014, 51.9000046]))
  assert.notEqual(turnKey([45.37, 51.9]), turnKey([45.3705, 51.9]))
})
