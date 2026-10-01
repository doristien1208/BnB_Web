import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  base: './',
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    // The game server runs on 3000 during development; the browser only talks to Vite.
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
});
