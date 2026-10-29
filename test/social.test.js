// Social sharing images (scripts/social-images.js): the right size, the
// calculator's name, and nothing from the CMS icon that could run.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { html, icon, render } = require('../scripts/social-images');

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

const SVG = '<div data-rt-embed-type="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#082C37" onload="alert(1)"><script>alert(2)</script><path d="M4 4h16v16H4z"/></svg></div>';

test('the image is 1200 x 630', async () => {
  const png = await render(browser, { name: 'Mortgage Calculator', svg: icon(SVG) });
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});

test('the name is escaped, and the icon keeps only its drawing', () => {
  const svg = icon(SVG);
  assert.ok(svg.startsWith('<svg') && svg.includes('<path'));
  assert.ok(!/onload|<script|alert/.test(svg));
  assert.match(html({ name: 'A <b>&</b> B', svg: '' }), /A &lt;b&gt;&amp;&lt;\/b&gt; B/);
  assert.equal(icon('<p>no icon</p>'), '');
});
