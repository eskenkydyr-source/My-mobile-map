import { useStore } from '../store/useStore'
import LayersPanel from './panels/LayersPanel'
import RoutePanel from './panels/RoutePanel'
import ObjectPanel from './panels/ObjectPanel'

export default function Sidebar() {
  const { activeTab, setActiveTab } = useStore()

  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#0f172a',
      borderRight: '1px solid #1e293b',
      display: 'flex', flexDirection: 'column',
      color: '#e2e8f0'
    }}>
      {/* Заголовок */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e293b' }}>
        <h1 style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', letterSpacing: 1, margin: 0 }}>
          ҚАЛАМҚАС
        </h1>
        <p style={{ fontSize: 10, color: '#475569', marginTop: 2, margin: '2px 0 0' }}>
          Карта нефтяного месторождения
        </p>
      </div>

      {/* Вкладки */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
        {(['layers', 'route', 'object'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '12px 4px', fontSize: 12, minHeight: 44,
              background: activeTab === tab ? '#1e293b' : 'transparent',
              color: activeTab === tab ? '#38bdf8' : '#64748b',
              border: 'none', borderBottom: activeTab === tab ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            {tab === 'layers' ? '🗂 Слои' : tab === 'route' ? '🗺 Маршрут' : '📍 Объект'}
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
