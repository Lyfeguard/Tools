// The worked examples in the markup (markup/examples.js, written by
// scripts/examples.js) are exactly what each calculator shows for those
// figures. A change to a calculator or the data that alters one fails here:
// run node scripts/examples.js, check the sentences, and sync the markup.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT } = require('./page');
const { html, place, values } = require('../scripts/examples');
const EXAMPLES = require('../markup/examples');

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

for (const [key, example] of Object.entries(EXAMPLES)) {
  test(`${key}: the worked example matches the calculator`, async () => {
    const markup = fs.readFileSync(path.join(ROOT, 'markup', key + '.html'), 'utf8');
    const section = html(example, await values(browser, key, example.steps));
    assert.ok(markup.includes('<section class="lgc-example"'), 'the markup has its example');
    assert.equal(place(markup, section), markup, 'out of date: run node scripts/examples.js');
    // Ahead of the result bar, which stays the calculator's last element.
    assert.ok(markup.indexOf('class="lgc-example"') < markup.lastIndexOf('<div class="lgc-sticky"'));
  });
}

test('every calculator has an example', () => {
  const keys = fs.readdirSync(path.join(ROOT, 'markup')).filter((f) => f.endsWith('.html')).map((f) => f.replace('.html', ''));
  assert.deepEqual(Object.keys(EXAMPLES).sort(), keys.sort());
});
