import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api và /socket.io về server để cookie phiên cùng origin (không cần CORS khi dev).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true }
    }
  }
});
