import { Layers, Map, MapPin } from 'lucide-react'
import { theme as t } from '../theme'
import { useStore } from '../store/useStore'
import LayersPanel from './panels/LayersPanel'
import RoutePanel from './panels/RoutePanel'
import ObjectPanel from './panels/ObjectPanel'

const TABS = [
  { key: 'layers' as const, Icon: Layers, label: 'Слои' },
  { key: 'route'  as const, Icon: Map, label: 'Маршрут' },
  { key: 'object' as const, Icon: MapPin, label: 'Объект' },
]

export default function Sidebar() {
  const { activeTab, setActiveTab } = useStore()

  return (
    <div style={{
      width: '100%', height: '100%',
      background: t.bg.base,
      borderRight: `1px solid ${t.border.subtle}`,
      display: 'flex', flexDirection: 'column',
      color: t.text.primary,
    }}>
      {/* Заголовок */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border.subtle}` }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: t.accent, letterSpacing: 1, margin: 0 }}>
          ҚАЛАМҚАС
        </h1>
        <p style={{ fontSize: 11, color: t.text.dim, margin: '4px 0 0' }}>
          Карта нефтяного месторождения
        </p>
      </div>

      {/* Вкладки */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border.subtle}` }}>
        {TABS.map(({ key, Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1, padding: '12px 4px', fontSize: 12, minHeight: 44,
              background: activeTab === key ? t.bg.surface : 'transparent',
              color: activeTab === key ? t.accent : t.text.muted,
              border: 'none', borderBottom: activeTab === key ? `2px solid ${t.accent}` : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Контент вкладки */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'layers' && <LayersPanel />}
        {activeTab === 'route' && <RoutePanel />}
        {activeTab === 'object' && <ObjectPanel />}
      </div>
    </div>
  )
}
