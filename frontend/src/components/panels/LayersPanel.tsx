import { useState } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { useStore } from '../../store/useStore'
import type { WellType } from '../../store/useStore'
import { haversine } from '../../utils/distance'

const SUBMODES = [
  { key: 'chain'   as const, icon: '⛓', label: 'Цепочка',     hint: 'Клик на пустое место = новый узел. Клик на существующий узел = продолжить цепочку оттуда' },
  { key: 'segment' as const, icon: '📏', label: 'Отрезок',     hint: 'Клик на пустое место или существующий узел = начало. ② Клик = конец → узлы через N метров' },
  { key: 'add'     as const, icon: '➕', label: 'Узел',        hint: 'Клик на карте — добавить один узел' },
  { key: 'move'    as const, icon: '✋', label: 'Переместить', hint: '① Клик на узле → ② Клик на новом месте' },
  { key: 'addedge' as const, icon: '🔗', label: 'Ребро',       hint: '① Клик на 1-м узле → ② Клик на 2-м узле' },
  { key: 'del'     as const, icon: '🗑', label: 'Уд.узел',     hint: 'Клик на узле — удалить его и все рёбра' },
  { key: 'deledge' as const, icon: '✂️', label: 'Уд.ребро',   hint: 'Клик на линии — удалить эту связь' },
]

const SEGMENT_STEPS = [
  { value: 50,  label: '50 м' },
  { value: 100, label: '100 м' },
  { value: 200, label: '200 м' },
  { value: 500, label: '500 м' },
]

// Стиль кнопки — минимум 44px для мобильного
const btnStyle = (active: boolean, colors: { active: string; border: string }): React.CSSProperties => ({
  padding: '10px 4px', fontSize: 12, minHeight: 44,
  background: active ? colors.active : '#1e293b',
  color: active ? '#fff' : '#94a3b8',
  border: '1px solid ' + (active ? colors.border : '#334155'),
  borderRadius: 6, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  touchAction: 'manipulation' as const,
})

function EditorTools() {
  const { editSubmode, setEditSubmode, selectedNodeIdx, segmentStep, setSegmentStep } = useStore()

  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [saveError, setSaveError] = useState('')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  // Сохранить граф в Firestore (коллекция "graph", документ "current")
  // Firestore не поддерживает вложенные массивы — конвертируем edges в объекты
  const saveToCloud = async () => {
    const data = (window as any).__KALAMKAS_GRAPH
    if (!data) { setSaveError('Граф не загружен'); return }

    setSaving(true)
    setSaveStatus('idle')
    setSaveError('')
    try {
      await setDoc(doc(db, 'graph', 'current'), {
        nodes: data.nodes,
        edges: data.edges.map((e: [number, number, number]) => ({ from: e[0], to: e[1], dist: e[2] })),
        updatedAt: new Date().toISOString(),
      })
      setSaveStatus('ok')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (e: any) {
      setSaveError('Ошибка: ' + e.message)
      setSaveStatus('err')
    } finally {
      setSaving(false)
    }
  }

  const exportGraph = () => {
    const data = (window as any).__KALAMKAS_GRAPH
    if (!data) { setSaveError('Граф не загружен'); return }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `graph_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Очистить весь граф (без перезагрузки страницы)
  const clearGraph = () => {
    ;(window as any).__SAVE_GRAPH?.({ nodes: [], edges: [] })
  }

  // Импорт дорог из OpenStreetMap — узел каждые 25м вдоль каждой дороги
  const importFromOSM = async () => {
    setImporting(true)
    setImportMsg('📡 Загружаю дороги из OpenStreetMap...')
    try {
      // Уточнённый bbox только месторождения Қаламқас
      const query = `[out:json][timeout:90];
way["highway"](45.30,51.78,45.45,52.10);
out geom;`

      // Несколько зеркал Overpass — пробуем по очереди
      const MIRRORS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      ]

      let data: any = null
      for (const mirror of MIRRORS) {
        setImportMsg(`📡 Пробую ${new URL(mirror).hostname}...`)
        try {
          const resp = await fetch(mirror, {
            method: 'POST',
            body: query,
            signal: AbortSignal.timeout(50000),
          })
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          data = await resp.json()
          break
        } catch {
          // Пробуем следующее зеркало
        }
      }
      if (!data) throw new Error('Все серверы недоступны, попробуйте позже')

      // Строим граф с нуля — без старых узлов
      const nodes: { lat: number; lon: number; type: string }[] = []
      const edges: [number, number, number][] = []

      const STEP_M = 25          // узел каждые 25 метров
      const MERGE_M = 0.00015    // ~15м — порог слияния узлов в одну точку

      // Найти ближайший узел в радиусе MERGE_M или добавить новый
      const findOrAdd = (lat: number, lon: number): number => {
        for (let i = 0; i < nodes.length; i++) {
          if (Math.abs(nodes[i].lat - lat) < MERGE_M && Math.abs(nodes[i].lon - lon) < MERGE_M)
            return i
        }
        nodes.push({ lat, lon, type: 'road' })
        return nodes.length - 1
      }

      // Добавить ребро если его ещё нет
      const addEdge = (a: number, b: number) => {
        if (a === b) return
        if (edges.some(([f, t]) => (f === a && t === b) || (f === b && t === a))) return
        const na = nodes[a], nb = nodes[b]
        const dist = Math.round(haversine(na.lat, na.lon, nb.lat, nb.lon))
        edges.push([a, b, dist])
      }

      let wayCount = 0
      for (const way of data.elements) {
        if (way.type !== 'way' || !way.geometry || way.geometry.length < 2) continue
        wayCount++

        // Обрабатываем каждый отрезок OSM пути
        for (let i = 0; i < way.geometry.length - 1; i++) {
          const p1 = way.geometry[i]
          const p2 = way.geometry[i + 1]
          const segDist = haversine(p1.lat, p1.lon, p2.lat, p2.lon)

          // Расставить узлы каждые STEP_M метров вдоль отрезка
          const count = Math.max(1, Math.ceil(segDist / STEP_M))
          let prevIdx = findOrAdd(
            parseFloat(p1.lat.toFixed(6)),
            parseFloat(p1.lon.toFixed(6))
          )

          for (let j = 1; j <= count; j++) {
            const t = j / count
            const lat = parseFloat((p1.lat + t * (p2.lat - p1.lat)).toFixed(6))
            const lon = parseFloat((p1.lon + t * (p2.lon - p1.lon)).toFixed(6))
            const currIdx = findOrAdd(lat, lon)
            addEdge(prevIdx, currIdx)
            prevIdx = currIdx
          }
        }
      }

      ;(window as any).__SAVE_GRAPH?.({ nodes, edges })
      setImportMsg(`✅ Готово: ${nodes.length} узлов, ${edges.length} рёбер (${wayCount} дорог OSM)`)
      setTimeout(() => setImportMsg(''), 8000)
    } catch (e: any) {
      setImportMsg('❌ Ошибка: ' + e.message)
      setTimeout(() => setImportMsg(''), 5000)
    } finally {
      setImporting(false)
    }
  }

  const activeHint = SUBMODES.find(s => s.key === editSubmode)?.hint
  const needsNodeSelect = editSubmode === 'move' || editSubmode === 'addedge'

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>
        Инструменты
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {SUBMODES.map(s => (
          <button
            key={s.key}
            onClick={() => setEditSubmode(s.key)}
            title={s.hint}
            style={btnStyle(editSubmode === s.key, { active: '#4f46e5', border: '#6366f1' })}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {activeHint && (
        <div style={{
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: 6, padding: '6px 8px',
          fontSize: 11, color: '#94a3b8', lineHeight: 1.4
        }}>
          💡 {activeHint}
        </div>
      )}

      {editSubmode === 'chain' && (
        <button
          onClick={() => setEditSubmode('chain')}
          style={{
            padding: '10px 8px', fontSize: 12, fontWeight: 600, minHeight: 44,
            background: '#7c2d12', color: '#fdba74',
            border: '1px solid #9a3412', borderRadius: 6, cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          ⏹ Начать новую цепочку
        </button>
      )}

      {editSubmode === 'segment' && (
        <div>
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>Шаг между узлами:</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {SEGMENT_STEPS.map(s => (
              <button
                key={s.value}
                onClick={() => setSegmentStep(s.value)}
                style={btnStyle(segmentStep === s.value, { active: '#0369a1', border: '#0ea5e9' })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {needsNodeSelect && (
        <div style={{
          background: selectedNodeIdx !== null ? '#14532d' : '#1c1917',
          border: '1px solid ' + (selectedNodeIdx !== null ? '#166534' : '#44403c'),
          borderRadius: 6, padding: '6px 8px',
          fontSize: 11, color: selectedNodeIdx !== null ? '#86efac' : '#78716c',
          textAlign: 'center'
        }}>
          {selectedNodeIdx !== null
            ? `✅ Узел #${selectedNodeIdx} выбран — кликни ${editSubmode === 'move' ? 'на новое место' : 'на второй узел'}`
            : `👆 Кликни на узел (фиолетовый кружок)`
          }
        </div>
      )}

      {/* Очистить граф + Импорт OSM */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={clearGraph}
          disabled={importing}
          style={{
            flex: '0 0 auto', padding: '10px 8px', fontSize: 12, fontWeight: 600, minHeight: 44,
            background: '#450a0a', color: '#fca5a5',
            border: '1px solid #7f1d1d',
            borderRadius: 6, cursor: 'pointer',
            touchAction: 'manipulation',
          }}
          title="Удалить все узлы и рёбра"
        >
          🗑 Очистить
        </button>
        <button
          onClick={importFromOSM}
          disabled={importing}
          style={{
            flex: 1, padding: '10px', fontSize: 12, fontWeight: 600, minHeight: 44,
            background: importing ? '#1c1917' : '#14532d',
            color: importing ? '#78716c' : '#6ee7b7',
            border: '1px solid ' + (importing ? '#44403c' : '#065f46'),
            borderRadius: 6, cursor: importing ? 'wait' : 'pointer',
            touchAction: 'manipulation',
          }}
        >
          {importing ? '⏳ Загружаю из OSM...' : '🗺 Импорт дорог OSM (25м)'}
        </button>
      </div>

      {importMsg && (
        <div style={{
          background: importMsg.startsWith('✅') ? '#14532d' : importMsg.startsWith('❌') ? '#450a0a' : '#1e3a5f',
          border: '1px solid ' + (importMsg.startsWith('✅') ? '#166534' : importMsg.startsWith('❌') ? '#7f1d1d' : '#1e40af'),
          borderRadius: 6, padding: '8px 10px', fontSize: 11, color: importMsg.startsWith('✅') ? '#86efac' : importMsg.startsWith('❌') ? '#fca5a5' : '#93c5fd',
        }}>
          {importMsg}
        </div>
      )}

      {/* Сообщение об ошибке */}
      {saveError && (
        <div style={{
          background: '#450a0a', border: '1px solid #7f1d1d',
          borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#fca5a5'
        }}>
          ❌ {saveError}
        </div>
      )}

      <button
        onClick={saveToCloud}
        disabled={saving}
        style={{
          width: '100%', padding: '10px', fontSize: 12, fontWeight: 600, minHeight: 44,
          background: saveStatus === 'ok' ? '#14532d' : saving ? '#1e3a5f' : '#1d4ed8',
          color: saveStatus === 'ok' ? '#86efac' : '#fff',
          border: '1px solid ' + (saveStatus === 'ok' ? '#166534' : '#2563eb'),
          borderRadius: 6, cursor: saving ? 'wait' : 'pointer',
          transition: 'all 0.2s', touchAction: 'manipulation',
        }}
      >
        {saving ? '⏳ Сохраняю...' : saveStatus === 'ok' ? '✅ Сохранено в Firebase' : '☁️ Сохранить на все устройства'}
      </button>

      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={exportGraph}
          style={{
            flex: 1, padding: '10px', fontSize: 12, minHeight: 44,
            background: '#064e3b', color: '#6ee7b7',
            border: '1px solid #065f46', borderRadius: 6, cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          💾 Экспорт JSON
        </button>

        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            style={{
              flex: 1, padding: '10px', fontSize: 12, minHeight: 44,
              background: '#450a0a', color: '#fca5a5',
              border: '1px solid #7f1d1d', borderRadius: 6, cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            🔄 Сбросить
          </button>
        ) : (
          <div style={{ flex: 1, display: 'flex', gap: 4 }}>
            <button
              onClick={() => { localStorage.removeItem('kalamkas_graph'); window.location.reload() }}
              style={{
                flex: 1, padding: '10px', fontSize: 12, minHeight: 44,
                background: '#dc2626', color: '#fff',
                border: '1px solid #ef4444', borderRadius: 6, cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              ✓ Да
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              style={{
                flex: 1, padding: '10px', fontSize: 12, minHeight: 44,
                background: '#1e293b', color: '#94a3b8',
                border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              ✕ Нет
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const WELL_TYPES: { key: WellType; label: string; color: string; count: number }[] = [
  { key: 'dob.',   label: 'Добывающие',     color: '#22c55e', count: 2201 },
  { key: 'nagn.',  label: 'Нагнетательные', color: '#3b82f6', count: 784 },
  { key: 'likv.',  label: 'Ликвидированные',color: '#6b7280', count: 139 },
  { key: 'water',  label: 'Водозаборные',   color: '#06b6d4', count: 68 },
  { key: 'gaz',    label: 'Газовые',        color: '#f59e0b', count: 59 },
  { key: 'kontr.', label: 'Контрольные',    color: '#8b5cf6', count: 42 },
  { key: 'razv.',  label: 'Разведочные',    color: '#f97316', count: 15 },
]

const BASE_LAYERS = [
  { key: 'osm'  as const, label: '🗺 Карта' },
  { key: 'sat'  as const, label: '🛰 Спутник' },
  { key: 'dark' as const, label: '🌙 Тёмная' },
]

export default function LayersPanel() {
  const { layers, toggleLayer, activeWellTypes, toggleWellType, basemap, setBasemap, editMode, setEditMode } = useStore()

  // Firebase Auth: форма входа
  const [showLoginInput, setShowLoginInput] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const handleEditMode = () => {
    if (!editMode) {
      if (auth.currentUser) {
        setEditMode(true)
      } else {
        setShowLoginInput(true)
        setLoginError('')
      }
    } else {
      setEditMode(false)
      signOut(auth)
    }
  }

  const handleLoginSubmit = async () => {
    if (!loginEmail.trim() || !loginPassword) return
    setLoginLoading(true)
    setLoginError('')
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword)
      setEditMode(true)
      setShowLoginInput(false)
      setLoginEmail('')
      setLoginPassword('')
    } catch {
      setLoginError('Неверный email или пароль')
      setLoginPassword('')
    } finally {
      setLoginLoading(false)
    }
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Базовая карта */}
      <div>
        <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Подложка
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {BASE_LAYERS.map(b => (
            <button
              key={b.key}
              onClick={() => setBasemap(b.key)}
              style={{
                flex: 1, padding: '10px 4px', fontSize: 12, minHeight: 44,
                background: basemap === b.key ? '#1d4ed8' : '#1e293b',
                color: basemap === b.key ? '#fff' : '#94a3b8',
                border: '1px solid ' + (basemap === b.key ? '#3b82f6' : '#334155'),
                borderRadius: 6, cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Объектные слои */}
      <div>
        <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Слои
        </div>
        {[
          { key: 'roads', label: 'Дороги',    icon: '🛣' },
          { key: 'bkns',  label: 'БКНС (11)', icon: '🔴' },
          { key: 'gu',    label: 'ГУ (73)',    icon: '🟡' },
          { key: 'wells', label: 'Скважины',   icon: '⚫' },
        ].map(l => (
          <label key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', cursor: 'pointer', fontSize: 13, touchAction: 'manipulation' }}>
            <input type="checkbox" checked={layers[l.key] ?? false} onChange={() => toggleLayer(l.key)}
              style={{ width: 18, height: 18 }} />
            <span>{l.icon} {l.label}</span>
          </label>
        ))}
      </div>

      {/* Типы скважин */}
      {layers.wells && (
        <div>
          <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Типы скважин
          </div>
          {WELL_TYPES.map(({ key, label, color, count }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer', fontSize: 12, touchAction: 'manipulation' }}>
              <input type="checkbox" checked={activeWellTypes.has(key)} onChange={() => toggleWellType(key)}
                style={{ width: 18, height: 18 }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{label}</span>
              <span style={{ fontSize: 10, color: '#475569' }}>{count}</span>
            </label>
          ))}
        </div>
      )}

      {/* Редактор */}
      <div style={{ paddingTop: 8, borderTop: '1px solid #1e293b' }}>
        <button
          onClick={handleEditMode}
          style={{
            width: '100%', padding: '10px', fontSize: 12, minHeight: 44,
            background: editMode ? '#7c3aed' : '#1e293b',
            color: editMode ? '#fff' : '#94a3b8',
            border: '1px solid ' + (editMode ? '#7c3aed' : '#334155'),
            borderRadius: 6, cursor: 'pointer', touchAction: 'manipulation',
          }}
        >
          {editMode ? '✏️ Редактор: ВКЛ' : '🔒 Редактор графа'}
        </button>

        {/* Firebase Auth: форма входа */}
        {showLoginInput && (
          <div style={{
            marginTop: 8, background: '#1e293b', border: '1px solid #334155',
            borderRadius: 8, padding: 12,
            display: 'flex', flexDirection: 'column', gap: 8
          }}>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Вход в редактор графа:</div>
            <input
              type="email"
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              placeholder="Email"
              autoFocus
              style={{
                padding: '10px 8px', fontSize: 16,
                background: '#0f172a', color: '#e2e8f0',
                border: '1px solid #334155', borderRadius: 6, outline: 'none',
              }}
            />
            <input
              type="password"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLoginSubmit()}
              placeholder="Пароль"
              style={{
                padding: '10px 8px', fontSize: 16,
                background: '#0f172a', color: '#e2e8f0',
                border: '1px solid ' + (loginError ? '#ef4444' : '#334155'),
                borderRadius: 6, outline: 'none',
              }}
            />
            {loginError && (
              <div style={{ fontSize: 12, color: '#ef4444' }}>❌ {loginError}</div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleLoginSubmit}
                disabled={loginLoading}
                style={{
                  flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, minHeight: 44,
                  background: loginLoading ? '#1e3a5f' : '#1d4ed8', color: '#fff',
                  border: 'none', borderRadius: 6,
                  cursor: loginLoading ? 'wait' : 'pointer', touchAction: 'manipulation',
                }}
              >
                {loginLoading ? '⏳ Вход...' : 'Войти'}
              </button>
              <button
                onClick={() => { setShowLoginInput(false); setLoginEmail(''); setLoginPassword(''); setLoginError('') }}
                style={{
                  padding: '10px 14px', fontSize: 13, minHeight: 44,
                  background: '#1e293b', color: '#94a3b8',
                  border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {editMode && <EditorTools />}
      </div>
    </div>
  )
}
