/**
 * Загрузчик данных с автообновлением с GitHub Pages.
 * 
 * Логика:
 * 1. При запуске пробует скачать свежие данные с GitHub Pages
 * 2. Если удалось — использует их (и сохраняет в localStorage как кеш)
 * 3. Если нет интернета — берёт из кеша или из встроенных файлов
 */

// URL GitHub Pages — поменяй на свой если репозиторий другой
const GITHUB_PAGES_BASE = 'https://eskenkydyr-source.github.io/kalamkas-app/'

const DATA_FILES = {
  wells: 'data/wells.geojson',
  bkns: 'data/bkns.geojson',
  gu: 'data/gu.geojson',
  graph: 'data/graph.json',
} as const

const CACHE_PREFIX = 'kalamkas_cache_'
const CACHE_TIME_KEY = 'kalamkas_cache_time'

/**
 * Попытаться скачать файл с GitHub Pages (таймаут 5 сек)
 */
async function fetchRemote(filename: string): Promise<any | null> {
  try {
    const url = `${GITHUB_PAGES_BASE}${filename}?t=${Date.now()}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Загрузить из встроенных файлов (локальные, зашитые в APK)
 */
async function fetchLocal(base: string, filename: string): Promise<any> {
  const res = await fetch(`${base}${filename}`)
  return res.json()
}

/**
 * Сохранить данные в кеш (localStorage)
 */
function saveToCache(key: string, data: any) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data))
    localStorage.setItem(CACHE_TIME_KEY, new Date().toISOString())
  } catch {
    // localStorage может быть заполнен — игнорируем
  }
}

/**
 * Загрузить из кеша
 */
function loadFromCache(key: string): any | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export interface LoadedData {
  wells: any
  bkns: any
  gu: any
  graph: any
  source: 'remote' | 'cache' | 'local'
}

/**
 * Главная функция — загружает все данные.
 * Приоритет: GitHub Pages → кеш → встроенные файлы
 */
export async function loadAllData(localBase: string): Promise<LoadedData> {
  // 1. Пробуем GitHub Pages
  const [rWells, rBkns, rGu, rGraph] = await Promise.all([
    fetchRemote(DATA_FILES.wells),
    fetchRemote(DATA_FILES.bkns),
    fetchRemote(DATA_FILES.gu),
    fetchRemote(DATA_FILES.graph),
  ])

  // Если хотя бы graph скачался — считаем что remote работает
  if (rGraph && rWells) {
    // Сохраняем в кеш
    saveToCache('wells', rWells)
    saveToCache('bkns', rBkns)
    saveToCache('gu', rGu)
    saveToCache('graph', rGraph)

    return {
      wells: rWells,
      bkns: rBkns,
      gu: rGu,
      graph: rGraph,
      source: 'remote',
    }
  }

  // 2. Пробуем кеш
  const cWells = loadFromCache('wells')
  const cGraph = loadFromCache('graph')
  if (cGraph && cWells) {
    return {
      wells: cWells,
      bkns: loadFromCache('bkns'),
      gu: loadFromCache('gu'),
      graph: cGraph,
      source: 'cache',
    }
  }

  // 3. Встроенные файлы
  const [lWells, lBkns, lGu, lGraph] = await Promise.all([
    fetchLocal(localBase, DATA_FILES.wells),
    fetchLocal(localBase, DATA_FILES.bkns),
    fetchLocal(localBase, DATA_FILES.gu),
    fetchLocal(localBase, DATA_FILES.graph),
  ])

  return {
    wells: lWells,
    bkns: lBkns,
    gu: lGu,
    graph: lGraph,
    source: 'local',
  }
}

/**
 * Время последнего обновления из кеша
 */
export function getLastUpdateTime(): string | null {
  return localStorage.getItem(CACHE_TIME_KEY)
}
