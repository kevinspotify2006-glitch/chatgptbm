import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build runs from a domain root as well as from a
  // project sub-path (GitHub Pages, preview deployments).
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: true,
  },
});
