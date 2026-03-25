import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CAPACITOR=true → mobile build (relative paths)
// FIREBASE=true  → Firebase Hosting (root /)
// default        → GitHub Pages (/kalamkas-app/)
const isMobile   = process.env.CAPACITOR === 'true'
const isFirebase = process.env.FIREBASE === 'true'

export default defineConfig({
  plugins: [react()],
  base: isMobile ? './' : isFirebase ? '/' : '/kalamkas-app/',
})
