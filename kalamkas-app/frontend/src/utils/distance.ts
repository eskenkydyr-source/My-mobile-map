export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const p1 = lat1 * Math.PI / 180
  const p2 = lat2 * Math.PI / 180
  const dp = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export interface GraphNode { lat: number; lon: number; type: string }

export function nearestNode(lat: number, lon: number, nodes: GraphNode[], maxDist = 5000): number | null {
  let bestIdx: number | null = null
  let bestDist = Infinity
  nodes.forEach((n, i) => {
    const d = haversine(lat, lon, n.lat, n.lon)
    if (d < bestDist && d <= maxDist) { bestDist = d; bestIdx = i }
  })
  return bestIdx
}
