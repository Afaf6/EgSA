import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-redux', 'react-router-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-redux', 'react-router-dom'],
  },
  server: {
    port: process.env.VITE_PORT ? Number(process.env.VITE_PORT) : 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})


