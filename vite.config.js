import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sessionSyncPlugin } from './vite-plugin-session-sync.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    sessionSyncPlugin()
  ],
  // GitHub Pages base path - must match your repository name
  // Repo "circa-zhong" → URL is username.github.io/circa-zhong/ so base is "/circa-zhong/"
  // If it's the root of username.github.io, use "/"
  base: process.env.NODE_ENV === 'production' ? '/circa-zhong/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      external: (id) => {
        // Mark Node.js built-ins and sqlite3 as external (won't be bundled)
        return id === 'sqlite3' || 
               id === 'path' || 
               id === 'os' || 
               id === 'fs' ||
               id === 'module' ||
               id.startsWith('node:');
      }
    }
  },
  // Externalize Node.js modules that shouldn't be bundled for browser
  optimizeDeps: {
    exclude: ['sqlite3', 'path', 'os', 'fs'] // Exclude Node.js modules from pre-bundling
  },
  ssr: {
    noExternal: ['sqlite3'] // Allow in SSR if needed
  }
})
