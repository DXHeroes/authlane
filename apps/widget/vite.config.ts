import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/embed.ts',
      name: 'AuthlaneWidget',
      fileName: (format) => `authlane-widget.${format}.js`,
      formats: ['iife', 'es']
    },
    rollupOptions: {
      output: {
        assetFileNames: 'authlane-widget.[ext]'
      }
    }
  },
  server: {
    port: 3003
  }
});
