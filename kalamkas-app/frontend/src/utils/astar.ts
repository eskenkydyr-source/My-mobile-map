import { haversine } from './distance'
import type { GraphNode } from './distance'

export function buildAdj(nodes: GraphNode[], edges: [number, number, number][]): Map<number, [number, number][]> {
  const adj = new Map<number, [number, number][]>()
  nodes.forEach((_, i) => adj.set(i, []))
  edges.forEach(([from, to, dist]) => {
    adj.get(from)!.push([to, dist])
    adj.get(to)!.push([from, dist]) // граф двунаправленный
  })
  return adj
}

export function astar(
  startIdx: number,
  goalIdx: number,
  nodes: GraphNode[],
  adj: Map<number, [number, number][]>
): number[] | null {
  const goal = nodes[goalIdx]
  const gScore = new Map<number, number>([[startIdx, 0]])
  const fScore = new Map<number, number>([[startIdx, haversine(nodes[startIdx].lat, nodes[startIdx].lon, goal.lat, goal.lon)]])
  const cameFrom = new Map<number, number>()
  const openSet = new Set([startIdx])
  const closed = new Set<number>()

  while (openSet.size > 0) {
    let current = -1
    let minF = Infinity
    openSet.forEach(idx => {
      const f = fScore.get(idx) ?? Infinity
      if (f < minF) { minF = f; current = idx }
    })
    if (current === goalIdx) {
      const path: number[] = []
      let cur: number | undefined = current
      while (cur !== undefined) { path.unshift(cur); cur = cameFrom.get(cur) }
      return path
    }
    openSet.delete(current)
    closed.add(current)
    for (const [neighbor, dist] of (adj.get(current) ?? [])) {
      if (closed.has(neighbor)) continue
      const tentG = (gScore.get(current) ?? Infinity) + dist
      if (tentG < (gScore.get(neighbor) ?? Infinity)) {
        cameFrom.set(neighbor, current)
        gScore.set(neighbor, tentG)
        fScore.set(neighbor, tentG + haversine(nodes[neighbor].lat, nodes[neighbor].lon, goal.lat, goal.lon))
        openSet.add(neighbor)
      }
    }
  }
  return null
}
