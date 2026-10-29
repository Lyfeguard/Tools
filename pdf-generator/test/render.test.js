// Renders the sample guide and checks the tidied page and the PDF.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const config = require('../config.json');
const { openPage, renderPdf } = require('../lib/render');
const items = require('./fixtures/sample/items.json');
const faqs = require('./fixtures/sample/faqs.json');
const authors = require('./fixtures/sample/authors.json');

const data = { item: items[0], faqs, author: authors[0], cfg: config.collections.guides, site: config };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-pdf-'));
let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the page is tidied for print', async () => {
  const { page } = await openPage(browser, data, path.join(dir, 'sample.html'));
  try {
    const r = await page.evaluate(() => ({
      embeds: document.querySelectorAll('[data-rt-embed-type]').length,
      scripts: document.querySelectorAll('main script').length,
      styled: document.querySelectorAll('main [style]').length,
      h2: [...document.querySelectorAll('.article h2')].map((h) => h.id),
      toc: [...document.querySelectorAll('#toc a')].map((a) => a.getAttribute('href')),
      tables: document.querySelectorAll('.article .table > table').length,
      faqTables: document.querySelectorAll('.faq table').length,
      links: [...document.querySelectorAll('.article a, .faq a')].map((a) => a.getAttribute('href')),
      faqs: document.querySelectorAll('.faq').length,
      cta: document.querySelector('.cta a.btn').href,
      fonts: document.fonts.check('800 12pt Manrope'),
    }));
    assert.equal(r.embeds, 0);
    assert.equal(r.scripts, 0);
    assert.equal(r.styled, 0);
    assert.deepEqual(r.h2, ['first-section', 'second-section', 'section-1']);
    assert.deepEqual(r.toc, ['#first-section', '#second-section', '#section-1', '#faqs']);
    assert.equal(r.tables, 1);
    assert.equal(r.faqTables, 0, 'tables in FAQ answers repeat the article, so they are dropped');
    assert.deepEqual(r.links, ['https://www.lyfeguard.com/tools/net-worth-calculator', 'https://example.com/page', 'https://www.lyfeguard.com/guides/other']);
    assert.equal(r.faqs, 2);
    assert.match(r.cta, /^https:\/\/app\.lyfeguard\.com\/register\?utm_source=lyfeguard-pdf&utm_medium=download&utm_campaign=sample-guide$/);
    assert.ok(r.fonts, 'Manrope loads from assets/fonts');
  } finally {
    await page.close();
  }
});

test('a PDF is written', async () => {
  const out = path.join(dir, 'sample.pdf');
  const pdf = await renderPdf(browser, data, out);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(fs.statSync(out).size > 20000);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pages >= 2, `expected a cover and at least one page, got ${pages}`);
});
