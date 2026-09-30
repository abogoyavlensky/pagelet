import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The build lands in ../resources/public/app, which `lgx build` embeds in
// the binary; the server serves it under /app/ from one flat route
// (/app/:file), hence assetsDir "". The /app/ base is for the build only:
// the dev server serves the app at / (so /login and /sites work there) and
// proxies the API and the tracker to `lgx run` on :8080.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === 'build' ? '/app/' : '/',
  build: {
    outDir: '../resources/public/app',
    emptyOutDir: true,
    assetsDir: '',
    // Recharts makes the one chunk ~640 kB (190 kB gzipped). It ships in
    // the binary and is cached for a day; splitting buys little here.
    chunkSizeWarningLimit: 800,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/p.js': 'http://localhost:8080',
    },
  },
}))
