/**
 * Кроссплатформенная геолокация.
 *
 * В нативном приложении (Capacitor/Android) используется плагин
 * @capacitor/geolocation: корректный запрос runtime-разрешений и стабильный
 * GPS-поток (WebView-геолокация на Android работает ненадёжно).
 * В браузере — стандартный navigator.geolocation.
 *
 * Сигнатуры повторяют Web Geolocation API, коды ошибок совместимы:
 * 1 — доступ запрещён, 2 — недоступно, 3 — таймаут.
 */
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export interface GeoError {
  code: number
  message: string
}

export interface GeoOptions {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}

type OkCb = (pos: GeolocationPosition) => void
type ErrCb = (err: GeoError) => void

const isNative = Capacitor.isNativePlatform()

export function geoAvailable(): boolean {
  return isNative || 'geolocation' in navigator
}

function toGeoError(e: unknown): GeoError {
  const err = e as { code?: unknown; message?: unknown }
  const message = String(err?.message ?? e ?? 'Unknown geolocation error')
  if (typeof err?.code === 'number') return { code: err.code, message }
  if (/denied|permission/i.test(message)) return { code: 1, message }
  if (/timeout|timed out/i.test(message)) return { code: 3, message }
  return { code: 2, message }
}

/** Запросить разрешение на геолокацию (только native, на вебе браузер спросит сам) */
async function ensureNativePermission(): Promise<void> {
  let status = await Geolocation.checkPermissions()
  if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
    status = await Geolocation.requestPermissions()
  }
  if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
    throw { code: 1, message: 'Location permission denied' }
  }
}

export function geoGetCurrentPosition(ok: OkCb, err?: ErrCb, opts?: GeoOptions): void {
  if (!isNative) {
    navigator.geolocation.getCurrentPosition(ok, err, opts)
    return
  }
  ;(async () => {
    await ensureNativePermission()
    const pos = await Geolocation.getCurrentPosition(opts)
    ok(pos as unknown as GeolocationPosition)
  })().catch((e) => err?.(toGeoError(e)))
}

export interface GeoWatch {
  clear: () => void
}

export function geoWatchPosition(ok: OkCb, err?: ErrCb, opts?: GeoOptions): GeoWatch {
  if (!isNative) {
    const id = navigator.geolocation.watchPosition(ok, err, opts)
    return { clear: () => navigator.geolocation.clearWatch(id) }
  }

  // Нативный watchPosition асинхронный — id приходит позже.
  // Если clear() вызвали до получения id, снимаем watch сразу после получения.
  let cleared = false
  let watchId: string | null = null
  ;(async () => {
    await ensureNativePermission()
    const id = await Geolocation.watchPosition(opts ?? {}, (pos, e) => {
      if (e) {
        err?.(toGeoError(e))
        return
      }
      if (pos) ok(pos as unknown as GeolocationPosition)
    })
    if (cleared) await Geolocation.clearWatch({ id })
    else watchId = id
  })().catch((e) => err?.(toGeoError(e)))

  return {
    clear: () => {
      cleared = true
      if (watchId) {
        Geolocation.clearWatch({ id: watchId })
        watchId = null
      }
    },
  }
}
