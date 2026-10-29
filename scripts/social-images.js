#!/usr/bin/env node
// Social sharing images (Open Graph, 1200 x 630) for the calculator pages,
// in the guide PDFs' style: the calculator's name, its icon and the
// Lyfeguard logo on navy. The images live in each Tools item's Social Image
// field in Webflow (editable there); this makes one for a new calculator.
//   node scripts/social-images.js "Mortgage Calculator" [icon.svg] [out.png]
// icon.svg: the calculator's icon (the CMS Icon field's SVG). out.png
// defaults to out/social/<name>.png.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'pdf-generator/assets');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The icon from the CMS Icon (SVG) field: just the <svg>, without anything
// that could run.
function icon(richText) {
  const m = /<svg[\s\S]*?<\/svg>/i.exec(richText || '');
  if (!m) return '';
  return m[0].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '');
}

function html({ name, svg }) {
  const font = (file, weight) => `@font-face{font-family:Manrope;font-weight:${weight};src:url('${pathToFileURL(path.join(ASSETS, 'fonts', file)).href}')}`;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>
${font('Manrope-Bold.ttf', 700)}${font('Manrope-ExtraBold.ttf', 800)}${font('Manrope-Medium.ttf', 500)}
*{box-sizing:border-box}html,body{margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#051A22;color:#fff;font-family:Manrope,sans-serif;position:relative}
.wrap{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;justify-content:space-between;align-items:center}
.top img{height:44px}
.top span{font-size:22px;font-weight:500;color:#B9CFCF}
.eyebrow{margin:0 0 20px;font-size:22px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3FD8B5}
h1{margin:0;max-width:${svg ? 760 : 1000}px;font-size:76px;line-height:1.05;font-weight:800;letter-spacing:-.01em}
.foot{font-size:24px;font-weight:500;color:#D6E3E3}
.bar{position:absolute;left:0;right:0;bottom:0;height:10px;background:#3FD8B5}
.icon{position:absolute;right:72px;top:50%;transform:translateY(-42%);width:250px;height:250px;color:#3FD8B5;display:grid;place-items:center;border-radius:40px;background:rgba(63,216,181,.08)}
.icon svg{width:150px;height:150px}
.icon svg,.icon svg *{stroke:#3FD8B5}
.icon svg{stroke-width:1.1}
</style></head><body>
<div class="wrap">
  <div class="top"><img src="${pathToFileURL(path.join(ASSETS, 'logo/lyfeguard-white.svg')).href}" alt=""><span>lyfeguard.com/tools</span></div>
  <div><p class="eyebrow">Free UK calculator</p><h1>${esc(name)}</h1></div>
  <div class="foot">Free and private: your figures stay on your device.</div>
</div>
${svg ? `<div class="icon">${svg}</div>` : ''}
<div class="bar"></div>
</body></html>`;
}

// PNG of one item's image.
async function render(browser, item) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  try {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lg-social-'));
    const file = path.join(dir, 'image.html');
    fs.writeFileSync(file, html(item));
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

if (require.main === module) {
  const [name, svgFile, outFile] = process.argv.slice(2);
  if (!name) {
    console.error('Usage: node scripts/social-images.js "<calculator name>" [icon.svg] [out.png]');
    process.exitCode = 2;
  } else {
    const out = outFile || path.join(ROOT, 'out/social', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png');
    (async () => {
      const { chromium } = require('playwright');
      const browser = await chromium.launch();
      try {
        const png = await render(browser, { name, svg: icon(svgFile ? fs.readFileSync(svgFile, 'utf8') : '') });
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, png);
        console.log('Wrote ' + path.relative(process.cwd(), out));
      } finally {
        await browser.close();
      }
    })().catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
module.exports = { html, icon, render };
