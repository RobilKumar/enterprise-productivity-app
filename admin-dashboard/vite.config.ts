import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },

  // Only used by `npm run dev` — not relevant for production/mobile builds
  server: {
    port: 3001,
    proxy: {
      '/api':       { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: mode !== 'mobile',   // skip sourcemaps in mobile builds to reduce APK size
    // Capacitor requires an absolute base path of './' so assets load correctly
    // inside the native WebView (which has no real origin).
    ...(mode === 'mobile' ? { base: './' } : {}),
    rollupOptions: {
      output: {
        // Keep chunk sizes reasonable for the WebView
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          http:   ['axios'],
        },
      },
    },
  },
}));
