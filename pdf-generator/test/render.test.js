// Renders the sample guide and checks the tidied page and the PDF.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const config = require('../config.json');
const { openPage, renderPdf, LAUNCH } = require('../lib/render');
const items = require('./fixtures/sample/items.json');
const faqs = require('./fixtures/sample/faqs.json');
const authors = require('./fixtures/sample/authors.json');

const data = { item: items[0], faqs, author: authors[0], cfg: config.collections.guides, site: config };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-pdf-'));
let browser;
before(async () => {
  browser = await chromium.launch(LAUNCH);
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
    assert.deepEqual(r.links, ['https://lyfeguard.com/tools/net-worth-calculator', 'https://example.com/page', 'https://lyfeguard.com/guides/other']);
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

test('an insight: its own field names, Sources and the demo call to action', async () => {
  const insight = structuredClone(items[0]);
  insight.fieldData['cta-subheading'] = 'See how firms use Lyfeguard.';
  insight.fieldData['cta-button-text'] = 'Book a demo';
  insight.fieldData.sources = '<p><a href="/guides/example">Example source</a>, FCA 2026</p>';
  const cfg = config.collections.insights;
  const { page } = await openPage(browser, { ...data, item: insight, cfg }, path.join(dir, 'insight.html'));
  try {
    const r = await page.evaluate(() => ({
      top: document.querySelector('.band .top span').textContent,
      sources: document.querySelector('.sources') && document.querySelector('.sources').textContent,
      link: document.querySelector('.sources a').getAttribute('href'),
      cta: document.querySelector('.cta h2 + p').textContent,
      button: document.querySelector('.cta a.btn').href,
    }));
    assert.match(r.top, /^Insight/);
    assert.match(r.sources, /Sources.*Example source, FCA 2026/);
    assert.equal(r.link, config.siteUrl + '/guides/example', 'relative links made absolute');
    assert.equal(r.cta, 'See how firms use Lyfeguard.');
    assert.match(r.button, new RegExp('^' + cfg.ctaUrl.replace(/[.?]/g, '\\$&') + '\\?utm_source=lyfeguard-pdf'));
  } finally {
    await page.close();
  }
});

test('the short answer (Guides) and executive summary (Insights) come before the article', async () => {
  const guide = structuredClone(items[0]);
  guide.fieldData['quick-answer'] = 'Yes: <most> people should.';
  const insight = structuredClone(items[0]);
  insight.fieldData['executive-summarys'] = '<ul><li style="color:red">First point.</li><li>Second point.</li></ul>';
  const read = async (item, cfg, name) => {
    const { page } = await openPage(browser, { ...data, item, cfg }, path.join(dir, name + '.html'));
    try {
      return await page.evaluate(() => {
        const box = document.querySelector('.keypoints');
        return {
          label: box.querySelector('.eyebrow').textContent,
          text: [...box.querySelectorAll('p:not(.eyebrow), li')].map((n) => n.textContent),
          styled: box.querySelectorAll('[style]').length,
          beforeArticle: box.nextElementSibling.classList.contains('article'),
        };
      });
    } finally {
      await page.close();
    }
  };
  assert.deepEqual(await read(guide, config.collections.guides, 'answer'), { label: 'Short answer', text: ['Yes: <most> people should.'], styled: 0, beforeArticle: true });
  assert.deepEqual(await read(insight, config.collections.insights, 'summary'), { label: 'Executive summary', text: ['First point.', 'Second point.'], styled: 0, beforeArticle: true });
  // None set: no box.
  const { page } = await openPage(browser, data, path.join(dir, 'none.html'));
  assert.equal(await page.evaluate(() => document.querySelectorAll('.keypoints').length), 0);
  await page.close();
});
