import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend runs on its own port and calls the API gateway (VITE_API_URL, default http://localhost:8000).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
