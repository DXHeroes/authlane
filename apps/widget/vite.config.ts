import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/connect/',
  server: {
    port: 3003,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
