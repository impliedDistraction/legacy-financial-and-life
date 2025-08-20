const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { execSync } = require('child_process');

const imagesDir = path.join(__dirname, '..', 'public', 'images');
const outputs = [400, 800, 1200];

async function processImage(srcName) {
  const src = path.join(imagesDir, srcName);
  if (!fs.existsSync(src)) {
    return;
  }
  const ext = path.extname(srcName).toLowerCase();
  const base = path.basename(srcName, ext);

  for (const w of outputs) {
    const outJpg = path.join(imagesDir, `${base}-${w}w.jpg`);
    const outWebp = path.join(imagesDir, `${base}-${w}w.webp`);
    await sharp(src).resize({ width: w }).jpeg({ quality: 80 }).toFile(outJpg);
    await sharp(src).resize({ width: w }).webp({ quality: 80 }).toFile(outWebp);
    console.log('wrote', outJpg, outWebp);
  }
}

async function traceLogo() {
  const png = path.join(imagesDir, 'logo.png');
  const svg = path.join(imagesDir, 'logo.svg');
  if (!fs.existsSync(png)) {
    return;
  }
  try {
    const tmpBmp = path.join(imagesDir, 'logo.bmp');
    await sharp(png).flatten({ background: '#ffffff' }).resize({ width: 256 }).toFile(tmpBmp);
    execSync(`potrace -s ${tmpBmp} -o ${svg}`);
    fs.unlinkSync(tmpBmp);
    console.log('wrote', svg);
  } catch (err) {
    console.error('SVG trace failed (potrace required). Skipping SVG generation.', err.message);
  }
}

(async () => {
  // Only process original images (ignore already-generated files that include "-<width>w" in the name)
  const files = fs.readdirSync(imagesDir).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/\-\d+w\./.test(f));
  for (const f of files) {
    if (f.startsWith('logo')) {
      continue;
    }
    await processImage(f);
  }
  await traceLogo();
  console.log('image generation complete');
})();
