import { useState, useEffect } from 'react'
import { getAllSync, clearSync } from '../utils/idb'

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Проверяем очередь синхронизации
  useEffect(() => {
    const check = async () => {
      try {
        const items = await getAllSync()
        setPendingCount(items.length)
      } catch {}
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  // Когда возвращается сеть — автосинхронизация
  useEffect(() => {
    if (!online || pendingCount === 0) return

    const sync = async () => {
      setSyncing(true)
      try {
        const items = await getAllSync()
        for (const item of items) {
          if (item.type === 'graph_save') {
            // Повторяем сохранение в Firebase
            const { ref, uploadBytes } = await import('firebase/storage')
            const { doc, setDoc, addDoc, collection } = await import('firebase/firestore')
            const { storage, db, auth } = await import('../firebase')

            const payload = item.payload
            const jsonBytes = new TextEncoder().encode(JSON.stringify(payload.data))
            const blob = new Blob([jsonBytes], { type: 'application/json' })

            const graphRef = ref(storage, 'graph/current.json')
            await uploadBytes(graphRef, blob, { contentType: 'application/json' })

            const now = new Date().toISOString()
            const userEmail = auth.currentUser?.email || payload.email || 'offline'

            await setDoc(doc(db, 'graph', 'current'), {
              updatedAt: now,
              updatedBy: userEmail,
              nodeCount: payload.nodeCount,
              edgeCount: payload.edgeCount,
            })

            await addDoc(collection(db, 'graph_history'), {
              savedAt: now,
              savedBy: userEmail + ' (offline sync)',
              nodeCount: payload.nodeCount,
              edgeCount: payload.edgeCount,
            })
          }
        }
        await clearSync()
        setPendingCount(0)
      } catch (e) {
        console.warn('[Kalamkas] Sync failed:', e)
      } finally {
        setSyncing(false)
      }
    }

    sync()
  }, [online, pendingCount])

  // Не показываем баннер если всё ок
  if (online && pendingCount === 0) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
      padding: '6px 12px', fontSize: 12, fontWeight: 600, textAlign: 'center',
      background: !online ? '#7f1d1d' : syncing ? '#92400e' : '#065f46',
      color: '#fff',
    }}>
      {!online && '📡 Нет сети — работаете офлайн'}
      {online && syncing && `🔄 Синхронизация (${pendingCount})...`}
      {online && !syncing && pendingCount > 0 && `✅ Синхронизировано`}
    </div>
  )
}
