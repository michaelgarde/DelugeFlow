import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

/**
 * Vite configuration for DelugeFlow Chrome Extension
 *
 * Builds TypeScript modules and prepares the complete extension package
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
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false, // Set to 'terser' for production
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background/background.ts'),
        content: path.resolve(__dirname, 'src/content/ContentHandler.ts'),
        popup: path.resolve(__dirname, 'src/popup/popup.ts'),
        options: path.resolve(__dirname, 'src/options/options.ts'),
        offscreen: path.resolve(__dirname, 'src/offscreen/offscreen.ts'),
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
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
  plugins: [
    // Plugin to copy static files after build
    {
      name: 'copy-static-files',
      closeBundle() {
        const distDir = path.resolve(__dirname, 'dist');

        // Copy static files
        const filesToCopy = [
          { src: 'manifest.json', dest: 'manifest.json' },
          { src: 'popup.html', dest: 'popup.html' },
          { src: 'options.html', dest: 'options.html' },
          { src: 'offscreen.html', dest: 'offscreen.html' },
          { src: 'content_handler.css', dest: 'content_handler.css' },
          { src: 'options.css', dest: 'options.css' },
          { src: 'chrome-bootstrap.css', dest: 'chrome-bootstrap.css' },
        ];

        filesToCopy.forEach(({ src, dest }) => {
          const srcPath = path.resolve(__dirname, src);
          const destPath = path.resolve(distDir, dest);
          if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
          }
        });

        // Copy directories
        const dirsToCopy = [
          { src: 'images', dest: 'images' },
          { src: '_locales', dest: '_locales' },
          { src: 'lib', dest: 'lib' },
        ];

        dirsToCopy.forEach(({ src, dest }) => {
          const srcPath = path.resolve(__dirname, src);
          const destPath = path.resolve(distDir, dest);
          if (fs.existsSync(srcPath)) {
            fs.cpSync(srcPath, destPath, { recursive: true });
          }
        });

        console.log('✓ Static files copied to dist/');
      },
    },
  ],
});
