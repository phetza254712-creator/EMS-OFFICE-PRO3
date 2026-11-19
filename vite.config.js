import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs are required for Electron file:// loading and Capacitor bundles.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false
  },
  server: { host: '0.0.0.0' }
});
