// Calculators that work together: a "Use these figures" link carries the
// figures after the # (src/v2/handoff.js), and the calculator it opens fills
// them in, says so, and takes them out of the address.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openCalculator, run, readOutputs } = require('./page');
const LINKS = require('../markup/links');
const scenarios = require('./scenarios');
// Each calculator's figures: its second scenario (the typical case).
const steps = (key) => Object.values(scenarios[key])[1];

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

// The address the link goes to once clicked (the click doesn't navigate here).
async function follow(page, to) {
  return page.evaluate((to) => {
    document.addEventListener('click', (e) => e.preventDefault(), { once: true });
    const link = document.querySelector('lg-calculator').shadowRoot.querySelector(`a[data-handoff="${to}"]`);
    link.click();
    return link.getAttribute('href');
  }, to);
}
const value = (page, id) => page.evaluate((id) => document.querySelector('lg-calculator').shadowRoot.getElementById(id).value, id);

// What each link should fill in, after those figures.
const EXPECT = {
  'take-home-pay>debt-to-income': { 'lgdti-income': '35,000' },
  'mortgage>debt-to-income': { 'lgdti-housing': '1,556.33' },
  'pro-rata-salary>take-home-pay': { 'lgth-salary': '33,000', 'lgth-pension': '5' },
  'salary-by-age>take-home-pay': { 'lgth-salary': '28,500' },
  'emergency-fund>savings-goal': { 'sg-goal': '12,000', 'sg-initial': '4,500' },
  'stamp-duty>lbtt': { 'lglbtt-price': '350,000' },
  'stamp-duty>land-transaction-tax': { 'lgltt-price': '350,000' },
  'lbtt>stamp-duty': { 'lgsd-price': '300,000' },
  'lbtt>land-transaction-tax': { 'lgltt-price': '300,000' },
  'land-transaction-tax>stamp-duty': { 'lgsd-price': '300,000' },
  'land-transaction-tax>lbtt': { 'lglbtt-price': '300,000' },
  'net-worth>inheritance-tax': { 'lgiht-home': '350,000', 'lgiht-cash': '15,000', 'lgiht-investments': '20,000', 'lgiht-possessions': '12,000', 'lgiht-mortgage': '245,000', 'lgiht-debts': '8,750.5' } // as IHT shows a typed 8750.50,
};

for (const [from, links] of Object.entries(LINKS)) {
  for (const { to } of links) {
    test(`${from} hands its figures to ${to}`, async () => {
      const source = await openCalculator(browser, from, { version: 'v2' });
      await run(source, steps(from));
      const href = await follow(source, to);
      assert.deepEqual(source.lgErrors, []);
      await source.close();
      const [pathname, hash] = href.split('#');
      assert.match(pathname, /^\/tools\/[a-z-]+$/);
      assert.match(hash, new RegExp('^lg-from=' + from + '&'));

      const target = await openCalculator(browser, to, { version: 'v2', hash: '#' + hash });
      const expected = EXPECT[from + '>' + to];
      assert.ok(expected, 'add the expected fields for ' + from + '>' + to);
      for (const [id, v] of Object.entries(expected)) assert.equal(await value(target, id), v, id);
      const state = await target.evaluate(() => ({
        hash: location.hash,
        note: document.querySelector('lg-calculator').shadowRoot.querySelector('.lgc-handoff')?.textContent,
      }));
      assert.equal(state.hash, '', 'the figures are taken out of the address');
      assert.match(state.note, /filled in your figures from the/);
      if (to === 'inheritance-tax') assert.match(state.note, /answer the questions about your home/, 'says what IHT still needs');
      assert.deepEqual(target.lgErrors, []);
      await target.close();
    });
  }
}

test('the result matches typing the same figures in', async () => {
  // Take-home pay into debt-to-income, then the same by hand.
  const handed = await openCalculator(browser, 'debt-to-income', { version: 'v2', hash: '#lg-from=take-home-pay&%40lgdti-period=year&lgdti-income=35000' });
  await run(handed, [['fill', '#lgdti-housing', '1,100']]);
  const typed = await openCalculator(browser, 'debt-to-income', { version: 'v2' });
  await run(typed, [['fill', '#lgdti-income', '35,000'], ['fill', '#lgdti-housing', '1,100']]);
  const a = await readOutputs(handed);
  const b = await readOutputs(typed);
  assert.equal(a['lgdti-ratio'].text, b['lgdti-ratio'].text);
  assert.ok(/%/.test(a['lgdti-ratio'].text));
  await handed.close();
  await typed.close();
});

test('only plain numbers, into its own fields', async () => {
  const hash = '#lg-from=net-worth&lgiht-cash=%3Cimg%20src%3Dx%3E&lgiht-home=1e9&lgiht-spouse=5&lgiht-tax=1&lgiht-investments=1000&%40nothing=1';
  const page = await openCalculator(browser, 'inheritance-tax', { version: 'v2', hash });
  assert.equal(await value(page, 'lgiht-cash'), '');
  assert.equal(await value(page, 'lgiht-home'), '');
  assert.equal(await value(page, 'lgiht-investments'), '1,000');
  assert.equal(await page.evaluate(() => location.hash), '');
  assert.deepEqual(page.lgErrors, []);
  await page.close();
});

test('household net worth opens Inheritance Tax without figures', async () => {
  const page = await openCalculator(browser, 'net-worth', { version: 'v2' });
  await run(page, [['check', 'input[name="lgnw-scope"][value="household"]'], ...steps('net-worth')]);
  const href = await follow(page, 'inheritance-tax');
  assert.equal(href, '/tools/inheritance-tax-calculator');
  await page.close();
});

test('a page without figures in the address is left as it is', async () => {
  const page = await openCalculator(browser, 'take-home-pay', { version: 'v2', hash: '#lgth-results' });
  assert.equal(await page.evaluate(() => location.hash), '#lgth-results');
  assert.equal(await page.evaluate(() => !!document.querySelector('lg-calculator').shadowRoot.querySelector('.lgc-handoff')), false);
  await page.close();
});

test('the figures go with the link however it is opened (middle-click, new tab, keyboard)', async () => {
  const page = await openCalculator(browser, 'take-home-pay', { version: 'v2' });
  await run(page, steps('take-home-pay'));
  // No click: a middle-click or "Open in new tab" starts with the pointer going down.
  const href = await page.evaluate(() => {
    const a = document.querySelector('lg-calculator').shadowRoot.querySelector('a[data-handoff]');
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, button: 1 }));
    return a.getAttribute('href');
  });
  assert.match(href, /#lg-from=take-home-pay&.*lgdti-income=35000/);
  await page.close();
});

test('tax on buying a home: the kind of buyer goes too, and Wales has no first-time buyer relief', async () => {
  const page = await openCalculator(browser, 'stamp-duty', { version: 'v2' });
  await run(page, [['fill', '#lgsd-price', '450000'], ['check', 'input[name="lgsd-buyer"][value="first"]']]);
  assert.match(await follow(page, 'lbtt'), /#lg-from=stamp-duty&%40lglbtt-buyer=first&lglbtt-price=450000$/);
  assert.match(await follow(page, 'land-transaction-tax'), /#lg-from=stamp-duty&%40lgltt-buyer=home&lgltt-price=450000$/);
  await page.close();
  const scot = await openCalculator(browser, 'lbtt', { version: 'v2', hash: '#lg-from=stamp-duty&%40lglbtt-buyer=first&lglbtt-price=450000' });
  const out = await readOutputs(scot);
  assert.equal(out['lglbtt-status'].text, 'First-time buyer relief');
  assert.equal(out['lglbtt-headline'].text, '\u00A317,750'); // 2% x 75,000 + 5% x 75,000 + 10% x 125,000
  assert.match(await scot.evaluate(() => document.querySelector('lg-calculator').shadowRoot.querySelector('.lgc-handoff').textContent), /from the Stamp Duty calculator/);
  await scot.close();
});
