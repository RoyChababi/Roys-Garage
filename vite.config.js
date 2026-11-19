import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works at roychababi.github.io/Roys-Garage/ (hash routing, no server rewrites needed).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, host: true },
});
