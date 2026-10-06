import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: 'Shop Mẹ CaCao',
        short_name: 'Mẹ CaCao',
        description: 'Quản lý kho Shop Mẹ CaCao - local first',
        theme_color: '#fff8f5',
        background_color: '#fff8f5',
        display: 'standalone',
        start_url: './'
      }
    })
  ],
  server: {proxy: {'/api': 'http://localhost:3001'}}
})
