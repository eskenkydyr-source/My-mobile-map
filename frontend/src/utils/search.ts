export interface SearchResult {
  name: string
  lat: number
  lon: number
  type: 'well' | 'bkns' | 'gu'
}

export function searchObjects(
  query: string,
  wells: any,
  bkns: any,
  gu: any
): SearchResult[] {
  const q = query.toLowerCase().trim()
  if (!q || q.length < 2) return []
  const results: SearchResult[] = []

  wells?.features?.forEach((f: any) => {
    const p = f.properties
    if (
      p.well_num?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q)
    ) {
      const [lon, lat] = f.geometry.coordinates
      results.push({ name: p.name || `Скважина ${p.well_num}`, lat, lon, type: 'well' })
    }
  })

  bkns?.features?.forEach((f: any) => {
    const p = f.properties
    if (p.NAME?.toLowerCase().includes(q)) {
      const coords = f.geometry.coordinates[0]
      const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length
      const lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length
      results.push({ name: p.NAME, lat, lon, type: 'bkns' })
    }
  })

  gu?.features?.forEach((f: any) => {
    const p = f.properties
    const name = p.NAME || p.FIND || ''
    if (name.toLowerCase().includes(q)) {
      const coords = f.geometry.coordinates[0]
      const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length
      const lon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length
      results.push({ name, lat, lon, type: 'gu' })
    }
  })

  return results.slice(0, 20)
}
