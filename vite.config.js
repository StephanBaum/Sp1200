import { defineConfig } from 'vite';
import { resolve } from 'path';
import { build } from 'vite';
import { writeFileSync, mkdirSync } from 'fs';

// Custom plugin to build the AudioWorklet as a self-contained IIFE
function audioWorkletPlugin() {
  return {
    name: 'audio-worklet-bundle',
    async writeBundle() {
      // Build the worklet separately as a single self-contained file
      const result = await build({
        configFile: false,
        build: {
          lib: {
            entry: resolve(__dirname, 'js/audio/sp1200-processor.js'),
            formats: ['es'],
            fileName: 'sp1200-processor',
          },
          outDir: resolve(__dirname, 'dist/js/audio'),
          emptyOutDir: false,
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
          write: true,
          minify: true,
        },
        logLevel: 'warn',
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [audioWorkletPlugin()],
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
