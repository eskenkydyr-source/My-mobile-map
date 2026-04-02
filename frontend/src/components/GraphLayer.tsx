/**
 * GraphLayer — Canvas-рендер графа дорог.
 * Рисует только узлы и рёбра в видимой области карты.
 * Заменяет тысячи <CircleMarker> на один Canvas → не зависает.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { GraphNode } from '../utils/distance'

interface GraphLayerProps {
  nodes: GraphNode[]
  edges: [number, number, number][]
  editMode: boolean
  editSubmode: string
  selectedNodeIdx: number | null
  onNodeClick: (idx: number, e?: any) => void
  onEdgeClick: (edgeIdx: number, e?: any) => void
}

// Буфер вокруг viewport (в градусах) чтобы не мигало при скролле
const BUFFER = 0.02

export default function GraphLayer({
  nodes, edges, editMode, editSubmode, selectedNodeIdx,
  onNodeClick, onEdgeClick,
}: GraphLayerProps) {
  const map = useMap()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number>(0)
  // Кеш: какие узлы видимы (для обработки кликов)
  const visibleNodesRef = useRef<{ idx: number; x: number; y: number; r: number }[]>([])
  const visibleEdgesRef = useRef<{ idx: number; x1: number; y1: number; x2: number; y2: number }[]>([])

  // Создаём Canvas overlay при монтировании
  useEffect(() => {
    const size = map.getSize()
    const canvas = L.DomUtil.create('canvas', 'graph-canvas') as HTMLCanvasElement
    canvas.width = size.x * (window.devicePixelRatio || 1)
    canvas.height = size.y * (window.devicePixelRatio || 1)
    canvas.style.width = size.x + 'px'
    canvas.style.height = size.y + 'px'
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.pointerEvents = 'auto'
    canvas.style.zIndex = '450' // над тайлами, под попапами

    const pane = map.getPane('overlayPane')
    if (pane) pane.appendChild(canvas)
    canvasRef.current = canvas

    // Обработчик кликов на canvas
    const handleClick = (e: MouseEvent) => {
      if (!editMode) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const cx = (e.clientX - rect.left) * dpr
      const cy = (e.clientY - rect.top) * dpr

      // Проверяем клик по узлу (приоритет)
      for (const { idx, x, y, r } of visibleNodesRef.current) {
        const dist = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2)
        if (dist <= r + 6 * dpr) { // +6px tolerance
          onNodeClick(idx)
          e.stopPropagation()
          return
        }
      }

      // Проверяем клик по ребру
      if (editSubmode === 'deledge') {
        for (const { idx, x1, y1, x2, y2 } of visibleEdgesRef.current) {
          const distToLine = pointToSegmentDist(cx, cy, x1, y1, x2, y2)
          if (distToLine <= 8 * dpr) {
            onEdgeClick(idx)
            e.stopPropagation()
            return
          }
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

  // Отрисовка
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const size = map.getSize()
    canvas.width = size.x * dpr
    canvas.height = size.y * dpr
    canvas.style.width = size.x + 'px'
    canvas.style.height = size.y + 'px'

    // Синхронизируем позицию canvas с картой
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

    // Определяем видимые узлы
    const nodeVisible = new Uint8Array(nodes.length)
    const nodeScreen: Float64Array = new Float64Array(nodes.length * 2)

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      if (n.lat >= minLat && n.lat <= maxLat && n.lon >= minLon && n.lon <= maxLon) {
        nodeVisible[i] = 1
        const pt = map.latLngToContainerPoint([n.lat, n.lon])
        nodeScreen[i * 2] = pt.x
        nodeScreen[i * 2 + 1] = pt.y
      }
    }

    // Рёбра
    const visEdges: { idx: number; x1: number; y1: number; x2: number; y2: number }[] = []
    const edgeColor = editMode && editSubmode === 'deledge' ? '#f97316' : editMode ? '#a78bfa' : '#374151'
    const edgeWidth = editMode && editSubmode === 'deledge' ? 3 : editMode ? 1.5 : 1.5
    const edgeAlpha = editMode ? 0.8 : 0.7

    ctx.strokeStyle = edgeColor
    ctx.lineWidth = edgeWidth
    ctx.globalAlpha = edgeAlpha
    ctx.beginPath()

    for (let i = 0; i < edges.length; i++) {
      const [fromIdx, toIdx] = edges[i]
      if (fromIdx >= nodes.length || toIdx >= nodes.length) continue

      // Рисуем ребро если хотя бы один конец видим
      if (!nodeVisible[fromIdx] && !nodeVisible[toIdx]) continue

      // Вычисляем экранные координаты (если ещё не вычислены)
      if (!nodeVisible[fromIdx]) {
        const pt = map.latLngToContainerPoint([nodes[fromIdx].lat, nodes[fromIdx].lon])
        nodeScreen[fromIdx * 2] = pt.x
        nodeScreen[fromIdx * 2 + 1] = pt.y
      }
      if (!nodeVisible[toIdx]) {
        const pt = map.latLngToContainerPoint([nodes[toIdx].lat, nodes[toIdx].lon])
        nodeScreen[toIdx * 2] = pt.x
        nodeScreen[toIdx * 2 + 1] = pt.y
      }

      const x1 = nodeScreen[fromIdx * 2], y1 = nodeScreen[fromIdx * 2 + 1]
      const x2 = nodeScreen[toIdx * 2], y2 = nodeScreen[toIdx * 2 + 1]

      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)

      if (editMode && editSubmode === 'deledge') {
        visEdges.push({ idx: i, x1: x1 * dpr, y1: y1 * dpr, x2: x2 * dpr, y2: y2 * dpr })
      }
    }
    ctx.stroke()

    // Рисуем не в editMode — рёбра с разными цветами по типу узлов
    if (!editMode) {
      // Перерисовываем с учётом типов
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      for (let i = 0; i < edges.length; i++) {
        const [fromIdx, toIdx] = edges[i]
        if (fromIdx >= nodes.length || toIdx >= nodes.length) continue
        if (!nodeVisible[fromIdx] && !nodeVisible[toIdx]) continue

        const aType = nodes[fromIdx].type, bType = nodes[toIdx].type
        let color = '#374151'; let weight = 1.5
        if (aType === 'bkns' || bType === 'bkns') { color = '#fff'; weight = 2.5 }
        else if (aType === 'gu' || bType === 'gu') { color = '#f59e0b'; weight = 2 }

        const x1 = nodeScreen[fromIdx * 2], y1 = nodeScreen[fromIdx * 2 + 1]
        const x2 = nodeScreen[toIdx * 2], y2 = nodeScreen[toIdx * 2 + 1]

        ctx.strokeStyle = color
        ctx.lineWidth = weight
        ctx.globalAlpha = 0.7
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }

    visibleEdgesRef.current = visEdges

    // Узлы (только в editMode)
    if (editMode) {
      const visNodes: { idx: number; x: number; y: number; r: number }[] = []
      const isMobile = window.innerWidth <= 768

      for (let i = 0; i < nodes.length; i++) {
        if (!nodeVisible[i]) continue

        const n = nodes[i]
        const x = nodeScreen[i * 2]
        const y = nodeScreen[i * 2 + 1]
        const isSelected = selectedNodeIdx === i

        const baseColor = n.type === 'bkns' ? '#3b82f6' : n.type === 'gu' ? '#f59e0b' : '#a78bfa'
        const color = editSubmode === 'del' ? '#ef4444'
          : isSelected ? '#22c55e'
          : baseColor
        const radius = isSelected ? (isMobile ? 16 : 10)
          : editSubmode === 'del' ? (isMobile ? 12 : 7)
          : (isMobile ? 9 : 5)

        ctx.globalAlpha = 0.9
        ctx.fillStyle = color
        ctx.strokeStyle = color
        ctx.lineWidth = isSelected ? 3 : 2
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        visNodes.push({ idx: i, x: x * dpr, y: y * dpr, r: radius * dpr })
      }

      visibleNodesRef.current = visNodes
    } else {
      visibleNodesRef.current = []
    }

    ctx.globalAlpha = 1
  }, [nodes, edges, editMode, editSubmode, selectedNodeIdx, map])

  // Перерисовка при каждом движении карты
  useMapEvents({
    moveend: () => { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = requestAnimationFrame(draw) },
    zoomend: () => { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = requestAnimationFrame(draw) },
    resize: () => { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = requestAnimationFrame(draw) },
  })

  // Перерисовка при изменении данных
  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(draw)
  }, [draw])

  return null
}

// Расстояние от точки до отрезка (для клика по ребру)
function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = x1 + t * dx, projY = y1 + t * dy
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}
