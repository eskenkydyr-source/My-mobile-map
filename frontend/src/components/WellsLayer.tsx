/**
 * WellsLayer — Canvas-рендер скважин.
 * Рисует только скважины в видимой области карты.
 * Заменяет 3308 <CircleMarker> на один Canvas.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { WellType } from '../store/useStore'

const WELL_COLORS: Record<string, string> = {
  'dob.': '#22c55e', 'nagn.': '#3b82f6', 'likv.': '#6b7280',
  'water': '#06b6d4', 'gaz': '#f59e0b', 'kontr.': '#8b5cf6', 'razv.': '#f97316',
}

const BUFFER = 0.01

interface WellFeature {
  geometry: { coordinates: [number, number] }
  properties: { type: string; name?: string; well_num?: string; [key: string]: any }
}

interface WellsLayerProps {
  wells: { features: WellFeature[] }
  activeWellTypes: Set<WellType>
  onWellClick: (name: string, type: string, lat: number, lon: number, properties: any) => void
}

export default function WellsLayer({ wells, activeWellTypes, onWellClick }: WellsLayerProps) {
  const map = useMap()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number>(0)
  const visibleWellsRef = useRef<{ idx: number; x: number; y: number; r: number; lat: number; lon: number }[]>([])

  useEffect(() => {
    const size = map.getSize()
    const canvas = L.DomUtil.create('canvas', 'wells-canvas') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.x * dpr
    canvas.height = size.y * dpr
    canvas.style.width = size.x + 'px'
    canvas.style.height = size.y + 'px'
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.pointerEvents = 'auto'
    canvas.style.zIndex = '440'

    const pane = map.getPane('overlayPane')
    if (pane) pane.appendChild(canvas)
    canvasRef.current = canvas

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const cx = (e.clientX - rect.left) * dpr
      const cy = (e.clientY - rect.top) * dpr

      for (const well of visibleWellsRef.current) {
        const dist = Math.sqrt((cx - well.x) ** 2 + (cy - well.y) ** 2)
        if (dist <= well.r + 6 * dpr) {
          const f = wells.features[well.idx]
          const name = f.properties.name || `Скв. ${f.properties.well_num}`
          onWellClick(name, 'well', well.lat, well.lon, f.properties)
          e.stopPropagation()
          return
        }
      }
    }
    canvas.addEventListener('click', handleClick)

    return () => {
      canvas.removeEventListener('click', handleClick)
      if (pane && canvas.parentNode === pane) pane.removeChild(canvas)
      canvasRef.current = null
    }
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  const draw = useCallback(() => {
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

    const bounds = map.getBounds()
    const minLat = bounds.getSouth() - BUFFER
    const maxLat = bounds.getNorth() + BUFFER
    const minLon = bounds.getWest() - BUFFER
    const maxLon = bounds.getEast() + BUFFER

    const isMobile = window.innerWidth <= 768
    const radius = isMobile ? 8 : 3
    const visWells: { idx: number; x: number; y: number; r: number; lat: number; lon: number }[] = []

    // Группируем по цвету для оптимизации (меньше смен стиля)
    const byColor = new Map<string, { x: number; y: number; idx: number; lat: number; lon: number }[]>()

    for (let i = 0; i < wells.features.length; i++) {
      const f = wells.features[i]
      if (!activeWellTypes.has(f.properties.type as WellType)) continue

      const [lon, lat] = f.geometry.coordinates
      if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) continue

      const pt = map.latLngToContainerPoint([lat, lon])
      const color = WELL_COLORS[f.properties.type] || '#999'

      if (!byColor.has(color)) byColor.set(color, [])
      byColor.get(color)!.push({ x: pt.x, y: pt.y, idx: i, lat, lon })
    }

    // Рисуем все скважины по цветам
    for (const [color, points] of byColor) {
      ctx.fillStyle = color
      ctx.strokeStyle = color
      ctx.lineWidth = 0.5
      ctx.globalAlpha = 0.85

      for (const { x, y, idx, lat, lon } of points) {
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        visWells.push({ idx, x: x * dpr, y: y * dpr, r: radius * dpr, lat, lon })
      }
    }

    visibleWellsRef.current = visWells
    ctx.globalAlpha = 1
  }, [wells, activeWellTypes, map])

  useMapEvents({
    moveend: () => { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = requestAnimationFrame(draw) },
    zoomend: () => { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = requestAnimationFrame(draw) },
    resize: () => { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = requestAnimationFrame(draw) },
  })

  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(draw)
  }, [draw])

  return null
}
