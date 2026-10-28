// Snapshot tests: every calculator, every scenario in scenarios.js.
// The first run (or UPDATE_SNAPSHOTS=1 npm test) records what each calculator
// shows; later runs fail if any figure, message or chart value changes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { openCalculator, run, readOutputs } = require('./page');
const scenarios = require('./scenarios');

const SNAPSHOTS = path.join(__dirname, 'snapshots');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

for (const key of Object.keys(scenarios)) {
  test(key, async (t) => {
    const file = path.join(SNAPSHOTS, key + '.json');
    const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const results = {};
    for (const [name, steps] of Object.entries(scenarios[key])) {
      await t.test(name, async () => {
        const page = await openCalculator(browser, key);
        await run(page, steps);
        results[name] = await readOutputs(page);
        assert.deepEqual(page.lgErrors, [], 'console errors or warnings');
        await page.close();
        if (!UPDATE && saved[name]) assert.deepEqual(results[name], saved[name]);
      });
    }
    const missing = Object.keys(results).filter((name) => !saved[name]);
    if (UPDATE || missing.length) {
      fs.mkdirSync(SNAPSHOTS, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(UPDATE ? results : { ...saved, ...results }, null, 2) + '\n');
    }
  });
}
