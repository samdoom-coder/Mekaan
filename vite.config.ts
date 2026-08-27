import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// @ts-ignore - vitest types augment vite config
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/projects": { target: "http://localhost:8000", changeOrigin: true },
      "/api/projects": { target: "http://localhost:8000", changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, "") },
      "/ai": { target: "http://localhost:8000", changeOrigin: true },
      "/api/ai": { target: "http://localhost:8000", changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, "") },
      "/health": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  // @ts-ignore
  test: {
    globals: true,
    environment: "jsdom",
  },
} as any)
