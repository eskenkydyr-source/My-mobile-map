import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../store/useStore'
import LayersPanel from './panels/LayersPanel'
import RoutePanel from './panels/RoutePanel'
import ObjectPanel from './panels/ObjectPanel'

type Snap = 'peek' | 'half' | 'full'
const SNAPS: Snap[] = ['peek', 'half', 'full']
const SNAP_VALUES: Record<Snap, number> = { peek: 0.12, half: 0.50, full: 0.88 }

export default function BottomSheet() {
  const { activeTab, setActiveTab, selectedObject } = useStore()
  const [snap, setSnap] = useState<Snap>('peek')
  const [dragDy, setDragDy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startY = useRef(0)
  const startSnap = useRef<Snap>('peek')

  // Автоматически открыть когда выбран объект
  useEffect(() => {
    if (selectedObject && snap === 'peek') setSnap('half')
  }, [selectedObject])

  const heightVal = `calc(${SNAP_VALUES[snap] * 100}vh - ${dragging ? dragDy : 0}px)`

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    startSnap.current = snap
    setDragging(true)
    setDragDy(0)
  }, [snap])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging) return
    setDragDy(e.touches[0].clientY - startY.current)
  }, [dragging])

  const onTouchEnd = useCallback(() => {
    setDragging(false)
    const threshold = 60
    const idx = SNAPS.indexOf(startSnap.current)
    if (dragDy < -threshold) setSnap(SNAPS[Math.min(idx + 1, SNAPS.length - 1)])
    else if (dragDy > threshold) setSnap(SNAPS[Math.max(idx - 1, 0)])
    else setSnap(startSnap.current)
    setDragDy(0)
  }, [dragging, dragDy])

  const tabs = [
    { key: 'layers' as const, icon: '🗂', label: 'Слои' },
    { key: 'route'  as const, icon: '🗺', label: 'Маршрут' },
    { key: 'object' as const, icon: '📍', label: 'Объект' },
  ]

  return (
    <div
      className="bottom-sheet-wrap"
      style={{
        position: 'fixed',
        left: 0, right: 0, bottom: 0,
        height: heightVal,
        minHeight: 60,
        background: '#0f172a',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.6)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        transition: dragging ? 'none' : 'height 0.3s cubic-bezier(0.32,0.72,0,1)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Ручка для перетаскивания + вкладки */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '8px 0 0', flexShrink: 0,
          touchAction: 'none', userSelect: 'none', cursor: 'grab',
        }}
      >
        {/* Визуальная ручка */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: '#334155', marginBottom: 6,
        }} />

        {/* Вкладки */}
        <div style={{ display: 'flex', width: '100%', borderBottom: '1px solid #1e293b' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                if (snap === 'peek') setSnap('half')
              }}
              style={{
                flex: 1,
                padding: '10px 4px',
                minHeight: 44,
                fontSize: 12,
                fontWeight: activeTab === tab.key ? 700 : 400,
                background: 'transparent',
                color: activeTab === tab.key ? '#38bdf8' : '#475569',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid #38bdf8' : '2px solid transparent',
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              <div style={{ fontSize: 16 }}>{tab.icon}</div>
              <div>{tab.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Контент — только когда не peek */}
      {snap !== 'peek' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'layers' && <LayersPanel />}
          {activeTab === 'route'  && <RoutePanel />}
          {activeTab === 'object' && <ObjectPanel />}
        </div>
      )}
    </div>
  )
}
