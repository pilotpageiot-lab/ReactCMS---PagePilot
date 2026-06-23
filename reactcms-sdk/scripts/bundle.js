/**
 * Bundle script for ReactCMS SDK.
 *
 * The SDK is maintained as a hand-written UMD bundle in dist/sdk.js
 * (not compiled from TypeScript source) because it needs to be a single
 * self-contained file with no dependencies, ES5-compatible, and include
 * the PagePilot edit-mode module.
 *
 * This script:
 * 1. Validates dist/sdk.js exists
 * 2. Creates a minified version at dist/sdk.min.js
 * 3. Reports file sizes
 */

const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const srcFile = path.join(distDir, 'sdk.js');
const minFile = path.join(distDir, 'sdk.min.js');

if (!fs.existsSync(srcFile)) {
  console.error('ERROR: dist/sdk.js not found. The SDK bundle is maintained manually.');
  process.exit(1);
}

const source = fs.readFileSync(srcFile, 'utf8');

// Basic minification: strip comments, collapse whitespace, remove blank lines
let minified = source
  // Remove block comments (but keep the top banner)
  .replace(/\/\*[\s\S]*?\*\//g, (match, offset) => offset === 0 ? match : '')
  // Remove single-line comments (but not URLs with //)
  .replace(/(?<!:)\/\/[^\n]*/g, '')
  // Collapse multiple blank lines
  .replace(/\n\s*\n\s*\n/g, '\n\n')
  // Trim trailing whitespace per line
  .replace(/[ \t]+$/gm, '')
  // Collapse leading whitespace to single spaces (keep structure readable)
  .replace(/\n[ \t]{2,}/g, '\n  ');

fs.writeFileSync(minFile, minified, 'utf8');

const srcSize = (fs.statSync(srcFile).size / 1024).toFixed(1);
const minSize = (fs.statSync(minFile).size / 1024).toFixed(1);

console.log(`SDK bundle ready:`);
console.log(`  dist/sdk.js     ${srcSize} KB`);
console.log(`  dist/sdk.min.js ${minSize} KB`);
