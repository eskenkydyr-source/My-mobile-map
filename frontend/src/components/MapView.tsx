import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polyline, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { doc, onSnapshot } from 'firebase/firestore'
import { ref, getBytes } from 'firebase/storage'
import { db, storage } from '../firebase'
import { useStore } from '../store/useStore'
import { haversine, nearestNode } from '../utils/distance'
import type { GraphNode } from '../utils/distance'
import { astar, buildAdj } from '../utils/astar'

const WELL_COLORS: Record<string, string> = {
  'dob.': '#22c55e', 'nagn.': '#3b82f6', 'likv.': '#6b7280',
  'water': '#06b6d4', 'gaz': '#f59e0b', 'kontr.': '#8b5cf6', 'razv.': '#f97316',
}

const BASEMAP_URLS: Record<string, string> = {
  osm:  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  sat:  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

// Компонент для обработки кликов на карте
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) { onMapClick(e.latlng.lat, e.latlng.lng) }
  })
  return null
}

// Компонент для перелёта к объекту
function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, 15, { duration: 1 })
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Сохраняет позицию карты в localStorage при каждом движении
function PositionSaver() {
  const map = useMap()
  useMapEvents({
    moveend() {
      const c = map.getCenter()
      const z = map.getZoom()
      localStorage.setItem('map_pos', JSON.stringify({ lat: c.lat, lon: c.lng, zoom: z }))
    }
  })
  return null
}

// При первом открытии: GPS → сохранённая позиция → центр месторождения
function InitialPosition() {
  const map = useMap()
  useEffect(() => {
    // 1. Попробовать сохранённую позицию
    const saved = localStorage.getItem('map_pos')
    if (saved) {
      try {
        const { lat, lon, zoom } = JSON.parse(saved)
        map.setView([lat, lon], zoom, { animate: false })
        return
      } catch {}
    }
    // 2. GPS — без высокой точности, с кэшем (быстрее на мобильных)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude: lat, longitude: lng } = pos.coords
          if (Math.abs(lat - 45.374) < 0.5 && Math.abs(lng - 51.926) < 0.5) {
            map.setView([lat, lng], 15, { animate: true })
          } else {
            map.setView([lat, lng], 13, { animate: true })
          }
        },
        () => {}, // GPS недоступен — остаёмся на дефолте
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Компонент для смены базовой карты
function BasemapLayer({ basemap }: { basemap: string }) {
  return (
    <TileLayer
      key={basemap}
      url={BASEMAP_URLS[basemap] || BASEMAP_URLS.osm}
      attribution="© OpenStreetMap / Esri / CARTO"
    />
  )
}

export default function MapView() {
  const {
    layers, activeWellTypes, basemap,
    from, to, setFrom, setTo,
    routeSelectMode, setRouteSelectMode,
    routePath, setRoutePath, setRouteInfo,
    setSelectedObject,
    markerMode, customMarkers, addCustomMarker,
    editMode, editSubmode,
    selectedNodeIdx, setSelectedNodeIdx,
    segmentStep,
  } = useStore()

  const [wells, setWells] = useState<any>(null)
  const [bkns, setBkns] = useState<any>(null)
  const [gu, setGu] = useState<any>(null)
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[], edges: [number,number,number][] } | null>(null)
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [editGraph, setEditGraph] = useState<{ nodes: GraphNode[], edges: [number,number,number][] } | null>(null)
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null)
  // Режим "Цепочка": индекс последнего добавленного узла
  const [chainLastIdx, setChainLastIdx] = useState<number | null>(null)
  // Режим "Отрезок": первая точка (existingIdx — если начато с существующего узла)
  const [segmentStart, setSegmentStart] = useState<{ lat: number; lon: number; existingIdx?: number } | null>(null)

  const base = import.meta.env.BASE_URL

  useEffect(() => {
    import('../utils/dataLoader').then(({ loadAllData }) =>
      loadAllData(base).then(({ wells: w, bkns: b, gu: g, graph: gr, source }) => {
        setWells(w); setBkns(b); setGu(g)
        const parsed = {
          nodes: gr.nodes.map((n: any) => Array.isArray(n) ? { lat: n[0], lon: n[1], type: n[2] || "road" } : n) as GraphNode[],
          edges: gr.edges as [number,number,number][]
        }
        // Загрузить сохранённые изменения: localStorage как fallback
        const saved = localStorage.getItem('kalamkas_graph')
        const graph = saved ? JSON.parse(saved) : parsed
        setGraphData(parsed)
        setEditGraph({ ...graph })
        ;(window as any).__KALAMKAS_GRAPH = graph
        ;(window as any).__KALAMKAS_DATA = { wells: w, bkns: b, gu: g }
        ;(window as any).__DATA_SOURCE = source
        console.log(`[Kalamkas] Данные загружены: ${source}`)
      })
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time синхронизация графа: Firestore хранит метаданные, Storage — JSON файл
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'graph', 'current'), async (snap) => {
      if (!snap.exists()) return
      const meta = snap.data()
      if (!meta?.updatedAt) return
      try {
        // Скачиваем JSON из Firebase Storage
        const graphRef = ref(storage, 'graph/current.json')
        const bytes = await getBytes(graphRef)
        const text = new TextDecoder().decode(bytes)
        const data = JSON.parse(text)
        if (!data?.nodes || !data?.edges) return
        // Конвертируем объекты обратно в массивы [from, to, dist]
        const edges = data.edges.map((e: any) =>
          Array.isArray(e) ? e : [e.from, e.to, e.dist]
        )
        const updated = { nodes: data.nodes, edges }
        setEditGraph(updated)
        ;(window as any).__KALAMKAS_GRAPH = updated
        localStorage.setItem('kalamkas_graph', JSON.stringify(updated))
        console.log('[Kalamkas] Граф обновлён из Firebase Storage:', meta.updatedAt,
          `(${meta.nodeCount} узлов, ${meta.edgeCount} рёбер)`)
      } catch (err: any) {
        console.warn('[Kalamkas] Ошибка загрузки графа:', err.message)
      }
    }, (err) => {
      console.warn('[Kalamkas] Firebase недоступен:', err.message)
    })
    return unsub
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Построение маршрута — использует editGraph (с изменениями) если он есть
  const buildRoute = () => {
    if (!from || !to) return
    const activeGraph = editGraph || graphData
    if (!activeGraph) return
    const { nodes, edges } = activeGraph
    const adj = buildAdj(nodes, edges)
    const startIdx = nearestNode(from.lat, from.lon, nodes)
    const goalIdx = nearestNode(to.lat, to.lon, nodes)
    if (startIdx === null || goalIdx === null) { setRoutePath([]); return }
    const path = astar(startIdx, goalIdx, nodes, adj)
    if (!path) { setRoutePath([]); return }
    const coords: [number, number][] = path.map(i => [nodes[i].lat, nodes[i].lon])
    let dist = 0
    for (let i = 0; i < coords.length - 1; i++) {
      dist += haversine(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1])
    }
    dist += haversine(from.lat, from.lon, coords[0][0], coords[0][1])
    dist += haversine(to.lat, to.lon, coords[coords.length-1][0], coords[coords.length-1][1])
    setRoutePath(coords)
    setRouteInfo({ distance: dist, duration: (dist / 1000) / 30 * 60 })
  }

  // Глобально доступна для RoutePanel и App
  useEffect(() => {
    (window as any).__BUILD_ROUTE = buildRoute
  }, [from, to, graphData, editGraph]) // eslint-disable-line react-hooks/exhaustive-deps

  // Сбросить временные состояния редактора при смене режима
  useEffect(() => {
    setChainLastIdx(null)
    setSegmentStart(null)
  }, [editSubmode])

  // __FLY_TO, __SET_MY_LOCATION, __SAVE_GRAPH — вызываются из App.tsx и LayersPanel
  useEffect(() => {
    (window as any).__FLY_TO = (coords: [number, number], _zoom?: number) => {
      setFlyTarget(coords)
    }
    (window as any).__SET_MY_LOCATION = (coords: [number, number]) => {
      setMyLocation(coords)
    }
    (window as any).__SAVE_GRAPH = (g: { nodes: GraphNode[], edges: [number,number,number][] }) => {
      saveGraph(g)
    }
    ;(window as any).__NAV_FLY = (coords: [number, number]) => {
      setFlyTarget(coords)
      setMyLocation(coords)
    }
    return () => {
      delete (window as any).__FLY_TO
      delete (window as any).__SET_MY_LOCATION
      delete (window as any).__SAVE_GRAPH
      delete (window as any).__NAV_FLY
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Сохранить граф в localStorage
  const saveGraph = (g: { nodes: GraphNode[], edges: [number,number,number][] }) => {
    localStorage.setItem('kalamkas_graph', JSON.stringify(g))
    ;(window as any).__KALAMKAS_GRAPH = g
    setEditGraph({ ...g })
  }

  const handleMapClick = (lat: number, lon: number) => {
    if (routeSelectMode) {
      const wp = { lat, lon, name: `${lat.toFixed(5)}, ${lon.toFixed(5)}` }
      routeSelectMode === 'from' ? setFrom(wp) : setTo(wp)
      setRouteSelectMode(null)
      return
    }
    if (markerMode) {
      addCustomMarker(lat, lon)
      return
    }
    // Редактор: добавить узел
    if (editMode && editSubmode === 'add' && editGraph) {
      const newNode: GraphNode = { lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)), type: 'road' }
      const updated = { ...editGraph, nodes: [...editGraph.nodes, newNode] }
      saveGraph(updated)
      return
    }
    // Редактор: переместить узел — 2й клик (новое место)
    if (editMode && editSubmode === 'move' && selectedNodeIdx !== null && editGraph) {
      const nodes = editGraph.nodes.map((n, i) =>
        i === selectedNodeIdx ? { ...n, lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)) } : n
      )
      saveGraph({ ...editGraph, nodes })
      setSelectedNodeIdx(null)
      return
    }
    // Режим "Цепочка": каждый клик = новый узел + ребро к предыдущему
    if (editMode && editSubmode === 'chain' && editGraph) {
      const newNode: GraphNode = { lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)), type: 'road' }
      const newNodes = [...editGraph.nodes, newNode]
      const newIdx = newNodes.length - 1
      const newEdges = [...editGraph.edges]
      if (chainLastIdx !== null) {
        const prev = newNodes[chainLastIdx]
        const dist = Math.round(haversine(prev.lat, prev.lon, newNode.lat, newNode.lon))
        newEdges.push([chainLastIdx, newIdx, dist])
      }
      saveGraph({ ...editGraph, nodes: newNodes, edges: newEdges })
      setChainLastIdx(newIdx)
      return
    }
    // Режим "Отрезок": клик 1 = начало, клик 2 = конец → автоузлы через segmentStep метров
    if (editMode && editSubmode === 'segment' && editGraph) {
      if (!segmentStart) {
        setSegmentStart({ lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)) })
        return
      }
      // Второй клик: расставляем узлы вдоль прямой
      const { lat: sLat, lon: sLon } = segmentStart
      const totalDist = haversine(sLat, sLon, lat, lon)
      const n = Math.max(1, Math.round(totalDist / segmentStep))
      const newNodes = [...editGraph.nodes]
      const newEdges = [...editGraph.edges]
      let prevIdx: number
      if (segmentStart.existingIdx !== undefined) {
        // Начало с существующего узла — не создаём новый
        prevIdx = segmentStart.existingIdx
      } else {
        // Начало с пустого места — создаём начальный узел
        newNodes.push({ lat: parseFloat(sLat.toFixed(6)), lon: parseFloat(sLon.toFixed(6)), type: 'road' })
        prevIdx = newNodes.length - 1
      }
      // Промежуточные + конечный узел
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const node: GraphNode = {
          lat: parseFloat((sLat + t * (lat - sLat)).toFixed(6)),
          lon: parseFloat((sLon + t * (lon - sLon)).toFixed(6)),
          type: 'road',
        }
        newNodes.push(node)
        const currIdx = newNodes.length - 1
        const dist = Math.round(haversine(newNodes[prevIdx].lat, newNodes[prevIdx].lon, node.lat, node.lon))
        newEdges.push([prevIdx, currIdx, dist])
        prevIdx = currIdx
      }
      saveGraph({ ...editGraph, nodes: newNodes, edges: newEdges })
      setSegmentStart(null) // готов к следующему отрезку
      return
    }
  }

  const handleNodeClick = (idx: number, e?: any) => {
    if (e) e.originalEvent?.stopPropagation?.()
    if (!editMode || !editGraph) return

    // Цепочка: клик на существующий узел = начать/продолжить цепочку с него
    if (editSubmode === 'chain') {
      setChainLastIdx(idx)
      return
    }

    // Отрезок: клик на существующий узел = задать его как начало отрезка
    if (editSubmode === 'segment') {
      const n = editGraph.nodes[idx]
      setSegmentStart({ lat: n.lat, lon: n.lon, existingIdx: idx })
      return
    }

    // Удалить узел
    if (editSubmode === 'del') {
      const updated = {
        nodes: editGraph.nodes.filter((_, i) => i !== idx),
        edges: editGraph.edges
          .filter(([f, t]) => f !== idx && t !== idx)
          .map(([f, t, d]): [number,number,number] => [f > idx ? f - 1 : f, t > idx ? t - 1 : t, d])
      }
      saveGraph(updated)
      setSelectedNodeIdx(null)
      return
    }

    // Переместить — 1й клик: выбрать узел
    if (editSubmode === 'move') {
      setSelectedNodeIdx(selectedNodeIdx === idx ? null : idx)
      return
    }

    // Добавить ребро
    if (editSubmode === 'addedge') {
      if (selectedNodeIdx === null) {
        setSelectedNodeIdx(idx)
      } else if (selectedNodeIdx !== idx) {
        const a = editGraph.nodes[selectedNodeIdx]
        const b = editGraph.nodes[idx]
        const dist = Math.round(haversine(a.lat, a.lon, b.lat, b.lon))
        // Проверить что ребро ещё не существует
        const exists = editGraph.edges.some(
          ([f, t]) => (f === selectedNodeIdx && t === idx) || (f === idx && t === selectedNodeIdx)
        )
        if (!exists) {
          const newEdge: [number,number,number] = [selectedNodeIdx, idx, dist]
          saveGraph({ ...editGraph, edges: [...editGraph.edges, newEdge] })
        }
        setSelectedNodeIdx(null)
      }
      return
    }
  }

  const handleEdgeClick = (edgeIdx: number, e?: any) => {
    if (e) e.originalEvent?.stopPropagation?.()
    if (!editMode || editSubmode !== 'deledge' || !editGraph) return
    const updated = { ...editGraph, edges: editGraph.edges.filter((_, i) => i !== edgeIdx) }
    saveGraph(updated)
  }

  const handleObjectClick = (name: string, type: string, lat: number, lon: number, properties: any) => {
    setSelectedObject({ name, type, lat, lon, properties })
    setFlyTarget([lat, lon])
  }

  // Дорожный слой
  const roadLines = graphData ? graphData.edges.map(([fromIdx, toIdx], i) => {
    const a = graphData.nodes[fromIdx], b = graphData.nodes[toIdx]
    if (!a || !b) return null
    const aType = a.type, bType = b.type
    let color = '#374151'; let weight = 1.5
    if (aType === 'bkns' || bType === 'bkns') { color = '#fff'; weight = 2.5 }
    else if (aType === 'gu' || bType === 'gu') { color = '#f59e0b'; weight = 2 }
    return (
      <Polyline key={i} positions={[[a.lat, a.lon], [b.lat, b.lon]]}
        pathOptions={{ color, weight, opacity: 0.7 }} />
    )
  }) : null

  const visibleWellTypes = Array.from(activeWellTypes)

  return (
    <MapContainer
      center={[45.374, 51.926]}
      zoom={12}
      style={{ flex: 1, height: '100%' }}
      zoomControl={true}
    >
      <BasemapLayer basemap={basemap} />
      <MapClickHandler onMapClick={handleMapClick} />
      <FlyTo target={flyTarget} />
      <PositionSaver />
      <InitialPosition />

      {/* Дороги (обычный режим) */}
      {layers.roads && !editMode && roadLines}

      {/* Редактор графа: рёбра */}
      {editMode && editGraph && editGraph.edges.map(([fromIdx, toIdx], i) => {
        const a = editGraph.nodes[fromIdx], b = editGraph.nodes[toIdx]
        if (!a || !b) return null
        return (
          <Polyline
            key={`edge-${i}`}
            positions={[[a.lat, a.lon], [b.lat, b.lon]]}
            pathOptions={{
              color: editSubmode === 'deledge' ? '#f97316' : '#a78bfa',
              weight: editSubmode === 'deledge' ? 4 : 2,
              opacity: 0.8
            }}
            eventHandlers={{ click: (e) => handleEdgeClick(i, e) }}
          />
        )
      })}

      {/* Редактор графа: узлы */}
      {editMode && editGraph && editGraph.nodes.map((n, i) => {
        const isSelected = selectedNodeIdx === i
        const baseColor = n.type === 'bkns' ? '#3b82f6' : n.type === 'gu' ? '#f59e0b' : '#a78bfa'
        const color = editSubmode === 'del' ? '#ef4444'
          : isSelected ? '#22c55e'
          : baseColor
        const isMobile = window.innerWidth <= 768
        const radius = isSelected ? (isMobile ? 16 : 10) : editSubmode === 'del' ? (isMobile ? 12 : 7) : (isMobile ? 9 : 5)
        return (
          <CircleMarker
            key={`node-${i}`}
            center={[n.lat, n.lon]}
            radius={radius}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: isSelected ? 3 : 2 }}
            eventHandlers={{ click: (e) => handleNodeClick(i, e) }}
          >
            <Popup>
              Узел #{i} ({n.type})<br/>
              {n.lat.toFixed(5)}, {n.lon.toFixed(5)}
            </Popup>
          </CircleMarker>
        )
      })}

      {/* Скважины */}
      {layers.wells && wells?.features
        ?.filter((f: any) => visibleWellTypes.includes(f.properties.type))
        .map((f: any, i: number) => {
          const [lon, lat] = f.geometry.coordinates
          const color = WELL_COLORS[f.properties.type] || '#999'
          return (
            <CircleMarker
              key={i}
              center={[lat, lon]}
              radius={window.innerWidth <= 768 ? 8 : 3}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 0.5 }}
              eventHandlers={{ click: () => handleObjectClick(f.properties.name || `Скв. ${f.properties.well_num}`, 'well', lat, lon, f.properties) }}
            />
          )
        })}

      {/* БКНС */}
      {layers.bkns && bkns && (
        <GeoJSON key="bkns" data={bkns}
          style={{ color: '#dc2626', weight: 2, fillColor: '#fca5a5', fillOpacity: 0.35 }}
          onEachFeature={(f, layer) => {
            const geom = f.geometry as any
            const coords = geom.coordinates[0]
            const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length
            const lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length
            layer.on('click', () => handleObjectClick(f.properties.NAME, 'bkns', lat, lon, f.properties))
          }}
        />
      )}

      {/* ГУ */}
      {layers.gu && gu && (
        <GeoJSON key="gu" data={gu}
          style={{ color: '#d97706', weight: 1.5, fillColor: '#fde68a', fillOpacity: 0.25 }}
          onEachFeature={(f, layer) => {
            const geom = f.geometry as any
            const coords = geom.coordinates[0]
            const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length
            const lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length
            const name = f.properties.NAME || f.properties.FIND || 'ГУ'
            layer.on('click', () => handleObjectClick(name, 'gu', lat, lon, f.properties))
          }}
        />
      )}

      {/* Маршрут */}
      {routePath && routePath.length > 1 && (
        <Polyline positions={routePath}
          pathOptions={{ color: '#38bdf8', weight: 4, opacity: 0.9 }} />
      )}
      {routePath !== null && routePath.length === 0 && from && to && (
        <Polyline positions={[[from.lat, from.lon], [to.lat, to.lon]]}
          pathOptions={{ color: '#ef4444', weight: 2, dashArray: '8,6', opacity: 0.7 }} />
      )}

      {/* Маркеры маршрута */}
      {from && (
        <CircleMarker center={[from.lat, from.lon]} radius={8}
          pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1 }}>
          <Popup>{from.name}</Popup>
        </CircleMarker>
      )}
      {to && (
        <CircleMarker center={[to.lat, to.lon]} radius={8}
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }}>
          <Popup>{to.name}</Popup>
        </CircleMarker>
      )}

      {/* Режим "Отрезок": маркер начальной точки */}
      {editMode && editSubmode === 'segment' && segmentStart && (
        <>
          <CircleMarker center={[segmentStart.lat, segmentStart.lon]} radius={10}
            pathOptions={{ color: '#fff', fillColor: '#f97316', fillOpacity: 1, weight: 2 }}>
            <Popup>Начало отрезка<br/>Кликни на конечную точку</Popup>
          </CircleMarker>
          <CircleMarker center={[segmentStart.lat, segmentStart.lon]} radius={18}
            pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.15, weight: 1.5, dashArray: '4,3' }} />
        </>
      )}

      {/* Режим "Цепочка": выделить последний узел */}
      {editMode && editSubmode === 'chain' && chainLastIdx !== null && editGraph?.nodes[chainLastIdx] && (
        <CircleMarker
          center={[editGraph.nodes[chainLastIdx].lat, editGraph.nodes[chainLastIdx].lon]}
          radius={12}
          pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.4, weight: 2.5, dashArray: '4,3' }}
        />
      )}

      {/* Моё местоположение — синяя точка */}
      {myLocation && (
        <>
          <CircleMarker center={myLocation} radius={10}
            pathOptions={{ color: '#fff', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }}>
            <Popup>
              📡 Моё местоположение<br/>
              {myLocation[0].toFixed(5)}, {myLocation[1].toFixed(5)}<br/>
              <button
                onClick={() => {
                  setFrom({ lat: myLocation[0], lon: myLocation[1], name: 'Моё местоположение' })
                  ;(window as any).__BUILD_ROUTE?.()
                }}
                style={{ marginTop: 6, padding: '4px 8px', fontSize: 11, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', width: '100%' }}
              >
                🗺 Маршрут отсюда
              </button>
            </Popup>
          </CircleMarker>
          {/* Пульсирующий круг */}
          <CircleMarker center={myLocation} radius={18}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 1.5, dashArray: '4,3' }} />
        </>
      )}

      {/* Пользовательские метки */}
      {customMarkers.map(m => (
        <CircleMarker key={m.id} center={[m.lat, m.lon]} radius={7}
          pathOptions={{ color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 2 }}>
          <Popup>{m.label}<br/>{m.lat.toFixed(5)}, {m.lon.toFixed(5)}</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
