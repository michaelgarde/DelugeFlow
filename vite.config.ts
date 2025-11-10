import { defineConfig } from 'vite';
import path from 'path';

/**
 * Vite configuration for DelugeFlow Chrome Extension
 *
 * Builds TypeScript modules for:
 * - Background service worker
 * - Content script
 * - Popup page
 * - Options page
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@deluge': path.resolve(__dirname, './src/deluge'),
      '@content': path.resolve(__dirname, './src/content'),
      '@config': path.resolve(__dirname, './src/config'),
      '@types': path.resolve(__dirname, './src/types'),
      '@background': path.resolve(__dirname, './src/background'),
      '@popup': path.resolve(__dirname, './src/popup'),
      '@options': path.resolve(__dirname, './src/options'),
    },
  },
  build: {
    outDir: 'build-ts',
    sourcemap: true,
    minify: false, // Keep readable for debugging
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background/background.ts'),
        content: path.resolve(__dirname, 'src/content/ContentHandler.ts'),
        popup: path.resolve(__dirname, 'src/popup/popup.ts'),
        options: path.resolve(__dirname, 'src/options/options.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        format: 'es', // ES modules (supported by Manifest V3)
      },
      external: ['chrome'], // Chrome APIs are provided by the browser
    },
  },
  define: {
    // Define environment variables if needed
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
