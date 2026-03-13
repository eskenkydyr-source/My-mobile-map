import { create } from 'zustand'

export type WellType = 'dob.' | 'nagn.' | 'likv.' | 'water' | 'gaz' | 'kontr.' | 'razv.'

interface Waypoint { lat: number; lon: number; name: string }
interface CustomMarker { lat: number; lon: number; label: string; id: number }
interface SelectedObject { name: string; type: string; lat: number; lon: number; properties: any }

interface Store {
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
  // Выбранный узел для перемещения или соединения ребром
  selectedNodeIdx: number | null
  setSelectedNodeIdx: (i: number | null) => void
  // Шаг между узлами в режиме "Отрезок" (метры)
  segmentStep: number
  setSegmentStep: (n: number) => void

  // Активная вкладка
  activeTab: 'layers' | 'route' | 'object'
  setActiveTab: (t: 'layers' | 'route' | 'object') => void
}

let markerCounter = 0

export const useStore = create<Store>((set, _get) => ({
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
}))
