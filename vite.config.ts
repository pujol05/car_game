import { defineConfig } from 'vitest/config';

// El joc es publica com a lloc de projecte a GitHub Pages
// (https://pujol05.github.io/car_game/), per això el build necessita la
// ruta base amb el nom del repositori. En desenvolupament es fa servir
// l'arrel perquè el servidor local segueix funcionant a localhost:5173.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/car_game/' : '/',
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
}));
