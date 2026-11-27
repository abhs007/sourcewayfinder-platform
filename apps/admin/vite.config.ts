import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { outDir: '../../dist/admin', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/admin/v1': 'http://127.0.0.1:8788' },
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
});
