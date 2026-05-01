// Build script: copies site files into /dist and optimizes images.
// Image sizing rules based on filename keyword:
//   hero    -> max 1920px
//   about   -> max 900px
//   endorser-> max 250px
//   logo    -> max 400px
//   else    -> max 1200px
// All raster images are also written as .webp at 82% quality.
//
// If sharp is not installed, falls back to copying images as-is.

const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DIST = path.join(SRC, 'dist');

let sharp = null;
try { sharp = require('sharp'); }
catch (e) { console.warn('[build] sharp not installed; copying images without optimization.'); }

const COPY_FILES = [
  'index.html',
  'site-config.json',
  '_redirects',
  'netlify.toml',
  'robots.txt'
];

const RASTER_EXT = ['.jpg', '.jpeg', '.png'];

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  // Walk and unlink files first; tolerate Dropbox/network FS permission quirks.
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        try { fs.rmdirSync(p); } catch (err) { /* ignore */ }
      } else {
        try { fs.unlinkSync(p); } catch (err) { /* ignore */ }
      }
    }
  };
  walk(dir);
  try { fs.rmdirSync(dir); } catch (err) { /* ignore */ }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function maxWidthFor(filename) {
  const f = filename.toLowerCase();
  if (f.includes('hero')) return 1920;
  if (f.includes('about')) return 900;
  if (f.includes('endorser')) return 250;
  if (f.includes('logo')) return 400;
  return 1200;
}

async function processImage(srcPath, dstPath) {
  const ext = path.extname(srcPath).toLowerCase();
  const name = path.basename(srcPath);
  if (!sharp || !RASTER_EXT.includes(ext)) {
    copyFile(srcPath, dstPath);
    return;
  }
  const maxW = maxWidthFor(name);
  ensureDir(path.dirname(dstPath));
  try {
    const meta = await sharp(srcPath).metadata();
    const pipeline = sharp(srcPath);
    if (meta.width && meta.width > maxW) {
      pipeline.resize({ width: maxW, withoutEnlargement: true });
    }
    if (ext === '.png') {
      await pipeline.clone().png({ compressionLevel: 9, quality: 85 }).toFile(dstPath);
    } else {
      await pipeline.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(dstPath);
    }
    // Also write a webp sibling.
    const webpPath = dstPath.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    await sharp(srcPath)
      .resize({ width: maxW, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(webpPath);
    console.log('[build] optimized', path.relative(SRC, srcPath));
  } catch (err) {
    console.warn('[build] image processing failed for', srcPath, err.message);
    copyFile(srcPath, dstPath);
  }
}

async function walkAndCopy(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await walkAndCopy(s, d);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (RASTER_EXT.includes(ext)) {
        await processImage(s, d);
      } else {
        copyFile(s, d);
      }
    }
  }
}

async function main() {
  console.log('[build] cleaning dist/');
  rmDir(DIST);
  ensureDir(DIST);

  for (const f of COPY_FILES) {
    const src = path.join(SRC, f);
    if (fs.existsSync(src)) copyFile(src, path.join(DIST, f));
  }

  await walkAndCopy(path.join(SRC, 'images'), path.join(DIST, 'images'));

  console.log('[build] done. Output:', DIST);
}

main().catch(err => { console.error(err); process.exit(1); });
