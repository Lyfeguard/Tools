#!/usr/bin/env node
// Writes each calculator's worked example (markup/examples.js) into its
// markup (markup/<key>.html): runs the calculator in a browser with the
// example's figures and puts what it shows into the sentences, so the page
// HTML has real, quotable figures that are always the calculator's own.
// Needs the built files (npm run build first).
//   node scripts/examples.js           update markup/*.html
//   node scripts/examples.js --check   list the examples that are out of date
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT, openCalculator, run } = require('../test/page');
const EXAMPLES = require('../markup/examples');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SECTION = /\n*[ \t]*<section class="lgc-example"[\s\S]*?<\/section>\n*/;
const NEXT = /\n*[ \t]*<nav class="lgc-next"[\s\S]*?<\/nav>\n*/;
const CMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'webflow/cms-items.json'), 'utf8'));

function html(example, values) {
  const v = (id) => {
    if (!(id in values)) throw new Error('No element #' + id);
    return values[id];
  };
  const paragraphs = example.text(v).map((p) => '  <p>' + esc(p) + '</p>');
  if (example.sources.length) paragraphs.push('  <p class="lgc-example-sources">Figures from ' + esc(example.sources.join('; ')) + '.</p>');
  const out = ['<section class="lgc-example" aria-label="Worked example">', '  <h2 class="lgc-example-title">' + esc(example.title) + '</h2>', ...paragraphs, '</section>'];
  // Links to calculators that take these figures on, as plain links in the
  // page (useful to search engines too); the figures go as they're clicked.
  if (example.next && example.next.length) {
    out.push('', '<nav class="lgc-next" aria-label="Use these figures in another calculator">', '  <h2 class="lgc-next-title">Use these figures</h2>', '  <ul>');
    for (const link of example.next) {
      if (!CMS.items[link.to]) throw new Error('No CMS item for ' + link.to);
      out.push('    <li><a href="/tools/' + CMS.items[link.to].slug + '" data-handoff="' + link.to + '">' + esc(link.text) + '</a></li>');
    }
    out.push('  </ul>', '</nav>');
  }
  return out.join('\n');
}

// Before the result bar (and the live region just before it), so the bar
// stays the calculator's last element.
function place(markup, section) {
  const clean = markup.replace(NEXT, '\n\n').replace(SECTION, '\n\n');
  let at = clean.lastIndexOf('<div class="lgc-sticky"');
  if (at < 0) throw new Error('No result bar to place the example before');
  at = clean.lastIndexOf('\n', at) + 1;
  const before = clean.slice(0, at).replace(/\s+$/, '');
  const live = before.lastIndexOf('\n') + 1;
  if (/^\s*<p class="lgc-sr-only" aria-live/.test(before.slice(live))) at = live;
  const indent = /^[ \t]*/.exec(clean.slice(at))[0];
  return clean.slice(0, at).replace(/\s+$/, '') + '\n\n' + section.split('\n').map((l) => indent + l).join('\n') + '\n\n' + clean.slice(at).replace(/^\s+/, indent);
}

async function values(browser, key, steps) {
  const page = await openCalculator(browser, key, { version: 'v2' });
  await run(page, steps);
  const out = await page.evaluate(() => {
    const root = document.querySelector('lg-calculator').shadowRoot;
    const all = {};
    root.querySelectorAll('[id]').forEach((el) => (all[el.id] = el.textContent.replace(/\s+/g, ' ').trim()));
    return all;
  });
  await page.close();
  return out;
}

async function main() {
  const check = process.argv.includes('--check');
  const browser = await chromium.launch();
  const stale = [];
  try {
    for (const [key, example] of Object.entries(EXAMPLES)) {
      const file = path.join(ROOT, 'markup', key + '.html');
      const markup = fs.readFileSync(file, 'utf8');
      const next = place(markup, html(example, await values(browser, key, example.steps)));
      if (next === markup) continue;
      stale.push(key);
      if (!check) fs.writeFileSync(file, next);
    }
  } finally {
    await browser.close();
  }
  console.log(stale.length ? (check ? 'Out of date: ' : 'Updated: ') + stale.join(', ') : 'Every example is up to date.');
  if (check && stale.length) process.exitCode = 1;
}
if (require.main === module) main();
module.exports = { html, place, values };
