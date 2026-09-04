import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vite preview server does not inherit server.proxy, so share the same rules.
const proxy = {
  '/api': {
    target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
    changeOrigin: true,
  },
  '/ws': {
    target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
    changeOrigin: true,
    ws: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['.box-dex.win', 'kanban-board.box-dex.win'],
    watch: {
      usePolling: true,
      interval: 200,
    },
    proxy,
  },
  preview: {
    proxy,
  },
})
