import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // A single vendor bucket avoids the circular chunk dependencies the
        // previous multi-way split produced (react-vendor <-> query-vendor <->
        // wagmi-vendor etc.), which could execute a chunk depending on React
        // before react-vendor finished initializing (causing "Cannot read
        // properties of undefined (reading 'createContext')" at runtime).
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
    dedupe: ['react', 'react-dom', 'react-is'],
  },
  optimizeDeps: {
    include: ['react-is'],
  },
})
