import { defineConfig } from 'vite';

// Relative base: the same build works on GitHub Pages (/repo/) and any other static host.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  server: { host: '127.0.0.1', port: 5173 },
});
