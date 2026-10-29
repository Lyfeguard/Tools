// PDF summaries: the button under the results, the email dialog shared with
// the Guides (dist/lg-dl.min.js) and the PDF made in the browser
// (dist/v2/lg-pdf.min.js). The PDFs are read back with poppler's pdftotext
// and pdfinfo, which also check the file is well formed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { ROOT, componentPageHtml, run } = require('./page');
const scenarios = require('./scenarios');

const FORM = '9d095c21-3177-42e8-9862-64228125f64d';
const FIXED_NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
let browser;
let server;
let base;
const pages = {};

before(async () => {
  browser = await chromium.launch();
  // Served over http: the PDF maker fetches its fonts, which file:// pages can't.
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url.startsWith('/page/')) {
      res.setHeader('content-type', 'text/html');
      return res.end(pages[url.slice(6)] || '');
    }
    const file = path.join(ROOT, path.normalize(url));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      return res.end();
    }
    if (file.endsWith('.js')) res.setHeader('content-type', 'text/javascript');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = 'http://localhost:' + server.address().port;
});
after(async () => {
  await browser.close();
  server.close();
});

// A calculator page with a heading, as on the site. remembered: someone who
// has already given their email (they get the PDF without the form).
async function open(key, { remembered = false, steps = Object.values(scenarios[key])[1] } = {}) {
  pages[key] = componentPageHtml(key, 'DIST', false)
    .replace(/file:\/\/DIST/g, base + '/dist')
    .replace('<main', `<h1>${key} calculator</h1><main`);
  const page = await browser.newPage({ acceptDownloads: true, reducedMotion: 'reduce' });
  page.lgErrors = [];
  page.requests = [];
  page.on('pageerror', (e) => page.lgErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/hsforms|ERR_FAILED/.test(m.text()) && page.lgErrors.push(m.text()));
  page.on('request', (r) => page.requests.push(r.url()));
  // Offline: HubSpot's script is refused, as an ad blocker would.
  await page.route(/hsforms\.net/, (route) => route.abort());
  await page.clock.install({ time: FIXED_NOW });
  await page.addInitScript((remembered) => {
    window.IntersectionObserver = undefined;
    if (remembered) localStorage.setItem('lg-dl-ok:calculator:' + remembered, '1');
  }, remembered && key);
  await page.goto(base + '/page/' + key);
  await page.waitForFunction(() => document.readyState === 'complete');
  await run(page, steps);
  return page;
}

async function savePdf(download) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lg-pdf-')), 'summary.pdf');
  await download.saveAs(file);
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  return { info, text, flat: text.replace(/\s+/g, ' ') };
}

// What the calculator shows in its result bar, the PDF's headline.
const headline = (page) => page.evaluate(() => {
  const s = document.querySelector('lg-calculator').shadowRoot.querySelector('.lgc-sticky');
  const id = s.getAttribute('data-source');
  const el = id ? s.getRootNode().getElementById(id) : s.querySelector('strong');
  return el.textContent.replace(/\s+/g, ' ').trim();
});

for (const key of Object.keys(scenarios)) {
  test(`${key}: the PDF summary has the figures entered and the results`, async () => {
    const page = await open(key, { remembered: true });
    const value = await headline(page);
    const inputs = await page.evaluate(() => [...document.querySelector('lg-calculator').shadowRoot.querySelectorAll('input[type="text"], input:not([type])')].map((i) => i.value).filter(Boolean));
    const download = page.waitForEvent('download');
    await page.click('.lgc-pdf-button');
    const pdf = await savePdf(await download);
    assert.match((await download).suggestedFilename(), new RegExp(`^lyfeguard-${key}-summary-2026-10-28\\.pdf$`));
    assert.match(pdf.info, /Pages:\s+[1-9]/);
    assert.match(pdf.info, new RegExp(`Title:\\s+${key} calculator`));
    assert.ok(pdf.flat.includes(value), 'headline ' + value);
    assert.ok(pdf.flat.includes('Your details'), 'the figures entered');
    for (const v of inputs) assert.ok(pdf.flat.replace(/,/g, '').includes(v.replace(/,/g, '')), 'input ' + v);
    assert.ok(pdf.flat.includes('28 October 2026'));
    assert.ok(pdf.flat.includes('Create free account'));
    assert.deepEqual(page.lgErrors, []);
    await page.close();
  });
}

test('the button shows only once there is a result, and loads nothing until pressed', async () => {
  const page = await open('mortgage', { steps: [] });
  const hidden = () => page.evaluate(() => document.querySelector('lg-calculator').shadowRoot.querySelector('.lgc-pdf').hidden);
  assert.equal(await hidden(), true);
  await run(page, Object.values(scenarios.mortgage)[1]);
  assert.equal(await hidden(), false);
  assert.deepEqual(page.requests.filter((u) => /lg-dl|lg-pdf|\.ttf|hsforms/.test(u)), [], 'nothing loaded before the click');
  await page.close();
});

test('the email dialog: HubSpot gets the name and page only, then the PDF downloads', async () => {
  const page = await open('mortgage');
  await page.click('.lgc-pdf-button');
  await page.waitForSelector('dialog.lg-dl-dialog[open]');
  assert.equal(await page.textContent('#lg-dl-heading'), 'Get your results as a PDF');
  assert.ok(await page.$(`.hs-form-frame[data-form-id="${FORM}"][data-portal-id="139576714"][data-region="eu1"]`));
  // HubSpot's script is blocked here, so the fallback link shows.
  await page.waitForSelector('.lg-dl-fallback:not([hidden])');

  // The form loads: the hidden fields say what was downloaded, never the figures.
  const fields = await page.evaluate((FORM) => {
    const set = {};
    window.HubSpotFormsV4 = { getFormFromEvent: () => ({ setFieldValue: (k, v) => (set[k] = v) }) };
    window.dispatchEvent(new CustomEvent('hs-form-event:on-ready', { detail: { formId: FORM } }));
    return set;
  }, FORM);
  assert.deepEqual(fields, { '0-1/last_resource_requested': 'mortgage calculator (PDF summary)', '0-1/last_resource_url': base + '/page/mortgage' });

  // Another HubSpot form on the page (a newsletter sign-up) changes nothing.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('hs-form-event:on-submission:success', { detail: { formId: 'another-form' } })));
  assert.equal(await page.isHidden('.lg-dl-done'), true);

  await page.evaluate((FORM) => window.dispatchEvent(new CustomEvent('hs-form-event:on-submission:success', { detail: { formId: FORM } })), FORM);
  await page.waitForSelector('.lg-dl-done:not([hidden])');
  // Remembered for this calculator only: HubSpot hears about each download.
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), ['lg-dl-ok:calculator:mortgage']);
  assert.deepEqual(await page.evaluate(() => window.dataLayer.filter((e) => e.event === 'pdf_download')), [
    { event: 'pdf_download', resource_slug: 'mortgage', resource_title: 'mortgage calculator (PDF summary)', resource_type: 'calculator' },
  ]);
  await page.waitForSelector('.lg-dl-done .lg-dl-link[download][href^="blob:"]');
  const download = page.waitForEvent('download');
  await page.click('.lg-dl-done .lg-dl-link');
  const pdf = await savePdf(await download);
  assert.ok(pdf.flat.includes('Estimated monthly repayment'));

  // Closing hands focus back to the button.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('lg-calculator').shadowRoot.activeElement?.className === 'lgc-pdf-button');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('lg-dl-lock')), false);
  assert.deepEqual(page.lgErrors, []);
  await page.close();
});

test('Guides: a .lg-dl block opens the same dialog for its PDF', async () => {
  pages.guide = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><script src="${base}/dist/lg-dl.min.js" defer></script></head><body>
<div class="lg-dl" data-pdf="https://example.com/guide.pdf" data-name="Life admin guide" data-slug="life-admin" data-title="The UK Life Admin Checklist" data-form-id="bd1160d4-2c27-4e02-a991-abb4c2319fa5" data-portal-id="139576714" data-region="eu1">
<button type="button" class="lg-dl-trigger" aria-haspopup="dialog"><span>Download PDF</span></button></div>
<div class="lg-dl" data-pdf="{{wf:PDF Download|Dynamo}}"><button type="button" class="lg-dl-trigger">Download PDF</button></div></body></html>`;
  const page = await browser.newPage();
  await page.route(/hsforms\.net/, (route) => route.abort());
  await page.goto(base + '/page/guide');
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.equal(await page.isHidden('.lg-dl[data-pdf^="{{"]'), true, 'a guide without a PDF hides its block');
  await page.click('.lg-dl-trigger');
  await page.waitForSelector('dialog.lg-dl-dialog[open]');
  assert.equal(await page.textContent('#lg-dl-heading'), 'Get The UK Life Admin Checklist');
  assert.equal(await page.getAttribute('.lg-dl-fallback .lg-dl-link', 'href'), 'https://example.com/guide.pdf');
  assert.ok(await page.$('.hs-form-frame[data-form-id="bd1160d4-2c27-4e02-a991-abb4c2319fa5"]'));
  // A returning visitor gets the PDF straight away.
  await page.keyboard.press('Escape');
  const opened = await page.evaluate(() => {
    localStorage.setItem('lg-dl-ok:guide:life-admin', '1');
    let url = null;
    window.open = (u) => (url = u);
    document.querySelector('.lg-dl-trigger').click();
    return [url, window.dataLayer.pop()];
  });
  assert.deepEqual(opened, ['https://example.com/guide.pdf', { event: 'pdf_download', resource_slug: 'life-admin', resource_title: 'Life admin guide', resource_type: 'guide', returning: true }]);
  await page.close();
});

test('remembered per guide, insight or calculator, and Insights blocks', async () => {
  pages.insight = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><script src="${base}/dist/lg-dl.min.js" defer></script></head><body>
<div class="lg-dl" data-type="insight" data-pdf="https://example.com/insight.pdf" data-name="Held-away assets" data-slug="held-away" data-title="" data-form-id="6702e583-4328-40b1-a84d-58f41a01e327">
<button type="button" class="lg-dl-trigger">Download PDF</button></div></body></html>`;
  const page = await browser.newPage();
  await page.route(/hsforms\.net/, (route) => route.abort());
  await page.goto(base + '/page/insight');
  await page.waitForFunction(() => document.readyState === 'complete');
  // An email given for a guide, or for another insight, doesn't skip this one's form.
  await page.evaluate(() => {
    localStorage.setItem('lg-dl-ok:guide:held-away', '1');
    localStorage.setItem('lg-dl-ok:insight:another', '1');
  });
  await page.click('.lg-dl-trigger');
  await page.waitForSelector('dialog.lg-dl-dialog[open]');
  assert.equal(await page.textContent('#lg-dl-heading'), 'Get this insight as a PDF');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('hs-form-event:on-submission:success', { detail: { formId: '6702e583-4328-40b1-a84d-58f41a01e327' } })));
  assert.equal(await page.evaluate(() => localStorage.getItem('lg-dl-ok:insight:held-away')), '1');
  assert.deepEqual(await page.evaluate(() => window.dataLayer.pop()), { event: 'pdf_download', resource_slug: 'held-away', resource_title: 'Held-away assets', resource_type: 'insight' });
  await page.close();
});
