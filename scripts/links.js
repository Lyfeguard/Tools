#!/usr/bin/env node
// Writes the "Use these figures" links (markup/links.js) into each
// calculator's markup (markup/<key>.html), just before its result bar, which
// stays the calculator's last element.
//   node scripts/links.js           update markup/*.html
//   node scripts/links.js --check   list the markup that's out of date
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LINKS = require('../markup/links');
const CMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'webflow/cms-items.json'), 'utf8'));
const NAV = /\n*[ \t]*<nav class="lgc-next"[\s\S]*?<\/nav>\n*/;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function nav(links) {
  const out = ['<nav class="lgc-next" aria-label="Use these figures in another calculator">', '  <h2 class="lgc-next-title">Use these figures</h2>', '  <ul>'];
  for (const link of links) {
    if (!CMS.items[link.to]) throw new Error('No CMS item for ' + link.to);
    out.push('    <li><a href="/tools/' + CMS.items[link.to].slug + '" data-handoff="' + link.to + '">' + esc(link.text) + '</a></li>');
  }
  return out.concat('  </ul>', '</nav>').join('\n');
}

// Before the result bar (and the live region just before it).
function place(markup, links) {
  const clean = markup.replace(NAV, '\n\n');
  if (!links || !links.length) return clean;
  let at = clean.lastIndexOf('<div class="lgc-sticky"');
  if (at < 0) throw new Error('No result bar to place the links before');
  at = clean.lastIndexOf('\n', at) + 1;
  const before = clean.slice(0, at).replace(/\s+$/, '');
  const live = before.lastIndexOf('\n') + 1;
  if (/^\s*<p class="lgc-sr-only" aria-live/.test(before.slice(live))) at = live;
  const indent = /^[ \t]*/.exec(clean.slice(at))[0];
  return clean.slice(0, at).replace(/\s+$/, '') + '\n\n' + nav(links).split('\n').map((l) => indent + l).join('\n') + '\n\n' + clean.slice(at).replace(/^\s+/, indent);
}

function stale() {
  return fs.readdirSync(path.join(ROOT, 'markup')).filter((f) => f.endsWith('.html')).map((f) => {
    const key = f.replace('.html', '');
    const file = path.join(ROOT, 'markup', f);
    const markup = fs.readFileSync(file, 'utf8');
    return { key, file, markup, next: place(markup, LINKS[key]) };
  }).filter((m) => m.next !== m.markup);
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const out = stale();
  if (!check) out.forEach((m) => fs.writeFileSync(m.file, m.next));
  console.log(out.length ? (check ? 'Out of date: ' : 'Updated: ') + out.map((m) => m.key).join(', ') : 'Every calculator\'s links are up to date.');
  if (check && out.length) process.exitCode = 1;
}
module.exports = { place, stale };
