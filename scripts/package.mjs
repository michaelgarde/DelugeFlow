#!/usr/bin/env node

/**
 * Package the extension for distribution
 * Creates a ZIP file from the dist/ directory
 */

import { createReadStream, createWriteStream, readFileSync } from 'fs';
import { createInterface } from 'readline';
import archiver from 'archiver';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Read version from manifest
const manifest = JSON.parse(readFileSync(path.join(rootDir, 'dist', 'manifest.json'), 'utf8'));
const version = manifest.version;
const zipFileName = `DelugeFlow-${version}.zip`;
const outputPath = path.join(rootDir, 'releases', zipFileName);

// Create releases directory if it doesn't exist
import { mkdirSync, existsSync } from 'fs';
const releasesDir = path.join(rootDir, 'releases');
if (!existsSync(releasesDir)) {
  mkdirSync(releasesDir, { recursive: true });
}

// Create ZIP archive
const output = createWriteStream(outputPath);
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

output.on('close', () => {
  const sizeKB = (archive.pointer() / 1024).toFixed(2);
  console.log(`\n✓ Package created: ${zipFileName}`);
  console.log(`  Location: releases/${zipFileName}`);
  console.log(`  Size: ${sizeKB} KB`);
  console.log(`  Files: ${archive.pointer()} bytes`);
});

archive.on('error', (err) => {
  throw err;
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

// Pipe archive to output file
archive.pipe(output);

// Add dist/ directory to archive
console.log(`\n📦 Packaging DelugeFlow v${version}...`);
archive.directory(path.join(rootDir, 'dist'), false);

// Finalize archive
archive.finalize();
