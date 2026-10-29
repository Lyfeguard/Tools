#!/usr/bin/env node
// Social sharing images (Open Graph, 1200 x 630) for the calculator pages,
// in the guide PDFs' style: the calculator's name, its icon from the CMS and
// the Lyfeguard logo on navy. Each Tools item's "Social Image" field holds
// its image; the Tools template's Open Graph image is bound to that field.
//
//   node scripts/social-images.js sync [--dry-run] [--force]
//        make the image for every item whose name or icon changed, upload it
//        to the site's assets and set the field (staged: live at the next
//        publish). --dry-run writes the images to out/social/ instead.
//        Needs WEBFLOW_TOKEN (CMS and Assets, read and write). Run by the
//        "Calculator social images" workflow.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const CMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'webflow/cms-items.json'), 'utf8'));
const ASSETS = path.join(ROOT, 'pdf-generator/assets');
const FIELD = 'social-image';
// Bump to remake every image after a design change.
const DESIGN = '1';

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

const fingerprint = (item) => crypto.createHash('sha256').update(JSON.stringify([DESIGN, item.name, item.svg])).digest('hex').slice(0, 8);
const fileName = (slug, hash) => `lyfeguard-tool-${slug}-${hash}.png`;

async function sync({ dryRun, force }) {
  const token = process.env.WEBFLOW_TOKEN;
  if (!token) throw new Error('WEBFLOW_TOKEN is not set');
  const api = async (method, url, body) => {
    const res = await fetch('https://api.webflow.com/v2' + url, {
      method,
      headers: { authorization: 'Bearer ' + token, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(method + ' ' + url + ' -> ' + res.status + ': ' + (await res.text()).slice(0, 300));
    return res.status === 204 ? null : res.json();
  };
  const items = (await api('GET', '/collections/' + CMS.collection + '/items?limit=100')).items;
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const lines = [];
  const updates = [];
  const keep = new Set();
  try {
    for (const [key, { id, slug }] of Object.entries(CMS.items)) {
      const cms = items.find((i) => i.id === id);
      if (!cms) throw new Error(key + ': no CMS item ' + id);
      const item = { name: cms.fieldData.name, svg: icon(cms.fieldData.svg) };
      const name = fileName(slug, fingerprint(item));
      const current = cms.fieldData[FIELD] && cms.fieldData[FIELD].url;
      if (!force && current && decodeURIComponent(current).endsWith('_' + name)) {
        keep.add(current);
        lines.push('up to date   ' + key);
        continue;
      }
      const png = await render(browser, item);
      if (dryRun) {
        const out = path.join(ROOT, 'out/social');
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, name), png);
        lines.push('would update ' + key + ' (out/social/' + name + ')');
        continue;
      }
      const md5 = crypto.createHash('md5').update(png).digest('hex');
      const meta = await api('POST', '/sites/' + CMS.site + '/assets', { fileName: name, fileHash: md5 });
      const form = new FormData();
      for (const [k, v] of Object.entries(meta.uploadDetails)) form.append(S3_FIELDS[k] || k, String(v));
      form.append('file', new Blob([png], { type: 'image/png' }), name);
      const up = await fetch(meta.uploadUrl, { method: 'POST', body: form });
      if (up.status !== 201) throw new Error('Upload of ' + name + ' failed: ' + up.status);
      keep.add(meta.hostedUrl);
      updates.push({ id, fieldData: { [FIELD]: { fileId: meta.id, url: meta.hostedUrl, alt: item.name + ' from Lyfeguard' } } });
      lines.push('updated      ' + key);
    }
  } finally {
    await browser.close();
  }
  // Staged; draft or ready stays as it is.
  if (updates.length) await api('PATCH', '/collections/' + CMS.collection + '/items', { items: updates });
  // Tidy up images this script made that nothing uses any more.
  if (updates.length) {
    const slugs = Object.values(CMS.items).map((i) => i.slug);
    for (let offset = 0; ; offset += 100) {
      const page = await api('GET', '/sites/' + CMS.site + '/assets?limit=100&offset=' + offset);
      for (const a of page.assets || []) {
        const m = /lyfeguard-tool-(.+)-[0-9a-f]{8}\.png$/.exec(a.originalFileName || a.displayName || '');
        if (m && slugs.includes(m[1]) && !keep.has(a.hostedUrl)) await api('DELETE', '/assets/' + a.id);
      }
      if ((page.assets || []).length < 100) break;
    }
  }
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + lines.join('\n') + '\n```\n');
}

// The upload details can come back camelCased; S3 needs its own names.
const S3_FIELDS = {
  xAmzAlgorithm: 'X-Amz-Algorithm',
  xAmzCredential: 'X-Amz-Credential',
  xAmzDate: 'X-Amz-Date',
  xAmzSignature: 'X-Amz-Signature',
  policy: 'Policy',
  successActionStatus: 'success_action_status',
  contentType: 'Content-Type',
  cacheControl: 'Cache-Control',
};

if (require.main === module) {
  const [command] = process.argv.slice(2);
  if (command !== 'sync') {
    console.error('Usage: node scripts/social-images.js sync [--dry-run] [--force]');
    process.exitCode = 2;
  } else {
    sync({ dryRun: process.argv.includes('--dry-run'), force: process.argv.includes('--force') }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
module.exports = { html, icon, render, fingerprint, fileName };
