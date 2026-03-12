#!/usr/bin/env node
// Bundles D3.js into the UI and copies UI files to dist/ui/
const { buildSync } = require('esbuild');
const fs = require('fs');
const path = require('path');

const srcUi = path.join(__dirname, '../src/ui');
const distUi = path.join(__dirname, '../dist/ui');

// Ensure dist/ui exists
fs.mkdirSync(distUi, { recursive: true });

// Bundle graph.js (which imports d3) into a single file
buildSync({
  entryPoints: [path.join(srcUi, 'graph.js')],
  bundle: true,
  minify: false,
  outfile: path.join(distUi, 'graph.bundle.js'),
  format: 'iife',
  platform: 'browser',
});

// Copy all other UI files as-is
const filesToCopy = ['index.html', 'picker.html', 'app.js', 'explorer.js', 'architect.js',
  'panel.js', 'errorTrace.js', 'featureAdvisor.js', 'blastRadius.js',
  'filters.js', 'tour.js', 'styles.css'];

for (const file of filesToCopy) {
  const src = path.join(srcUi, file);
  const dest = path.join(distUi, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file}`);
  }
}

console.log('UI build complete → dist/ui/');

// Mark CLI as executable on non-Windows
if (process.platform !== 'win32') {
  const cliPath = path.join(__dirname, '../dist/cli.js');
  try { fs.chmodSync(cliPath, 0o755); } catch (_) {}
}
