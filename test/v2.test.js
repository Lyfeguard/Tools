// v2: the <lg-calculator> component (dist/v2/lg-calculator.min.js).
// Parity: every scenario shows exactly what the v1 calculator shows (its saved
// snapshot). Isolation: the Webflow site's CSS and hostile rules change
// nothing inside the component.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { openCalculator, run, readOutputs } = require('./page');
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

// The Tools template holds <lg-calculator key="Calculator key"> on every item.
test('template embed: hidden and takes no space on items still using v1 markup', async () => {
  for (const key of Object.keys(scenarios)) {
    const steps = Object.values(scenarios[key])[1] || [];
    const plain = await openCalculator(browser, key, { width: 375 });
    await run(plain, steps);
    const withEmbed = await openCalculator(browser, key, { width: 375, template: { embed: key, pasted: true } });
    await run(withEmbed, steps);
    assert.deepEqual(withEmbed.lgErrors, [], key + ': console errors or warnings');
    assert.deepEqual(await readOutputs(withEmbed), await readOutputs(plain), key);
    const height = (page) => page.evaluate(() => document.querySelector('.lg-calc-wrap').getBoundingClientRect().height);
    assert.equal(await height(withEmbed), await height(plain), key + ': the embed changed the layout');
    assert.equal(await withEmbed.evaluate(() => document.querySelector('lg-calculator').hidden && !document.querySelector('lg-calculator').shadowRoot), true, key);
    await plain.close();
    await withEmbed.close();
  }
});

test('template embed: shows the calculator once its markup field is empty', async () => {
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'snapshots', 'take-home-pay.json'), 'utf8'));
  // The key from the embed, or from the wrapper's data-calc when the embed has none.
  for (const embed of ['take-home-pay', ' take-home-pay ', null]) {
    const page = await openCalculator(browser, 'take-home-pay', { template: { embed, pasted: false } });
    await run(page, scenarios['take-home-pay'].typical);
    const outputs = await readOutputs(page);
    assert.deepEqual(page.lgErrors, [], 'console errors or warnings');
    await page.close();
    assert.equal(outputs['lgth-headline'].text, saved.typical['lgth-headline'].text, String(embed));
  }
});

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
