import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: './renderer',
  plugins: [react()],
  base: './',
  publicDir: '../static',
  build: {
    outDir: '../build/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'renderer/src'),
    },
  },
});
