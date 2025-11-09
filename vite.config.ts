import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import path from 'path';

// Note: manifest.json will be updated to use the new structure
// For now, this is a preparation for future Vite builds

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@deluge': path.resolve(__dirname, './src/deluge'),
      '@content': path.resolve(__dirname, './src/content'),
      '@config': path.resolve(__dirname, './src/config'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
  build: {
    outDir: 'build-vite',
    sourcemap: true,
    rollupOptions: {
      input: {
        // These will be created/migrated in future steps
        // background: 'src/background.ts',
        // content: 'src/content/ContentHandler.ts',
        // popup: 'src/popup.ts',
        // options: 'src/options.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  plugins: [
    // CRX plugin will be enabled once manifest is updated
    // crx({ manifest: './manifest.json' }),
  ],
});
