import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    modulePreload: { polyfill: false },
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) return 'react-vendor';
          if (id.includes('node_modules/react/'))    return 'react-vendor';
          if (id.includes('node_modules/react-router')) return 'router';
          if (id.includes('node_modules/firebase'))  return 'firebase';
        },
      },
    },
  },
})
