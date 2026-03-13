import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CAPACITOR=true → mobile build (relative paths)
// default → GitHub Pages
const isMobile = process.env.CAPACITOR === 'true'

export default defineConfig({
  plugins: [react()],
  base: isMobile ? './' : '/kalamkas-app/',
})
