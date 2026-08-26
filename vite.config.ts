import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile()
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}']
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    },
    // Dùng bản ORT nạp wasm ngoài (từ /PaddleOCR-Models/ort/) thay vì bản bundle nhúng base64
    conditions: ['onnxruntime-web-use-extern-wasm', 'module', 'browser', 'import']
  },
  worker: {
    format: 'es'
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false
  },
  server: {
    port: 3000,
    host: true
  }
});
