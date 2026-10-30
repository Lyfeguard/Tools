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

test('retirement income: pot duration, tax-free cash and sustainable income', async () => {
  // With growth equal to inflation there is no real growth, so a £200,000 pot paying
  // £20,000 a year lasts exactly 10 years (ages 65 to 74) and runs out at 75.
  // Lasting to 95 means 30 years: £200,000 / 30 = £6,667 a year.
  const flat = await results(
    'retirement-income',
    [
      ['fill', '#lgri-pot', '200000'],
      ['fill', '#lgri-age', '65'],
      ['fill', '#lgri-target', '20000'],
      ['fill', '#lgri-sp', '0'],
      ['fill', '#lgri-growth', '2.5'],
    ],
    ['lgri-headline', 'lgri-sustainable', 'lgri-first-withdrawal'],
  );
  assert.deepEqual(flat, { 'lgri-headline': 'Age 75', 'lgri-sustainable': '£6,667 a year', 'lgri-first-withdrawal': '£20,000' });

  // Taking 25% upfront leaves £150,000: 7 full years (65 to 71), runs out at 72.
  const upfront = await results(
    'retirement-income',
    [
      ['fill', '#lgri-pot', '200000'],
      ['fill', '#lgri-age', '65'],
      ['fill', '#lgri-target', '20000'],
      ['fill', '#lgri-sp', '0'],
      ['fill', '#lgri-growth', '2.5'],
      ['check', 'input[name="lgri-lump"][value="upfront"]'],
    ],
    ['lgri-headline', 'lgri-cash'],
  );
  assert.deepEqual(upfront, { 'lgri-headline': 'Age 72', 'lgri-cash': '£50,000' });

  // £25,000 from the pot with 25% tax-free: tax = (18,750 - 12,570) x 20% = 1,236.
  const page = await openCalculator(browser, 'retirement-income');
  await run(page, [
    ['fill', '#lgri-pot', '300000'],
    ['fill', '#lgri-age', '60'],
    ['fill', '#lgri-target', '25000'],
  ]);
  const year1 = await page.evaluate(() => {
    const r = window.LyfeTools.retirementIncome.project({ pot: 300000, age: 60, target: 25000, sp: 12548, spAge: 67, other: 0, growth: 4, inflation: 2.5, lump: 'spread' });
    return { tax: Math.round(r.years[0].tax), spAt67: r.years[7].sp, needAt67: Math.round(r.years[7].need) };
  });
  assert.deepEqual(year1, { tax: 1236, spAt67: 12548, needAt67: 12452 });
  await page.close();
});

test('take-home pay: tax, NI, pensions and student loans (2026/27)', async () => {
  const page = await openCalculator(browser, 'take-home-pay');
  const out = await page.evaluate(() => {
    const calc = window.LyfeTools.takeHomePay.calculate;
    const base = { region: 'ruk', pensionPct: 0, pensionType: 'netpay', pensionBasis: 'total', loan: '', postgrad: false };
    const net = (o) => Math.round(calc(Object.assign({}, base, o)).net * 100) / 100;
    const t = window.LyfeTools.ukTax;
    return {
      plain: net({ gross: 35000 }),
      netPay: net({ gross: 60000, pensionPct: 5 }),
      qualifying: net({ gross: 30000, pensionPct: 5, pensionBasis: 'qualifying' }),
      sacrifice: net({ gross: 110000, pensionPct: 10, pensionType: 'sacrifice' }),
      ras: net({ gross: 60000, pensionPct: 5, pensionType: 'ras' }),
      rasClaim: Math.round(calc(Object.assign({}, base, { gross: 60000, pensionPct: 5, pensionType: 'ras' })).rasClaim * 100) / 100,
      scotland: net({ gross: 45000, region: 'scotland' }),
      scotTax30k: Math.round(t.incomeTax(30000, 'scotland') * 100) / 100,
      scotBand: t.taxBand(45000, 'scotland').name,
      plan2: t.studentLoan(40000, 'plan2'),
      postgrad: t.studentLoan(40000, 'postgrad'),
    };
  });
  await page.close();
  assert.deepEqual(out, {
    // 35k: tax (35,000 - 12,570) x 20% = 4,486; NI 22,430 x 8% = 1,794.40
    plain: 28719.6,
    // 60k, 5% before tax: taxable 57,000; tax 7,540 + 6,730 x 40% = 10,232; NI 3,016 + 9,730 x 2% = 3,210.60
    netPay: 43557.4,
    // 30k, 5% of 30,000 - 6,240 = 1,188; tax (28,812 - 12,570) x 20% = 3,248.40; NI 1,394.40
    qualifying: 24169.2,
    // 110k, 10% sacrifice: pay 99,000 keeps the full allowance; tax 7,540 + 48,730 x 40% = 27,032; NI 3,016 + 48,730 x 2% = 3,990.60
    sacrifice: 67977.4,
    // 60k, 5% relief at source: 2,400 from pay; tax 7,540 + 9,730 x 40% = 11,432; NI 3,210.60
    ras: 42957.4,
    // Higher-rate relief to claim: 3,000 x (40% - 20%)
    rasClaim: 600,
    // Scotland 45k: taxable 32,430 = 3,967 x 19% + 12,989 x 20% + 14,136 x 21% + 1,338 x 42% = 6,882.05; NI 2,594.40
    scotland: 35523.55,
    // Scotland 30k: 3,967 x 19% + 12,989 x 20% + 474 x 21% = 3,451.07
    scotTax30k: 3451.07,
    scotBand: 'Higher rate',
    // Plan 2: (40,000 - 29,385) x 9% = 955.35, rounded down; postgraduate (40,000 - 21,000) x 6% = 1,140
    plan2: 955,
    postgrad: 1140,
  });
});

test('take-home pay: what a pay rise is worth', async () => {
  // 35k with 5% pension before tax, all in the basic rate: of each extra pound,
  // 5% goes to the pension, 19% (20% of the 95% left) to tax and 8% to NI, so you keep 68%.
  // +5,000: 3,400 a year = 283.33 a month. +7,500: 5,100 a year = 425 a month.
  const out = await results(
    'take-home-pay',
    [
      ['fill', '#lgth-salary', '35,000'],
      ['fill', '#lgth-rise-amount', '7,500'],
    ],
    ['lgth-rise1', 'lgth-custom-extra', 'lgth-custom-keep', 'lgth-custom-pay'],
  );
  assert.deepEqual(out, { 'lgth-rise1': '+£283.33 a month', 'lgth-custom-extra': '+£425.00', 'lgth-custom-keep': '68%', 'lgth-custom-pay': '£42,500' });
});

test('tax on buying a home: Stamp Duty, LBTT and LTT', async () => {
  const page = await openCalculator(browser, 'stamp-duty');
  const out = await page.evaluate(() => {
    const tax = (nation, price, buyer, nonRes) => window.LyfeTools.propertyTax.calculate(nation, price, buyer || 'home', nonRes).tax;
    return {
      sdlt: [tax('sdlt', 125000), tax('sdlt', 350000), tax('sdlt', 1000000), tax('sdlt', 2000000)],
      sdltFirst: [tax('sdlt', 300000, 'first'), tax('sdlt', 500000, 'first'), tax('sdlt', 500001, 'first')],
      sdltAdditional: [tax('sdlt', 39999, 'additional'), tax('sdlt', 40000, 'additional'), tax('sdlt', 300000, 'additional'), tax('sdlt', 300000, 'additional', true), tax('sdlt', 300000, 'first', true)],
      // GOV.UK's example (Fifi): a non-resident first-time buyer above the relief's limit pays standard rates plus 2%.
      sdltNonResident: [tax('sdlt', 39999, 'home', true), tax('sdlt', 40000, 'home', true), tax('sdlt', 700000, 'first', true)],
      lbtt: [tax('lbtt', 145000), tax('lbtt', 300000), tax('lbtt', 800000)],
      lbttFirst: [tax('lbtt', 175000, 'first'), tax('lbtt', 300000, 'first')],
      lbttAdditional: [tax('lbtt', 39999, 'additional'), tax('lbtt', 300000, 'additional')],
      ltt: [tax('ltt', 225000), tax('ltt', 300000), tax('ltt', 2000000)],
      lttAdditional: [tax('ltt', 39999, 'additional'), tax('ltt', 300000, 'additional')],
      roundsDown: tax('ltt', 225001.5),
    };
  });
  await page.close();
  assert.deepEqual(out, {
    // 350k: 2% x 125,000 + 5% x 100,000 = 7,500. 1m: 2,500 + 33,750 + 10% x 75,000 = 43,750.
    // 2m: 2,500 + 33,750 + 57,500 + 12% x 500,000 = 153,750.
    sdlt: [0, 7500, 43750, 153750],
    // First-time buyers: 0% to 300,000, then 5% to 500,000; above 500,000 the standard rates (2,500 + 12,500.05).
    sdltFirst: [0, 10000, 15000],
    // 5% more on every band from 40,000; non-UK residents 2% more again (7%, 9%, 12% at 300k).
    sdltAdditional: [0, 2000, 20000, 26000, 6000],
    // The 2% starts at 40,000 too. 700k: 2% x 125,000 + 4% x 125,000 + 7% x 450,000 = 39,000.
    sdltNonResident: [0, 800, 39000],
    // LBTT 300k: 2% x 105,000 + 5% x 50,000 = 4,600. 800k: 2,100 + 3,750 + 10% x 425,000 + 12% x 50,000 = 54,350.
    lbtt: [0, 4600, 54350],
    // First-time buyers: 0% to 175,000, saving 600.
    lbttFirst: [0, 4000],
    // Additional Dwelling Supplement: 8% of the whole price, from 40,000.
    lbttAdditional: [0, 28600],
    // LTT 300k: 6% x 75,000 = 4,500. 2m: 10,500 + 26,250 + 75,000 + 12% x 500,000 = 171,750.
    ltt: [0, 4500, 171750],
    // Higher rates: 5% x 180,000 + 8.5% x 70,000 + 10% x 50,000 = 19,950.
    lttAdditional: [0, 19950],
    // 6% of 1.50 is 9p, rounded down to 0.
    roundsDown: 0,
  });
});

test('redundancy pay: statutory weeks, the cap and the 20-year limit (from 6 April 2026)', async () => {
  const page = await openCalculator(browser, 'redundancy-pay');
  const out = await page.evaluate(() => {
    const calc = (age, years, weekly, region) => {
      const r = window.LyfeTools.redundancyPay.calculate({ age, years, weekly, region: region || 'gb' });
      return [r.weeks, Math.round(r.total * 100) / 100];
    };
    return {
      // Aged 43 with 6 years: 2 years at 41+ (1.5 weeks) and 4 at 22-40 (1 week) = 7 weeks.
      acas: calc(43, 6, 500),
      // Aged 23 with 3 years: 1 year at 22 (1 week) and 2 under 22 (half a week) = 2 weeks.
      young: calc(23, 3, 400),
      // 30 years at 60: only 20 count; 19 at 41+ and 1 at 40 = 29.5 weeks at the 751 cap.
      capped: calc(60, 30, 2000),
      // The maximum: 20 years all at 41+ = 30 weeks x 751 = 22,530; in Northern Ireland x 783 = 23,490.
      max: calc(61, 20, 5000),
      maxNI: calc(61, 20, 5000, 'ni'),
      // Under 2 years' service: nothing.
      under2: calc(30, 1, 600),
    };
  });
  await page.close();
  assert.deepEqual(out, { acas: [7, 3500], young: [2, 800], capped: [29.5, 22154.5], max: [30, 22530], maxNI: [30, 23490], under2: [0, 0] });
});

test('mortgage affordability: income multiples, commitments, take-home pay and cash flow', async () => {
  const page = await openCalculator(browser, 'mortgage-affordability');
  const out = await page.evaluate(() => {
    const { calculate, payment, takeHome, maxTerm } = window.LyfeTools.mortgageAffordability;
    const tax = { region: 'ruk', pensionPct: 0, student: 0, deductions: 0 };
    const base = { people: 1, variable: 0, loans: 0, cards: 0, cardsType: 'balance', other: 0, existing: 0, living: null, price: null, deposit: 0, term: 25, rate: 4.5, type: 'repayment', tax };
    const run = (o) => calculate(Object.assign({}, base, o));
    const joint = run({ people: 2, income: 125000, loans: 299, cards: 15000, deposit: 210000, term: 40 });
    const bonus = run({ income: 40000, variable: 5000 });
    const minimums = run({ income: 60000, cards: 200, cardsType: 'payments' });
    // 30,000 salary: tax (30,000 - 12,570) x 20% = 3,486; NI 17,430 x 8% = 1,394.40; take-home 25,119.60 a year.
    const single = takeHome(30000, 1, tax);
    // Two on 60,000 together: each 30,000, so twice the above.
    const pair = takeHome(60000, 2, tax);
    // 5% pension before tax on 30,000: 1,500; tax on 28,500 = 3,186; NI unchanged; take-home 23,919.60.
    const pension = takeHome(30000, 1, Object.assign({}, tax, { pensionPct: 5 }));
    // A 200,000 home with 20,000 down on 30,000: 180,000 needed, more than 4.5 x 30,000 (135,000) and 6 x (180,000) is exactly reached.
    const priced = run({ income: 30000, price: 200000, deposit: 20000, living: 900 });
    return {
      jointLoans: joint.points.map((p) => p.loan),
      jointReduction: joint.reduction,
      bonusCounted: bonus.counted,
      minimumsAssessed: minimums.assessed,
      repayment: Math.round(payment(200000, 4.5, 25, 'repayment') * 100) / 100,
      interestOnly: payment(200000, 4.5, 25, 'interest-only'),
      terms: [maxTerm(30), maxTerm(38), maxTerm(58), maxTerm(70)],
      single: Math.round(single.net * 100) / 100,
      pair: Math.round(pair.net * 100) / 100,
      pension: Math.round(pension.net * 100) / 100,
      pricedLoan: priced.loan,
      pricedLtv: priced.ltv,
      pricedFit: priced.fit,
      // Left: 2,093.30 take-home - 1,000.50 mortgage - 900 living = 192.80: 9.2% of take-home, under 10%, so amber.
      pricedLeft: Math.round(priced.left * 100) / 100,
      pricedStatus: priced.status,
      tooHigh: run({ income: 20000, loans: 2000 }).points.map((p) => p.loan),
    };
  });
  await page.close();
  assert.deepEqual(out, {
    // 125,000 less a year of 299 + 3% of 15,000 = 749 a month (8,988): 116,012 at 4, 4.5, 6 and 7 times, rounded down.
    jointLoans: [464000, 522000, 696000, 812000],
    jointReduction: [40000, 54000],
    bonusCounted: 42500,
    minimumsAssessed: 57600,
    repayment: 1111.66,
    interestOnly: 750,
    // Repaid by 75, and no longer than 40 years.
    terms: [40, 37, 17, 5],
    single: 2093.3,
    pair: 4186.6,
    pension: 1993.3,
    pricedLoan: 180000,
    pricedLtv: 90,
    pricedFit: 'many',
    pricedLeft: 192.8,
    pricedStatus: 'tight',
    tooHigh: [0, 0, 0, 0],
  });
});
