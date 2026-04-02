import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, GeoJSON, Polyline, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { doc, onSnapshot } from 'firebase/firestore'
import { ref, getBytes } from 'firebase/storage'
import { db, storage } from '../firebase'
import { useStore } from '../store/useStore'
import { haversine } from '../utils/distance'
import GraphLayer from './GraphLayer'
import WellsLayer from './WellsLayer'

const BASEMAP_URLS: Record<string, string> = {
  osm:  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  sat:  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng) } })
  return null
}

function FlyTo() {
  const map = useMap()
  const flyTarget = useStore(s => s.flyTarget)
  const setFlyTarget = useStore(s => s.setFlyTarget)
  useEffect(() => {
    if (flyTarget) {
      map.flyTo(flyTarget, 15, { duration: 1 })
      setFlyTarget(null)
    }
  }, [flyTarget]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function PositionSaver() {
  const map = useMap()
  useMapEvents({
    moveend() {
      const c = map.getCenter()
      localStorage.setItem('map_pos', JSON.stringify({ lat: c.lat, lon: c.lng, zoom: map.getZoom() }))
    }
  })
  return null
}

function InitialPosition() {
  const map = useMap()
  useEffect(() => {
    const saved = localStorage.getItem('map_pos')
    if (saved) {
      try {
        const { lat, lon, zoom } = JSON.parse(saved)
        map.setView([lat, lon], zoom, { animate: false })
        return
      } catch {}
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude: lat, longitude: lng } = pos.coords
          const nearField = Math.abs(lat - 45.374) < 0.5 && Math.abs(lng - 51.926) < 0.5
          map.setView([lat, lng], nearField ? 15 : 13, { animate: true })
        },
        () => {},
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function BasemapLayer({ basemap }: { basemap: string }) {
  return (
    <TileLayer
      key={basemap}
      url={BASEMAP_URLS[basemap] || BASEMAP_URLS.osm}
      attribution="© OpenStreetMap / Esri / CARTO"
    />
  )
}

/** Пульсирующее кольцо подсветки выбранного объекта */
function SelectedHighlight({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<number>(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    const size = map.getSize()
    const canvas = L.DomUtil.create('canvas', 'highlight-canvas') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.x * dpr
    canvas.height = size.y * dpr
    canvas.style.width = size.x + 'px'
    canvas.style.height = size.y + 'px'
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '450'

    const pane = map.getPane('overlayPane')
    if (pane) pane.appendChild(canvas)
    canvasRef.current = canvas

    return () => {
      cancelAnimationFrame(frameRef.current)
      if (pane && canvas.parentNode === pane) pane.removeChild(canvas)
      canvasRef.current = null
    }
  }, [map, lat, lon])

  useEffect(() => {
    const animate = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const dpr = window.devicePixelRatio || 1
      const size = map.getSize()
      canvas.width = size.x * dpr
      canvas.height = size.y * dpr
      canvas.style.width = size.x + 'px'
      canvas.style.height = size.y + 'px'

      const topLeft = map.containerPointToLayerPoint([0, 0])
      L.DomUtil.setPosition(canvas, topLeft)

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const pt = map.latLngToContainerPoint([lat, lon])
      const elapsed = (Date.now() - startRef.current) / 1000
      const pulse = Math.sin(elapsed * 3) * 0.3 + 0.7 // 0.4..1.0

      // Внешнее пульсирующее кольцо
      const outerR = 22 + Math.sin(elapsed * 2) * 8
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, outerR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(59, 130, 246, ${pulse * 0.5})`
      ctx.lineWidth = 3
      ctx.stroke()

      // Среднее кольцо
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(59, 130, 246, ${pulse})`
      ctx.lineWidth = 2.5
      ctx.stroke()

      // Внутренняя точка
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(59, 130, 246, ${pulse})`
      ctx.fill()

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [map, lat, lon])

  // Перерисовка при перемещении карты
  useMapEvents({
    moveend: () => { startRef.current = startRef.current }, // trigger re-render handled by animate loop
  })

  return null
}

/** Стрелка направления во время навигации */
function NavigationArrow({ position, heading }: { position: [number, number]; heading: number }) {
  const icon = L.divIcon({
    className: '',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    html: `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="22" fill="rgba(59,130,246,0.12)" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,3"/>
      <g transform="rotate(${heading}, 24, 24)">
        <polygon points="24,6 32,32 24,26 16,32" fill="#3b82f6" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
      </g>
      <circle cx="24" cy="24" r="5" fill="#3b82f6" stroke="#fff" stroke-width="2"/>
    </svg>`
  })
  return <Marker position={position} icon={icon} interactive={false} />
}

/** Синий маркер местоположения (без направления) */
function LocationDot({ position }: { position: [number, number] }) {
  const icon = L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" fill="rgba(59,130,246,0.12)" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,3"/>
      <circle cx="20" cy="20" r="7" fill="#3b82f6" stroke="#fff" stroke-width="2.5"/>
    </svg>`
  })
  return <Marker position={position} icon={icon} interactive={false} />
}

export default function MapView() {
  const {
    layers, activeWellTypes, basemap,
    from, to, setFrom, setTo,
    routeSelectMode, setRouteSelectMode,
    routePath,
    selectedObject, setSelectedObject, setFlyTarget,
    markerMode, customMarkers, addCustomMarker,
    editMode, editSubmode,
    selectedNodeIdx, setSelectedNodeIdx,
    segmentStep,
    wells, bkns, gu, editGraph, setMapData, setEditGraph, saveGraph,
    myLocation,
    navActive, gpsHeading,
  } = useStore()

  const [chainLastIdx, setChainLastIdx] = useState<number | null>(null)
  const [segmentStart, setSegmentStart] = useState<{ lat: number; lon: number; existingIdx?: number } | null>(null)

  const base = import.meta.env.BASE_URL

  // Загрузка данных
  useEffect(() => {
    import('../utils/dataLoader').then(({ loadAllData }) =>
      loadAllData(base).then(({ wells: w, bkns: b, gu: g, graph: gr, source }) => {
        const parsed = {
          nodes: gr.nodes.map((n: any) => Array.isArray(n) ? { lat: n[0], lon: n[1], type: n[2] || "road" } : n),
          edges: gr.edges as [number, number, number][]
        }
        setMapData({ wells: w, bkns: b, gu: g, graph: parsed, source })
        console.log(`[Kalamkas] Данные загружены: ${source}`)
      })
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Firebase real-time синхронизация графа
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'graph', 'current'), async (snap) => {
      if (!snap.exists()) return
      const meta = snap.data()
      if (!meta?.updatedAt) return

      // Не затираем локальные правки, если они новее Firebase
      const local = useStore.getState().editGraph
      const firebaseTime = new Date(meta.updatedAt).getTime()
      if (local?._savedAt && local._savedAt > firebaseTime) {
        console.log('[Kalamkas] Локальный граф новее Firebase — пропускаю синхронизацию')
        return
      }

      try {
        const graphRef = ref(storage, 'graph/current.json')
        const bytes = await getBytes(graphRef)
        const data = JSON.parse(new TextDecoder().decode(bytes))
        if (!data?.nodes || !data?.edges) return
        const edges = data.edges.map((e: any) =>
          Array.isArray(e) ? e : [e.from, e.to, e.dist]
        )
        const updated = { nodes: data.nodes, edges }
        saveGraph(updated)
        console.log('[Kalamkas] Граф обновлён из Firebase:', meta.updatedAt)
      } catch (err: any) {
        console.warn('[Kalamkas] Ошибка загрузки графа:', err.message)
      }
    }, (err) => {
      console.warn('[Kalamkas] Firebase недоступен:', err.message)
    })
    return unsub
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Сбросить временные состояния при смене режима
  useEffect(() => {
    setChainLastIdx(null)
    setSegmentStart(null)
  }, [editSubmode])

  const handleMapClick = (lat: number, lon: number) => {
    if (routeSelectMode) {
      const wp = { lat, lon, name: `${lat.toFixed(5)}, ${lon.toFixed(5)}` }
      routeSelectMode === 'from' ? setFrom(wp) : setTo(wp)
      setRouteSelectMode(null)
      return
    }
    if (markerMode) { addCustomMarker(lat, lon); return }

    if (!editMode || !editGraph) return

    if (editSubmode === 'add') {
      const newNode = { lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)), type: 'road' }
      saveGraph({ ...editGraph, nodes: [...editGraph.nodes, newNode] })
      return
    }
    if (editSubmode === 'move' && selectedNodeIdx !== null) {
      const nodes = editGraph.nodes.map((n, i) =>
        i === selectedNodeIdx ? { ...n, lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)) } : n
      )
      saveGraph({ ...editGraph, nodes })
      setSelectedNodeIdx(null)
      return
    }
    if (editSubmode === 'chain') {
      const newNode = { lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)), type: 'road' }
      const newNodes = [...editGraph.nodes, newNode]
      const newIdx = newNodes.length - 1
      const newEdges = [...editGraph.edges]
      if (chainLastIdx !== null) {
        const prev = newNodes[chainLastIdx]
        newEdges.push([chainLastIdx, newIdx, Math.round(haversine(prev.lat, prev.lon, newNode.lat, newNode.lon))])
      }
      saveGraph({ ...editGraph, nodes: newNodes, edges: newEdges })
      setChainLastIdx(newIdx)
      return
    }
    if (editSubmode === 'segment') {
      if (!segmentStart) {
        setSegmentStart({ lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)) })
        return
      }
      const { lat: sLat, lon: sLon } = segmentStart
      const totalDist = haversine(sLat, sLon, lat, lon)
      const n = Math.max(1, Math.round(totalDist / segmentStep))
      const newNodes = [...editGraph.nodes]
      const newEdges = [...editGraph.edges]
      let prevIdx = segmentStart.existingIdx !== undefined
        ? segmentStart.existingIdx
        : (newNodes.push({ lat: parseFloat(sLat.toFixed(6)), lon: parseFloat(sLon.toFixed(6)), type: 'road' }), newNodes.length - 1)
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const node = {
          lat: parseFloat((sLat + t * (lat - sLat)).toFixed(6)),
          lon: parseFloat((sLon + t * (lon - sLon)).toFixed(6)),
          type: 'road',
        }
        newNodes.push(node)
        const currIdx = newNodes.length - 1
        newEdges.push([prevIdx, currIdx, Math.round(haversine(newNodes[prevIdx].lat, newNodes[prevIdx].lon, node.lat, node.lon))])
        prevIdx = currIdx
      }
      saveGraph({ ...editGraph, nodes: newNodes, edges: newEdges })
      setSegmentStart(null)
      return
    }
  }

  const handleNodeClick = (idx: number) => {
    if (!editMode || !editGraph) return
    if (editSubmode === 'chain') { setChainLastIdx(idx); return }
    if (editSubmode === 'segment') {
      const n = editGraph.nodes[idx]
      setSegmentStart({ lat: n.lat, lon: n.lon, existingIdx: idx })
      return
    }
    if (editSubmode === 'del') {
      saveGraph({
        nodes: editGraph.nodes.filter((_, i) => i !== idx),
        edges: editGraph.edges
          .filter(([f, t]) => f !== idx && t !== idx)
          .map(([f, t, d]): [number, number, number] => [f > idx ? f - 1 : f, t > idx ? t - 1 : t, d])
      })
      setSelectedNodeIdx(null)
      return
    }
    if (editSubmode === 'move') { setSelectedNodeIdx(selectedNodeIdx === idx ? null : idx); return }
    if (editSubmode === 'addedge') {
      if (selectedNodeIdx === null) { setSelectedNodeIdx(idx); return }
      if (selectedNodeIdx !== idx) {
        const a = editGraph.nodes[selectedNodeIdx], b = editGraph.nodes[idx]
        const exists = editGraph.edges.some(([f, t]) =>
          (f === selectedNodeIdx && t === idx) || (f === idx && t === selectedNodeIdx)
        )
        if (!exists) {
          saveGraph({ ...editGraph, edges: [...editGraph.edges, [selectedNodeIdx, idx, Math.round(haversine(a.lat, a.lon, b.lat, b.lon))]] })
        }
        setSelectedNodeIdx(null)
      }
      return
    }
  }

  const handleEdgeClick = (edgeIdx: number) => {
    if (!editMode || editSubmode !== 'deledge' || !editGraph) return
    saveGraph({ ...editGraph, edges: editGraph.edges.filter((_, i) => i !== edgeIdx) })
  }

  const handleObjectClick = (name: string, type: string, lat: number, lon: number, properties: any) => {
    setSelectedObject({ name, type, lat, lon, properties })
    setFlyTarget([lat, lon])
  }

  return (
    <MapContainer center={[45.374, 51.926]} zoom={12} style={{ flex: 1, height: '100%' }} zoomControl={true}>
      <BasemapLayer basemap={basemap} />
      <MapClickHandler onMapClick={handleMapClick} />
      <FlyTo />
      <PositionSaver />
      <InitialPosition />

      {/* Дороги + редактор графа (Canvas) */}
      {(layers.roads || editMode) && editGraph && (
        <GraphLayer
          nodes={editGraph.nodes}
          edges={editGraph.edges}
          editMode={editMode}
          editSubmode={editSubmode}
          selectedNodeIdx={selectedNodeIdx}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
        />
      )}

      {/* Скважины (Canvas) */}
      {layers.wells && wells && (
        <WellsLayer wells={wells} activeWellTypes={activeWellTypes} onWellClick={handleObjectClick} />
      )}

      {/* БКНС */}
      {layers.bkns && bkns && (
        <GeoJSON key="bkns" data={bkns}
          style={{ color: '#dc2626', weight: 2, fillColor: '#fca5a5', fillOpacity: 0.35 }}
          onEachFeature={(f, layer) => {
            const coords = (f.geometry as any).coordinates[0]
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
            const coords = (f.geometry as any).coordinates[0]
            const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length
            const lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length
            layer.on('click', () => handleObjectClick(f.properties.NAME || f.properties.FIND || 'ГУ', 'gu', lat, lon, f.properties))
          }}
        />
      )}

      {/* Маршрут */}
      {routePath && routePath.length > 1 && (
        <Polyline positions={routePath} pathOptions={{ color: '#38bdf8', weight: 4, opacity: 0.9 }} />
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

      {/* Маркер начала отрезка */}
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

      {/* Последний узел цепочки */}
      {editMode && editSubmode === 'chain' && chainLastIdx !== null && editGraph?.nodes[chainLastIdx] && (
        <CircleMarker
          center={[editGraph.nodes[chainLastIdx].lat, editGraph.nodes[chainLastIdx].lon]}
          radius={12}
          pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.4, weight: 2.5, dashArray: '4,3' }}
        />
      )}

      {/* Моё местоположение — стрелка при навигации, точка без */}
      {myLocation && navActive && gpsHeading !== null && (
        <NavigationArrow position={myLocation} heading={gpsHeading} />
      )}
      {myLocation && navActive && gpsHeading === null && (
        <LocationDot position={myLocation} />
      )}
      {myLocation && !navActive && (
        <>
          <CircleMarker center={myLocation} radius={10}
            pathOptions={{ color: '#fff', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }}>
            <Popup>
              Моё местоположение<br/>
              {myLocation[0].toFixed(5)}, {myLocation[1].toFixed(5)}<br/>
              <button
                onClick={() => { setFrom({ lat: myLocation[0], lon: myLocation[1], name: 'Моё местоположение' }) }}
                style={{ marginTop: 6, padding: '4px 8px', fontSize: 11, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', width: '100%' }}
              >
                Маршрут отсюда
              </button>
            </Popup>
          </CircleMarker>
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

      {/* Подсветка выбранного объекта */}
      {selectedObject && <SelectedHighlight lat={selectedObject.lat} lon={selectedObject.lon} />}
    </MapContainer>
  )
}
