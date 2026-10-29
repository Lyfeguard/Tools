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
const KEYS = ['take-home-pay'];
// Ids from the test page around the v1 markup, not the calculator.
const PAGE_IDS = ['calc-heading'];

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
        const expected = JSON.parse(JSON.stringify(saved[name]));
        PAGE_IDS.forEach((id) => delete expected[id]);
        // v1's start-up marker (data-lg-ready-...) on the calculator's root.
        Object.values(expected).forEach((entry) => Object.keys(entry).forEach((k) => /^data-lgReady/.test(k) && delete entry[k]));
        assert.deepEqual(outputs, expected);
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

// The Tools template, with the v2 script loaded and the pilot's empty
// <lg-calculator> embed still in place.
test('template: calculators not in v2 run as v1, and an empty embed takes no space', async () => {
  for (const key of Object.keys(scenarios).filter((k) => !KEYS.includes(k))) {
    const steps = Object.values(scenarios[key])[1] || [];
    const plain = await openCalculator(browser, key, { width: 375 });
    await run(plain, steps);
    const withV2 = await openCalculator(browser, key, { width: 375, template: { embed: true } });
    await run(withV2, steps);
    assert.deepEqual(withV2.lgErrors, [], key + ': console errors or warnings');
    assert.deepEqual(await readOutputs(withV2), await readOutputs(plain), key);
    const height = (page) => page.evaluate(() => document.querySelector('.lg-calc-wrap').getBoundingClientRect().height);
    assert.equal(await height(withV2), await height(plain), key + ': the embed changed the layout');
    await plain.close();
    await withV2.close();
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
    assert.equal(outputs[Object.keys(outputs).find((id) => /headline$/.test(id))].text, saved[name][Object.keys(outputs).find((id) => /headline$/.test(id))].text);
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
    const v1 = await text(pageHtml(key, dist), true);
    const noJs = await text(pageHtml(key, dist, 'cms', { embed: true }), false);
    const rendered = await text(pageHtml(key, dist, 'cms', { embed: true }), true);
    assert.equal(noJs.visible, true, 'shows without JavaScript');
    assert.equal(noJs.text, v1.text, 'same text without JavaScript');
    assert.equal(rendered.text, v1.text, 'same text once rendered');
    assert.deepEqual(rendered.headings, v1.headings.filter((h) => h !== 'Calculator'), 'same headings');
  });
}

// Every computed style and box inside the component (and the host's own box).
async function componentStyles(key, steps, width, siteCss) {
  const page = await openCalculator(browser, key, { version: 'v2', siteCss, width });
  await run(page, steps);
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
