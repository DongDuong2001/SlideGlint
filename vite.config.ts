import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  clearScreen: false,
  // Electron loads the production renderer with file://, so build assets must be relative.
  base: command === 'build' ? './' : '/',
  server: {
    port: 5173,
    strictPort: true,
  },
}));
