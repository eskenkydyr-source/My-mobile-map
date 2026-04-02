import { useEffect, useRef, useCallback, useState } from 'react'
import { Layers, Map, MapPin } from 'lucide-react'
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
  }, [selectedObject]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [dragging, dragDy]) // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = [
    { key: 'layers' as const, Icon: Layers, label: 'Слои' },
    { key: 'route'  as const, Icon: Map, label: 'Маршрут' },
    { key: 'object' as const, Icon: MapPin, label: 'Объект' },
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
        borderRadius: '16px 16px 0 0',
        boxShadow: '0 -2px 20px rgba(0,0,0,0.6)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        transition: dragging ? 'none' : 'height 0.3s cubic-bezier(0.32,0.72,0,1)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Drag handle + tabs — always visible */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '6px 0 0', flexShrink: 0,
          touchAction: 'none', userSelect: 'none', cursor: 'grab',
        }}
      >
        {/* Handle pill */}
        <div style={{
          width: 32, height: 4, borderRadius: 2,
          background: '#475569', marginBottom: 6,
        }} />

        {/* Tabs — visible even in peek */}
        <div style={{ display: 'flex', width: '100%', borderBottom: '1px solid #1e293b' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key)
                  if (snap === 'peek') setSnap('half')
                }}
                style={{
                  flex: 1,
                  padding: '8px 4px 10px',
                  minHeight: 44,
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 400,
                  background: 'transparent',
                  color: isActive ? '#38bdf8' : '#64748b',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <tab.Icon size={16} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Swipe-up hint in peek state */}
      {snap === 'peek' && (
        <div
          onClick={() => setSnap('half')}
          style={{
            padding: '6px 0 2px',
            textAlign: 'center', fontSize: 11, color: '#475569',
            cursor: 'pointer',
          }}
        >
          ↑ Потяните вверх
        </div>
      )}

      {/* Content */}
      {snap !== 'peek' && (
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {activeTab === 'layers' && <LayersPanel />}
          {activeTab === 'route'  && <RoutePanel />}
          {activeTab === 'object' && <ObjectPanel />}
        </div>
      )}
    </div>
  )
}
