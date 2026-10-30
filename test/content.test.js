// Content blocks for rich text (src/lg-content.css, docs/content-blocks.md):
// styled the same on a Guides page and a Tools page, whatever the site's
// rich-text styles, and the CSV-to-embed script (scripts/table.js).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT } = require('./page');
const { parse, table } = require('../scripts/table');

const BLOCKS = `<h2>Do first-time buyers pay stamp duty?</h2>
<div class="lg-answer"><p>Not on the first \u00A3300,000 in England and Northern Ireland.</p></div>
<div class="lg-table"><table><caption>Stamp duty</caption><thead><tr><th scope="col">Price</th><th scope="col">Tax</th></tr></thead>
<tbody><tr><th scope="row">\u00A3250,000</th><td>\u00A30</td></tr><tr><th scope="row">\u00A3350,000</th><td>\u00A32,500</td></tr></tbody></table><p>Rates from 1 April 2025.</p></div>
<div class="lg-note"><p><strong>Scotland and Wales:</strong> different taxes apply.</p></div>
<div class="lg-answer lg-summary"><div class="w-richtext"><ul><li>One point.</li><li>Another point.</li></ul></div></div>`;

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

// The blocks in Webflow's rich text, with the site's CSS, and the given stylesheet.
async function looks(css) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-content-'));
  const file = path.join(dir, 'page.html');
  fs.writeFileSync(
    file,
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${path.join(__dirname, 'fixtures', 'webflow-site.css')}">
<link rel="stylesheet" href="file://${path.join(ROOT, css)}"></head>
<body><div class="w-richtext">${BLOCKS.replace(/(<div class="lg-[a-z]+">[\s\S]*?<\/div>)(?=\n|$)/g, '<div class="w-embed">$1</div>')}</div></body></html>`,
  );
  const page = await browser.newPage();
  await page.route(/^https?:/, (route) => route.abort());
  await page.goto('file://' + file);
  const out = await page.evaluate(() => {
    const style = (sel, prop, pseudo) => getComputedStyle(document.querySelector(sel), pseudo || null)[prop];
    return {
      tableRadius: style('.lg-table table', 'borderTopLeftRadius'),
      headBg: style('.lg-table thead th', 'backgroundColor'),
      bandBg: style('.lg-table tbody tr:nth-child(2) td', 'backgroundColor'),
      figureAlign: style('.lg-table td', 'textAlign'),
      noteColour: style('.lg-table > p', 'color'),
      answerBg: style('.lg-answer', 'backgroundColor'),
      answerBorder: style('.lg-answer', 'borderLeftColor'),
      answerText: style('.lg-answer p', 'color'),
      answerLabel: style('.lg-answer', 'content', '::before'),
      calloutBg: style('.lg-note', 'backgroundColor'),
      calloutText: style('.lg-note p', 'color'),
      summaryLabel: style('.lg-summary', 'content', '::before'),
      summaryList: style('.lg-summary li', 'color') + ' ' + style('.lg-summary li', 'fontSize') + ' ' + style('.lg-summary ul', 'listStyleType'),
    };
  });
  await page.close();
  return out;
}

const EXPECTED = {
  tableRadius: '10px',
  headBg: 'rgb(230, 255, 245)',
  bandBg: 'rgb(240, 255, 249)',
  figureAlign: 'right',
  noteColour: 'rgb(88, 112, 121)',
  answerBg: 'rgb(240, 255, 249)',
  answerBorder: 'rgb(10, 163, 118)',
  answerText: 'rgb(10, 45, 58)',
  answerLabel: '"Short answer"',
  calloutBg: 'rgb(230, 255, 245)',
  calloutText: 'rgb(10, 45, 58)',
  summaryLabel: '"Executive summary"',
  summaryList: 'rgb(10, 45, 58) 16px disc',
};

test('content blocks: styled on Guides and Insights pages (dist/lg-content.min.css), over the site\u2019s rich text', async () => {
  assert.deepEqual(await looks('dist/lg-content.min.css'), EXPECTED);
});

test('content blocks: styled the same on every calculator page', async () => {
  for (const key of ['stamp-duty', 'net-worth', 'take-home-pay']) assert.deepEqual(await looks(`dist/v2/${key}.min.css`), EXPECTED, key);
});

test('content blocks: lg-content.min.css is small and ASCII-only', () => {
  const css = fs.readFileSync(path.join(ROOT, 'dist/lg-content.min.css'), 'utf8');
  assert.ok(/^\/\*! Lyfeguard content blocks \| lg-content\.css \| v\d/.test(css));
  assert.ok(!/[^\x00-\x7f]/.test(css));
  assert.ok(require('zlib').gzipSync(css).length < 2000);
});

test('scripts/table.js: a CSV becomes the table embed, escaped', () => {
  const csv = '\uFEFFPrice,"Home mover","Notes"\r\n"\u00A3250,000","\u00A32,500","Says ""hi"" <b>"\r\n\r\n';
  assert.deepEqual(parse(csv), [['Price', 'Home mover', 'Notes'], ['\u00A3250,000', '\u00A32,500', 'Says "hi" <b>']]);
  const html = table(csv, { caption: 'Tax & duty', note: 'From 1 April 2025.' });
  assert.equal(
    html,
    [
      '<div class="lg-table">',
      '  <table>',
      '    <caption>Tax &amp; duty</caption>',
      '    <thead>',
      '      <tr><th scope="col">Price</th><th scope="col">Home mover</th><th scope="col">Notes</th></tr>',
      '    </thead>',
      '    <tbody>',
      '      <tr><th scope="row">\u00A3250,000</th><td>\u00A32,500</td><td>Says &quot;hi&quot; &lt;b&gt;</td></tr>',
      '    </tbody>',
      '  </table>',
      '  <p>From 1 April 2025.</p>',
      '</div>',
    ].join('\n'),
  );
  assert.match(table(csv, { caption: 'Words', text: true }), /^<div class="lg-table lg-table-text">/);
  assert.throws(() => table(csv, {}), /caption/);
  assert.throws(() => table('A,B\n1\n', { caption: 'x' }), /Row 2 has 1 cells/);
});
