// Known-answer tests: figures worked out by hand or from published formulas,
// independently of the calculator code. If a rate or formula changes on purpose,
// update the expected figure here with a note of where it came from.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openCalculator, run } = require('./page');

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

async function results(key, steps, ids) {
  const page = await openCalculator(browser, key);
  await run(page, steps);
  const out = {};
  for (const id of ids) out[id] = (await page.textContent('#' + id)).trim();
  await page.close();
  return out;
}

test('UK tax 2026/27 (LG.ukTax)', async () => {
  const page = await openCalculator(browser, 'pro-rata-salary');
  const tax = await page.evaluate(() => {
    const t = window.LyfeTools.ukTax;
    return [t.incomeTax(40000), t.employeeNI(40000), t.incomeTax(125140), t.incomeTax(110000), t.employeeNI(60000)];
  });
  await page.close();
  // 40k: (40,000 - 12,570) x 20% = 5,486; NI (40,000 - 12,570) x 8% = 2,194.40
  // 125,140: allowance fully tapered; 37,700 x 20% + 87,440 x 40% = 42,516
  // 110k: allowance 12,570 - 5,000 = 7,570; 37,700 x 20% + 64,730 x 40% = 33,432
  // 60k NI: 37,700 x 8% + 9,730 x 2% = 3,210.60
  assert.deepEqual(tax.map((n) => Math.round(n * 100) / 100), [5486, 2194.4, 42516, 33432, 3210.6]);
});

test('loan repayment: standard amortisation formula', async () => {
  // 10,000 at 7.5% over 60 months: P x r / (1 - (1 + r)^-n) = 200.3795, shown as 200.38;
  // total = 200.3795 x 60 = 12,022.77
  const r = await results(
    'loan-repayment',
    [
      ['fill', '#lglc-amount', '10000'],
      ['fill', '#lglc-rate', '7.5'],
      ['fill', '#lglc-term', '5'],
    ],
    ['lglc-monthly', 'lglc-total'],
  );
  assert.equal(r['lglc-monthly'], '£200.38');
  assert.equal(r['lglc-total'], '\u00A312,022.77');
});

test('mortgage: repayment and interest-only', async () => {
  // 280,000 at 4.5% over 300 months = 1,556.33; interest-only 225,000 x 5% / 12 = 937.50
  const a = await results(
    'mortgage',
    [
      ['fill', '#lgmc-price', '350000'],
      ['fill', '#lgmc-deposit', '70000'],
      ['fill', '#lgmc-rate', '4.5'],
      ['fill', '#lgmc-term', '25'],
    ],
    ['lgmc-monthly', 'lgmc-ltv'],
  );
  assert.deepEqual(a, { 'lgmc-monthly': '£1,556.33', 'lgmc-ltv': '80%' });
  const b = await results(
    'mortgage',
    [
      ['fill', '#lgmc-price', '300000'],
      ['fill', '#lgmc-deposit', '75000'],
      ['fill', '#lgmc-rate', '5'],
      ['fill', '#lgmc-term', '20'],
      ['check', '#lgmc-type-interest-only'],
    ],
    ['lgmc-monthly', 'lgmc-outstanding'],
  );
  assert.deepEqual(b, { 'lgmc-monthly': '£937.50', 'lgmc-outstanding': '£225,000' });
});

test('inheritance tax: nil-rate band, residence band and transfers', async () => {
  // 500,000 estate, no home or transfer: (500,000 - 325,000) x 40% = 70,000
  const a = await results(
    'inheritance-tax',
    [
      ['fill', '#lgiht-cash', '500000'],
      ['select', '#lgiht-home-desc', 'no'],
      ['select', '#lgiht-transfer', 'no'],
    ],
    ['lgiht-tax'],
  );
  assert.equal(a['lgiht-tax'], '£70,000');
  // 1,100,000 net estate, home to children, full transfers: 650,000 + 350,000 bands,
  // (1,100,000 - 1,000,000) x 40% = 40,000
  const b = await results(
    'inheritance-tax',
    [
      ['fill', '#lgiht-home', '600000'],
      ['fill', '#lgiht-investments', '500000'],
      ['select', '#lgiht-home-desc', 'yes'],
      ['fill', '#lgiht-home-equity', '600000'],
      ['select', '#lgiht-transfer', 'yes'],
      ['fill', '#lgiht-transfer-nrb', '100'],
      ['fill', '#lgiht-transfer-rnrb', '100'],
    ],
    ['lgiht-tax'],
  );
  assert.equal(b['lgiht-tax'], '£40,000');
});

test('net worth: assets minus liabilities', async () => {
  const r = await results(
    'net-worth',
    [
      ['fill', '#lgnw-cash', '12500'],
      ['fill', '#lgnw-property', '350000'],
      ['fill', '#lgnw-mortgage', '245000'],
      ['fill', '#lgnw-credit-cards', '1250.50'],
    ],
    ['lgnw-net-worth'],
  );
  assert.equal(r['lgnw-net-worth'], '£116,249.50');
});

test('pro rata salary: defaults', async () => {
  // 40,000 x 22.5 / 37.5 = 24,000. Pension 5% = 1,200; tax (22,800 - 12,570) x 20% = 2,046;
  // NI (24,000 - 12,570) x 8% = 914.40; take-home 19,839.60 / 12 = 1,653 a month
  const r = await results('pro-rata-salary', [], ['pr-salary-out', 'pr-st-net']);
  assert.deepEqual(r, { 'pr-salary-out': '£24,000', 'pr-st-net': '£1,653' });
});

test('debt to income: repayments / gross monthly income', async () => {
  // 1,425.50 / (45,000 / 12) = 38.0%
  const r = await results(
    'debt-to-income',
    [
      ['fill', '#lgdti-income', '45000'],
      ['fill', '#lgdti-housing', '1100'],
      ['fill', '#lgdti-car', '250'],
      ['fill', '#lgdti-cards', '75.50'],
    ],
    ['lgdti-ratio', 'lgdti-band', 'lgdti-target-max'],
  );
  assert.deepEqual(r, { 'lgdti-ratio': '38.0%', 'lgdti-band': 'High', 'lgdti-target-max': '£1,350' });
});

test('emergency fund: months x essential spending', async () => {
  // 2,000 x 6 = 12,000 target; 12,000 - 4,500 saved = 7,500 gap
  const r = await results(
    'emergency-fund',
    [
      ['fill', '#ef-monthly', '2000'],
      ['check', 'input[name="ef-months"][value="6"]'],
      ['fill', '#ef-saved', '4500'],
    ],
    ['ef-target', 'ef-st-gap'],
  );
  assert.deepEqual(r, { 'ef-target': '£12,000', 'ef-st-gap': '£7,500' });
});

test('input handling: pound signs and thousands commas accepted, malformed numbers rejected', async () => {
  const loan = (amount) =>
    results(
      'loan-repayment',
      [
        ['fill', '#lglc-amount', amount],
        ['fill', '#lglc-rate', '7.5'],
        ['fill', '#lglc-term', '5'],
      ],
      ['lglc-monthly', 'lglc-error'],
    );
  assert.equal((await loan('£10,000'))['lglc-monthly'], '£200.38');
  assert.equal((await loan(' 10000.00 '))['lglc-monthly'], '£200.38');
  for (const bad of ['1e5', '1,0,0', '10,00', '10000.123', '-5000']) {
    const r = await loan(bad);
    assert.equal(r['lglc-monthly'], '—', bad);
    assert.match(r['lglc-error'], /Enter a loan above/, bad);
  }
});

test('input handling: malformed numbers are never read as a different number', async () => {
  // Emergency fund and salary by age have no error line yet: an invalid entry shows the empty state and is marked invalid.
  const page = await openCalculator(browser, 'emergency-fund');
  await run(page, [['fill', '#ef-monthly', '2,000abc']]);
  assert.equal((await page.textContent('#ef-target')).trim(), '£–');
  assert.equal(await page.getAttribute('#ef-monthly', 'aria-invalid'), 'true');
  await page.locator('#ef-monthly').blur();
  assert.equal(await page.inputValue('#ef-monthly'), '2,000abc', 'invalid text is left for the person to correct');
  await run(page, [['fill', '#ef-monthly', '2000']]);
  assert.equal((await page.textContent('#ef-target')).trim(), '£6,000');
  assert.equal(await page.getAttribute('#ef-monthly', 'aria-invalid'), null);
  await page.close();

  // "28k" used to be read as £28.
  const saPage = await openCalculator(browser, 'salary-by-age');
  await run(saPage, [['fill', '#sa-salary', '28k']]);
  assert.equal(await saPage.getAttribute('#sa-salary', 'aria-invalid'), 'true');
  assert.equal((await saPage.textContent('#sa-value')).trim(), (await (async () => {
    const blank = await openCalculator(browser, 'salary-by-age');
    await run(blank, [['fill', '#sa-salary', '']]);
    const t = (await blank.textContent('#sa-value')).trim();
    await blank.close();
    return t;
  })()), 'shows the same as a blank salary');
  await saPage.close();

  // Pro rata shows a message.
  const pr = await results('pro-rata-salary', [['fill', '#pr-salary', '-40000']], ['pr-salary-out', 'pr-error']);
  assert.deepEqual(pr, { 'pr-salary-out': '£–', 'pr-error': 'Enter numbers only, for example 40,000 or 37.5.' });

  // IHT: commas only as thousands separators.
  const bad = await results('inheritance-tax', [['fill', '#lgiht-cash', '5,00,000'], ['select', '#lgiht-home-desc', 'no'], ['select', '#lgiht-transfer', 'no']], ['lgiht-tax']);
  assert.equal(bad['lgiht-tax'], '—');
  const good = await results('inheritance-tax', [['fill', '#lgiht-cash', '£500,000'], ['select', '#lgiht-home-desc', 'no'], ['select', '#lgiht-transfer', 'no']], ['lgiht-tax']);
  assert.equal(good['lgiht-tax'], '£70,000');
});
