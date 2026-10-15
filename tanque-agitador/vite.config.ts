import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  // Caminhos relativos: o app roda em /Oficina/tanque-agitador/ no GitHub Pages.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  build: {
    // three.js + recharts passam de 500 kB; separa em pedaços para cachear melhor.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) return 'graficos';
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
