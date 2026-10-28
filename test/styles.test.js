// Each calculator must look the same whatever wraps it on the page: styling
// may depend only on the pasted markup, not on the template's data-calc
// attribute or lg-calc-wrap class (v1.2.0 broke four calculators this way).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openCalculator, run } = require('./page');
const scenarios = require('./scenarios');

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

async function markupStyles(key, steps, wrapper, width) {
  const page = await openCalculator(browser, key, { wrapper, width });
  await run(page, steps);
  const styles = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.lg-calc-markup *').forEach((el, i) => {
      for (const pseudo of ['', '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo || null);
        const parts = [];
        for (let j = 0; j < cs.length; j++) parts.push(cs[j] + ':' + cs.getPropertyValue(cs[j]));
        out.push([`${i} ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')}${pseudo}`, parts.join(';')]);
      }
    });
    return out;
  });
  await page.close();
  return styles;
}

for (const key of Object.keys(scenarios)) {
  test(`${key} is styled the same without the template wrapper`, async () => {
    const steps = Object.values(scenarios[key])[1] || [];
    for (const width of [1280, 375]) {
      const cms = await markupStyles(key, steps, 'cms', width);
      const plain = await markupStyles(key, steps, 'plain', width);
      const differing = cms.filter(([name, css], i) => plain[i][1] !== css).map(([name]) => name);
      assert.deepEqual(differing.slice(0, 10), [], `${differing.length} elements styled differently at ${width}px`);
    }
  });
}
