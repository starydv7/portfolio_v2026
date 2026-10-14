#!/usr/bin/env node
/*
 * Embeds the portrait cutout into index.html as a data URI.
 *
 * Why: when index.html is opened by double-click (file://), browsers treat a
 * separate image file as cross-origin, which blocks WebGL from reading its
 * pixels. The page then silently falls back to the flat <img>. Inlining the
 * image makes the 3D "volumetric" portrait work from file:// too.
 *
 * Usage:
 *   node tools/inline-portrait.js [portrait.webp | portrait.png]
 *
 * Run again any time you replace the photo. Pass "--reset" to restore the
 * external-file reference (src="portrait.webp").
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = path.join(root, 'index.html');
let src = fs.readFileSync(html, 'utf8');

// <img id="pimg" src="..."  -> replace the src value only
const re = /(<img id="pimg" src=")([^"]*)(")/;
if (!re.test(src)) {
  console.error('Could not find <img id="pimg"> in index.html');
  process.exit(1);
}

if (process.argv[2] === '--reset') {
  src = src.replace(re, '$1portrait.webp$3');
  fs.writeFileSync(html, src);
  console.log('Restored src="portrait.webp"');
  process.exit(0);
}

const file = process.argv[2] || ['portrait.webp', 'portrait.png'].map(f => path.join(root, f)).find(fs.existsSync);
if (!file || !fs.existsSync(file)) {
  console.error('Portrait not found. Put portrait.webp or portrait.png next to index.html, or pass a path.');
  process.exit(1);
}
const ext = path.extname(file).toLowerCase();
const mime = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : null;
if (!mime) {
  console.error('Use a WebP or PNG with an alpha channel.');
  process.exit(1);
}
const b64 = fs.readFileSync(file).toString('base64');
src = src.replace(re, `$1data:${mime};base64,${b64}$3`);
fs.writeFileSync(html, src);
console.log(`Inlined ${path.basename(file)} (${(b64.length / 1024).toFixed(0)} KB base64) into index.html`);
