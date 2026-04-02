import { create } from 'zustand'
import { idbGet, idbSet, idbDel } from '../utils/idb'
import { haversine, nearestNode } from '../utils/distance'
import { astar, buildAdj } from '../utils/astar'

export type WellType = 'dob.' | 'nagn.' | 'likv.' | 'water' | 'gaz' | 'kontr.' | 'razv.'

export interface GraphNode { lat: number; lon: number; type: string }
export type GraphEdge = [number, number, number] // [fromIdx, toIdx, distM]
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; _savedAt?: number }

interface Waypoint { lat: number; lon: number; name: string }
interface CustomMarker { lat: number; lon: number; label: string; id: number }
interface SelectedObject { name: string; type: string; lat: number; lon: number; properties: any }

interface Store {
  // Данные карты (бывшие window.__ глобалы)
  wells: any | null
  bkns: any | null
  gu: any | null
  graphData: GraphData | null       // исходный граф (из файлов)
  editGraph: GraphData | null       // редактируемый граф (с изменениями)
  dataSource: string | null
  setMapData: (d: { wells: any; bkns: any; gu: any; graph: GraphData; source: string }) => void
  setEditGraph: (g: GraphData) => void
  saveGraph: (g: GraphData) => void // сохраняет в IndexedDB + обновляет editGraph
  resetGraph: () => void            // сбрасывает к исходному графу, чистит IndexedDB

  // Карта: fly target + моё местоположение
  flyTarget: [number, number] | null
  setFlyTarget: (c: [number, number] | null) => void
  myLocation: [number, number] | null
  setMyLocation: (c: [number, number] | null) => void

  // Слои
  layers: Record<string, boolean>
  toggleLayer: (key: string) => void
  activeWellTypes: Set<WellType>
  toggleWellType: (t: WellType) => void

  // Базовая карта
  basemap: 'osm' | 'sat' | 'dark'
  setBasemap: (b: 'osm' | 'sat' | 'dark') => void

  // Маршрут
  from: Waypoint | null
  to: Waypoint | null
  setFrom: (w: Waypoint | null) => void
  setTo: (w: Waypoint | null) => void
  routeSelectMode: 'from' | 'to' | null
  setRouteSelectMode: (m: 'from' | 'to' | null) => void
  routePath: [number, number][] | null
  setRoutePath: (p: [number, number][] | null) => void
  routeInfo: { distance: number; duration: number } | null
  setRouteInfo: (info: { distance: number; duration: number } | null) => void

  // Выбранный объект
  selectedObject: SelectedObject | null
  setSelectedObject: (o: SelectedObject | null) => void

  // Пользовательские метки
  markerMode: boolean
  setMarkerMode: (v: boolean) => void
  customMarkers: CustomMarker[]
  addCustomMarker: (lat: number, lon: number) => void
  removeCustomMarker: (id: number) => void

  // Редактор графа
  editMode: boolean
  setEditMode: (v: boolean) => void
  editSubmode: 'move' | 'add' | 'del' | 'deledge' | 'addedge' | 'chain' | 'segment'
  setEditSubmode: (m: 'move' | 'add' | 'del' | 'deledge' | 'addedge' | 'chain' | 'segment') => void
  selectedNodeIdx: number | null
  setSelectedNodeIdx: (i: number | null) => void
  segmentStep: number
  setSegmentStep: (n: number) => void

  // Активная вкладка
  activeTab: 'layers' | 'route' | 'object'
  setActiveTab: (t: 'layers' | 'route' | 'object') => void

  // Навигация
  navActive: boolean
  setNavActive: (v: boolean) => void
  gpsHeading: number | null
  setGpsHeading: (h: number | null) => void
  rerouting: boolean
  setRerouting: (v: boolean) => void

  // Построение маршрута A*
  buildRoute: () => void
}

let markerCounter = 0

export const useStore = create<Store>((set, _get) => ({
  // Данные карты
  wells: null, bkns: null, gu: null, graphData: null, editGraph: null, dataSource: null,
  setMapData: async ({ wells, bkns, gu, graph, source }) => {
    // Пробуем IndexedDB, потом localStorage как фоллбэк
    let saved: GraphData | undefined
    try {
      saved = await idbGet<GraphData>('graph')
    } catch {
      const raw = localStorage.getItem('kalamkas_graph')
      if (raw) saved = JSON.parse(raw)
    }
    const editGraph = saved?.nodes?.length ? saved : graph
    set({ wells, bkns, gu, graphData: graph, editGraph, dataSource: source })
  },
  setEditGraph: (g) => set({ editGraph: g }),
  saveGraph: (g) => {
    // Добавляем метку времени для сравнения с Firebase
    const stamped = { ...g, _savedAt: Date.now() }
    // Асинхронно сохраняем в IndexedDB (фоном)
    idbSet('graph', stamped).catch(() => {
      // Фоллбэк на localStorage
      try { localStorage.setItem('kalamkas_graph', JSON.stringify(stamped)) } catch {}
    })
    set({ editGraph: stamped })
  },
  resetGraph: () => {
    // Удаляем сохранённый граф из IndexedDB и localStorage, возвращаем исходный
    idbDel('graph').catch(() => {})
    localStorage.removeItem('kalamkas_graph')
    const { graphData } = _get()
    if (graphData) set({ editGraph: graphData })
  },

  // Карта
  flyTarget: null,
  setFlyTarget: (c) => set({ flyTarget: c }),
  myLocation: null,
  setMyLocation: (c) => set({ myLocation: c }),

  // Слои
  layers: { roads: false, bkns: true, gu: true, wells: true },
  toggleLayer: (key) => set(s => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  activeWellTypes: new Set(['dob.', 'nagn.', 'likv.', 'water', 'gaz', 'kontr.', 'razv.']),
  toggleWellType: (t) => set(s => {
    const next = new Set(s.activeWellTypes)
    next.has(t) ? next.delete(t) : next.add(t)
    return { activeWellTypes: next }
  }),

  basemap: 'osm',
  setBasemap: (b) => set({ basemap: b }),

  from: null, to: null,
  setFrom: (w) => set({ from: w }),
  setTo: (w) => set({ to: w }),
  routeSelectMode: null,
  setRouteSelectMode: (m) => set({ routeSelectMode: m }),
  routePath: null,
  setRoutePath: (p) => set({ routePath: p }),
  routeInfo: null,
  setRouteInfo: (info) => set({ routeInfo: info }),

  selectedObject: null,
  setSelectedObject: (o) => {
    set({ selectedObject: o })
    if (o) set({ activeTab: 'object' })
  },

  markerMode: false,
  setMarkerMode: (v) => set({ markerMode: v }),
  customMarkers: [],
  addCustomMarker: (lat, lon) => set(s => ({
    customMarkers: [...s.customMarkers, { lat, lon, label: `Метка ${++markerCounter}`, id: markerCounter }]
  })),
  removeCustomMarker: (id) => set(s => ({ customMarkers: s.customMarkers.filter(m => m.id !== id) })),

  editMode: false,
  setEditMode: (v) => set({ editMode: v }),
  editSubmode: 'add',
  setEditSubmode: (m) => set({ editSubmode: m, selectedNodeIdx: null }),
  selectedNodeIdx: null,
  setSelectedNodeIdx: (i) => set({ selectedNodeIdx: i }),
  segmentStep: 100,
  setSegmentStep: (n) => set({ segmentStep: n }),

  activeTab: 'layers',
  setActiveTab: (t) => set({ activeTab: t }),

  navActive: false,
  setNavActive: (v) => set({ navActive: v }),
  gpsHeading: null,
  setGpsHeading: (h) => set({ gpsHeading: h }),
  rerouting: false,
  setRerouting: (v) => set({ rerouting: v }),

  buildRoute: () => {
    const { from, to, editGraph } = _get()
    if (!from || !to || !editGraph) return
    const { nodes, edges } = editGraph
    const adj = buildAdj(nodes, edges)
    const startIdx = nearestNode(from.lat, from.lon, nodes)
    const goalIdx = nearestNode(to.lat, to.lon, nodes)
    if (startIdx === null || goalIdx === null) { set({ routePath: [] }); return }
    const path = astar(startIdx, goalIdx, nodes, adj)
    if (!path) { set({ routePath: [] }); return }
    const coords: [number, number][] = path.map(i => [nodes[i].lat, nodes[i].lon])
    let dist = 0
    for (let i = 0; i < coords.length - 1; i++) {
      dist += haversine(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
    }
    dist += haversine(from.lat, from.lon, coords[0][0], coords[0][1])
    dist += haversine(to.lat, to.lon, coords[coords.length - 1][0], coords[coords.length - 1][1])
    set({ routePath: coords, routeInfo: { distance: dist, duration: (dist / 1000) / 30 * 60 } })
  },
}))
