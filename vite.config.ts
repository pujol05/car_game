import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    host: 'localhost',
    port: 5173,
  },
  build: {
    // three.js ocupa uns 550 kB minificat; és esperable en aquest projecte.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
