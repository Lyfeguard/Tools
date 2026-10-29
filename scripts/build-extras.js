#!/usr/bin/env node
// Build the files loaded when someone downloads a PDF:
//   lg-dl.js   the email-gated download dialog (src/lg-dl.js with
//              src/lg-dl.css), shared by the Guides and the calculators
//   lg-pdf.js  the calculators' PDF maker (src/v2/pdf.js), with the logo
//              from pdf-generator/assets/logo as PDF drawing operators
// Run through npm run build (scripts/build.sh), which minifies them.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const version = /LG\.version = '([^']+)'/.exec(read('src/v2/prelude.js'))[1];

function css(file) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-dl-'));
  const out = path.join(tmp, 'out.css');
  execFileSync('npx', ['--yes', '-p', 'csso-cli@4.0.2', 'csso', path.join(ROOT, file), '--no-restructure', '-o', out], { stdio: 'inherit' });
  const min = fs.readFileSync(out, 'utf8').trim();
  fs.rmSync(tmp, { recursive: true, force: true });
  return min;
}

// The SVG's paths (absolute M, L, H, V, C and Z only, as Figma writes them)
// and rounded rectangles, as PDF operators in the SVG's own units.
function logo(file) {
  const svg = read(file);
  const n = (v) => String(+(+v).toFixed(2));
  const colour = (fill) => {
    const hex = fill === 'white' ? 'ffffff' : fill.replace('#', '');
    return [0, 2, 4].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ') + ' rg';
  };
  const ops = [];
  for (const [tag] of svg.matchAll(/<(path|rect)\b[^>]*>/g)) {
    const attr = (name) => (new RegExp('\\s' + name + '="([^"]*)"').exec(tag) || [])[1];
    if (!attr('fill') || attr('fill') === 'none') continue;
    ops.push(colour(attr('fill')));
    if (tag.startsWith('<rect')) {
      const [x, y, w, h, r] = ['x', 'y', 'width', 'height', 'rx'].map((a) => +(attr(a) || 0));
      const c = r * 0.4477;
      ops.push(`${n(x + r)} ${n(y)} m ${n(x + w - r)} ${n(y)} l ${n(x + w - c)} ${n(y)} ${n(x + w)} ${n(y + c)} ${n(x + w)} ${n(y + r)} c ${n(x + w)} ${n(y + h - r)} l ${n(x + w)} ${n(y + h - c)} ${n(x + w - c)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c ${n(x + r)} ${n(y + h)} l ${n(x + c)} ${n(y + h)} ${n(x)} ${n(y + h - c)} ${n(x)} ${n(y + h - r)} c ${n(x)} ${n(y + r)} l ${n(x)} ${n(y + c)} ${n(x + c)} ${n(y)} ${n(x + r)} ${n(y)} c h f`);
      continue;
    }
    const tokens = attr('d').match(/[A-Za-z]|-?(?:\d+\.\d*|\.\d+|\d+)(?:e[-+]?\d+)?/g);
    let x = 0;
    let y = 0;
    let cmd = '';
    const out = [];
    for (let i = 0; i < tokens.length; ) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
      const take = (k) => tokens.slice(i, (i += k)).map(Number);
      if (cmd === 'M' || cmd === 'L') {
        [x, y] = take(2);
        out.push(`${n(x)} ${n(y)} ${cmd === 'M' ? 'm' : 'l'}`);
        if (cmd === 'M') cmd = 'L';
      } else if (cmd === 'H') {
        [x] = take(1);
        out.push(`${n(x)} ${n(y)} l`);
      } else if (cmd === 'V') {
        [y] = take(1);
        out.push(`${n(x)} ${n(y)} l`);
      } else if (cmd === 'C') {
        const p = take(6);
        [x, y] = p.slice(4);
        out.push(p.map(n).join(' ') + ' c');
      } else if (cmd === 'Z') {
        out.push('h');
      } else throw new Error(file + ': unsupported path command ' + cmd);
    }
    ops.push(out.join(' ') + (attr('fill-rule') === 'evenodd' ? ' f*' : ' f'));
  }
  return ops.join(' ');
}

const out = process.argv[2] || path.join(ROOT, 'dist');
const ascii = (s) => s.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
fs.mkdirSync(path.join(out, 'v2'), { recursive: true });
fs.writeFileSync(path.join(out, 'lg-dl.js'), ascii(read('src/lg-dl.js').replace('VERSION', 'v' + version).replace("'/* @css */'", () => JSON.stringify(css('src/lg-dl.css')))));
fs.writeFileSync(path.join(out, 'v2/lg-pdf.js'), ascii(read('src/v2/pdf.js').replace('VERSION', 'v' + version).replace("'/* @logo */'", () => JSON.stringify(logo('pdf-generator/assets/logo/lyfeguard-white.svg')))));
console.log('Wrote lg-dl.js and v2/lg-pdf.js in ' + path.relative(process.cwd(), out));
