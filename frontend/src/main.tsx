import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { useStore } from './store/useStore'
import './index.css'
import App from './App.tsx'

// Кнопка «Назад» на Android: сначала выходим из режимов, потом из приложения
if (Capacitor.isNativePlatform()) {
  CapApp.addListener('backButton', () => {
    const s = useStore.getState()
    if (s.navActive) s.setNavActive(false)
    else if (s.routeSelectMode) s.setRouteSelectMode(null)
    else if (s.markerMode) s.setMarkerMode(false)
    else if (s.selectedObject) s.setSelectedObject(null)
    else CapApp.exitApp()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
