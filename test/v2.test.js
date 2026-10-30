// v2: the <lg-calculator> component (dist/v2/lg-calculator.min.js).
// Parity: every scenario shows exactly what the v1 calculator shows (its saved
// snapshot). Isolation: the Webflow site's CSS and hostile rules change
// nothing inside the component.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT, openCalculator, run, readOutputs, pageHtml } = require('./page');
const scenarios = require('./scenarios');

// Calculators built into the component so far.
const KEYS = Object.keys(scenarios);
// Ids from the test page around the v1 markup, not the calculator.
const PAGE_IDS = ['calc-heading'];

// What the component should show: the v1 snapshot without the test page's
// own ids and v1's start-up marker (data-lg-ready-...).
function expectedFrom(snapshot) {
  const expected = JSON.parse(JSON.stringify(snapshot));
  PAGE_IDS.forEach((id) => delete expected[id]);
  Object.values(expected).forEach((entry) => Object.keys(entry).forEach((k) => /^data-lgReady/.test(k) && delete entry[k]));
  return expected;
}

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

for (const key of KEYS) {
  test(`${key}: the component shows the same as v1`, async (t) => {
    const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'snapshots', key + '.json'), 'utf8'));
    for (const [name, steps] of Object.entries(scenarios[key])) {
      await t.test(name, async () => {
        const page = await openCalculator(browser, key, { version: 'v2', siteCss: true });
        await run(page, steps);
        const outputs = await readOutputs(page);
        assert.deepEqual(page.lgErrors, [], 'console errors or warnings');
        await page.close();
        assert.deepEqual(outputs, expectedFrom(saved[name]));
      });
    }
  });

  test(`${key}: the site's CSS doesn't reach inside the component`, async () => {
    const steps = Object.values(scenarios[key])[1] || [];
    for (const width of [1280, 375]) {
      const bare = await componentStyles(key, steps, width, false);
      const site = await componentStyles(key, steps, width, true);
      assert.equal(site.length, bare.length);
      const differing = site.filter(([name, css], i) => bare[i][1] !== css).map(([name]) => name);
      assert.deepEqual(differing.slice(0, 10), [], `${differing.length} elements styled differently at ${width}px`);
    }
  });
}

// The Tools template with the pilot's empty <lg-calculator> Code Embed still
// in place: it shows nothing and takes no space.
test('template: an empty <lg-calculator> embed takes no space', async () => {
  for (const key of ['net-worth', 'take-home-pay']) {
    const height = (page) => page.evaluate(() => document.querySelector('.lg-calc-wrap').getBoundingClientRect().height);
    const without = await openCalculator(browser, key, { width: 375, template: { embed: false } });
    const withEmbed = await openCalculator(browser, key, { width: 375, template: { embed: true } });
    assert.equal(await height(withEmbed), await height(without), key);
    assert.deepEqual(withEmbed.lgErrors, [], key + ': console errors or warnings');
    await without.close();
    await withEmbed.close();
  }
});

for (const key of KEYS) {
  test(`${key}: in the template, v2 runs the markup from the page`, async () => {
    const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'snapshots', key + '.json'), 'utf8'));
    const [name, steps] = Object.entries(scenarios[key])[1];
    const page = await openCalculator(browser, key, { template: { embed: true } });
    await run(page, steps);
    const state = await page.evaluate(() => [...document.querySelectorAll('lg-calculator')].map((el) => [!!el.shadowRoot, el.hidden, el.children.length]));
    assert.deepEqual(state, [[true, false, 0], [false, true, 0]], 'the pasted one upgraded, the empty embed hidden');
    const outputs = await readOutputs(page);
    assert.deepEqual(page.lgErrors, [], 'console errors or warnings');
    await page.close();
    assert.deepEqual(outputs, expectedFrom(saved[name]));
  });

  // SEO: the page must be indexed exactly as with v1.
  test(`${key}: search engines see the same content as v1`, async () => {
    // Without JavaScript (crawlers that don't run it): the calculator is in
    // the HTML and shows, with the same text as v1.
    const text = async (html, js) => {
      const context = await browser.newContext({ javaScriptEnabled: js });
      const page = await context.newPage();
      const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lg-seo-'));
      fs.writeFileSync(path.join(dir, 'page.html'), html);
      await page.goto('file://' + path.join(dir, 'page.html'));
      if (js) await page.waitForFunction(() => document.readyState === 'complete');
      const out = await page.evaluate(() => {
        const host = document.querySelector('lg-calculator');
        const root = (host && host.shadowRoot) || document;
        const calc = root.querySelector('.lg-calc');
        const box = calc.getBoundingClientRect();
        return { text: calc.innerText.replace(/\s+/g, ' ').trim(), visible: box.height > 0 && box.width > 0, headings: [...root.querySelectorAll('h1, h2, h3, h4')].map((h) => h.textContent.trim()) };
      });
      await context.close();
      return out;
    };
    const dist = path.join(ROOT, 'dist');
    const v1Html = pageHtml(key, dist).replace(/<lg-calculator[^>]*>|<\/lg-calculator>/g, ''); // the markup as it was
    const v2Html = pageHtml(key, dist, 'cms', { embed: true });
    const v1NoJs = await text(v1Html, false);
    const v2NoJs = await text(v2Html, false);
    const v1 = await text(v1Html, true);
    const v2 = await text(v2Html, true);
    assert.equal(v2NoJs.visible, true, 'shows without JavaScript');
    assert.equal(v2NoJs.text, v1NoJs.text, 'same text without JavaScript');
    assert.deepEqual(v2NoJs.headings, v1NoJs.headings, 'same headings without JavaScript');
    assert.equal(v2.text, v1.text, 'same text once rendered');
    assert.deepEqual(v2.headings, v1.headings.filter((h) => h !== 'Calculator'), 'same headings once rendered');
  });
}

// v2 must look as v1 does on the site today (with the Webflow CSS), apart from
// site styles that leaked in by mistake and that v2 now keeps out:
const LEAK_FIXES = [
  '.lgc-legend, .sa-key, .lgdti-gauge-key, .lgc-notes', // lists at their designed size, not the site's 17px
  '.lgc-error-summary-title', // red, not the site's white paragraph text
  '[id$="-method-text"]', // the designed 14px, not the site's 16px paragraphs
  '.lgc-sticky', // the result bar's text at its designed size
  '.lgc-sr-only', // screen reader only
];
const LOOK = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'color', 'background-color', 'text-transform', 'text-align',
  'border-top-width', 'border-top-color', 'border-radius', 'display', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'list-style-type', 'vertical-align', 'box-sizing'];
async function looks(key, steps, width, version) {
  const page = await openCalculator(browser, key, { width, siteCss: true, version });
  await run(page, steps);
  await page.mouse.move(0, 0);
  await page.clock.runFor(100);
  const out = await page.evaluate(([LOOK, FIXES]) => {
    const host = document.querySelector('lg-calculator');
    const root = (host && host.shadowRoot) || document;
    // Leaving out v2's PDF summary button, which v1 doesn't have.
    return [...root.querySelector('.lg-calc').querySelectorAll('*')].filter((el) => !el.closest('.lgc-pdf')).map((el, i) => {
      const cs = getComputedStyle(el);
      const fixed = !!el.closest(FIXES.join(', '));
      // The font list after the first font doesn't matter: the site loads Manrope and Epilogue.
      return [i + ' ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''), fixed, LOOK.map((k) => k + ':' + (k === 'font-family' ? cs.fontFamily.split(',')[0] : cs.getPropertyValue(k))).join(';')];
    });
  }, [LOOK, LEAK_FIXES]);
  await page.close();
  return out;
}
for (const key of KEYS) {
  test(`${key}: looks as v1 does on the site`, async () => {
    const steps = Object.values(scenarios[key])[1] || [];
    for (const width of [1280, 375]) {
      const v1 = await looks(key, steps, width, 'v1');
      const v2 = await looks(key, steps, width, 'v2');
      assert.equal(v2.length, v1.length);
      const differing = v1.filter(([name, fixed, css], i) => !fixed && v2[i][2] !== css).map(([name]) => name);
      assert.deepEqual(differing.slice(0, 10), [], `${differing.length} elements look different at ${width}px`);
    }
  });
}

// Every computed style and box inside the component (and the host's own box).
async function componentStyles(key, steps, width, siteCss) {
  const page = await openCalculator(browser, key, { version: 'v2', siteCss, width });
  await run(page, steps);
  // The last click leaves the mouse over an option; when :hover applies is timing.
  await page.mouse.move(0, 0);
  await page.clock.runFor(100);
  const styles = await page.evaluate(() => {
    const host = document.querySelector('lg-calculator');
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map(Math.round).join(',');
    };
    const out = [['host', box(host)]];
    host.shadowRoot.querySelectorAll('*').forEach((el, i) => {
      for (const pseudo of ['', '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo || null);
        const parts = pseudo ? [] : [box(el)];
        for (let j = 0; j < cs.length; j++) if (!cs[j].startsWith('--')) parts.push(cs[j] + ':' + cs.getPropertyValue(cs[j]));
        out.push([`${i} ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')}${pseudo}`, parts.join(';')]);
      }
    });
    return out;
  });
  await page.close();
  return styles;
}

// Load only what's needed: each page has its own calculator's files.
// Without JavaScript (or before the script runs), its stylesheet gives the
// markup exactly the look the whole v1 stylesheet does, on the site.
async function noJsLooks(key, width, version) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
  await context.route(/^https?:/, (route) => route.abort());
  const page = await context.newPage();
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lg-nojs-'));
  fs.writeFileSync(path.join(dir, 'page.html'), pageHtml(key, path.join(ROOT, 'dist'), 'cms', version === 'v2' ? { embed: false } : null, true));
  await page.goto('file://' + path.join(dir, 'page.html'));
  const out = await page.evaluate((LOOK) => [...document.querySelectorAll('.lg-calc, .lg-calc *')].map((el, i) => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return [i + ' ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''), LOOK.map((k) => k + ':' + cs.getPropertyValue(k)).join(';') + ';box:' + [box.width, box.height].map(Math.round).join(',')];
  }), LOOK);
  await context.close();
  return out;
}
for (const key of KEYS) {
  test(`${key}: without JavaScript, its own stylesheet looks as v1's`, async () => {
    for (const width of [1280, 375]) {
      const v1 = await noJsLooks(key, width, 'v1');
      const v2 = await noJsLooks(key, width, 'v2');
      assert.equal(v2.length, v1.length);
      const differing = v1.filter(([name, css], i) => v2[i][1] !== css).map(([name]) => name);
      assert.deepEqual(differing.slice(0, 10), [], `${differing.length} elements look different at ${width}px`);
    }
  });
}

test('each page loads only its own calculator, and little of it', async () => {
  const gz = (file) => require('zlib').gzipSync(fs.readFileSync(path.join(ROOT, 'dist/v2', file))).length;
  for (const key of KEYS) {
    const page = await browser.newPage();
    const files = [];
    page.on('request', (r) => /\.(js|css)$/.test(r.url()) && files.push(r.url().split('/').slice(-2).join('/')));
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lg-weight-'));
    fs.writeFileSync(path.join(dir, 'page.html'), pageHtml(key, path.join(ROOT, 'dist'), 'cms', { embed: false }));
    await page.goto('file://' + path.join(dir, 'page.html'));
    await page.waitForFunction(() => document.readyState === 'complete');
    await page.close();
    assert.deepEqual(files.sort(), [`v2/${key}.min.css`, `v2/${key}.min.js`].sort(), key);
    const total = gz(key + '.min.js') + gz(key + '.min.css');
    assert.ok(total < 26000, `${key}: ${total} bytes gzipped`);
  }
});
