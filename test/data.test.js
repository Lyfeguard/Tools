// The data files (data/): complete, sensible, and the ones the build uses.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./page');
const { inline } = require('../scripts/data');

const year = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/2026-27.json'), 'utf8'));
const ons = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ons-ashe-2026.json'), 'utf8'));
const rate = (r) => typeof r === 'number' && r > 0 && r < 1;
const amount = (n) => Number.isInteger(n) && n > 0;

test('the tax year file has every figure, and they make sense', () => {
  const t = year.incomeTax;
  assert.match(year.taxYear, /^\d{4}\/\d{2}$/);
  [t.personalAllowance, t.taperStart, t.basicBand, t.additionalThreshold].forEach((n) => assert.ok(amount(n), String(n)));
  assert.ok(t.rates.basic < t.rates.higher && t.rates.higher < t.rates.additional);
  // Scottish bands rise, and the last one is open-ended.
  t.scotland.forEach((b, i) => {
    assert.ok(rate(b.rate) && b.name, JSON.stringify(b));
    if (i < t.scotland.length - 1) assert.ok(amount(b.upTo) && (i === 0 || b.upTo > t.scotland[i - 1].upTo));
    else assert.equal(b.upTo, null);
  });
  const ni = year.nationalInsurance;
  assert.ok(amount(ni.primaryThreshold) && ni.upperEarningsLimit > ni.primaryThreshold && rate(ni.mainRate) && rate(ni.upperRate));
  for (const plan of Object.values(year.studentLoans)) assert.ok(plan.name && amount(plan.threshold) && rate(plan.rate), JSON.stringify(plan));
  assert.ok(year.childBenefitCharge.end > year.childBenefitCharge.start);
  const iht = year.inheritanceTax;
  [iht.nilRateBand, iht.residenceNilRateBand, iht.taperThreshold, iht.fullReliefCap].forEach((n) => assert.ok(amount(n)));
  assert.ok(amount(year.pensions.lumpSumAllowance) && rate(year.pensions.taxFreeShare) && amount(year.pensions.fullStatePension));
});

test('the tax on buying a home: bands rise and end open-ended, rates are fractions', () => {
  const p = year.propertyTax;
  const bands = (list, name) =>
    list.forEach((b, i) => {
      assert.ok(typeof b.rate === 'number' && b.rate >= 0 && b.rate < 1 && (i === 0 || b.rate > list[i - 1].rate), name + ' rate ' + JSON.stringify(b));
      if (i < list.length - 1) assert.ok(amount(b.upTo) && (i === 0 || b.upTo > list[i - 1].upTo), name + ' band ' + JSON.stringify(b));
      else assert.equal(b.upTo, null, name + ': the top band is open-ended');
    });
  bands(p.sdlt.bands, 'SDLT');
  bands(p.lbtt.bands, 'LBTT');
  bands(p.ltt.bands, 'LTT');
  bands(p.ltt.higherBands, 'LTT higher rates');
  assert.equal(p.sdlt.firstTimeBuyer.bands.at(-1).upTo, p.sdlt.firstTimeBuyer.maxPrice);
  assert.ok(rate(p.sdlt.additionalSurcharge) && rate(p.sdlt.nonResidentSurcharge) && rate(p.lbtt.additionalDwellingSupplement));
  assert.ok(p.lbtt.firstTimeBuyerNilBand > p.lbtt.bands[0].upTo && p.lbtt.firstTimeBuyerNilBand < p.lbtt.bands[1].upTo);
  for (const n of ['sdlt', 'lbtt', 'ltt']) assert.ok(amount(p[n].surchargeFrom));
});

test('redundancy pay: caps, limits and bands', () => {
  const r = year.redundancy;
  assert.ok(amount(r.weeklyPayCap) && amount(r.weeklyPayCapNI) && amount(r.taxFree));
  assert.ok(r.minYears === 2 && r.maxYears === 20);
  assert.deepEqual(r.bands.map((b) => [b.fromAge, b.weeks]), [[41, 1.5], [22, 1], [0, 0.5]]);
});

test('the salary tables: every age group and sex, 12 figures in order', () => {
  for (const sex of ['all', 'male', 'female']) {
    for (const age of ons.ages.concat('all')) {
      const row = ons[sex][age];
      assert.equal(row.length, 12, `${sex} ${age}`);
      // median, mean, then percentiles p10 ... p90, which rise.
      const pct = [row[2], row[3], row[4], row[5], row[6], row[0], row[7], row[8], row[9], row[10], row[11]];
      pct.forEach((v, i) => i && assert.ok(v >= pct[i - 1], `${sex} ${age}: percentiles rise`));
    }
  }
});

test('the build puts the data in, without the notes', () => {
  const js = inline('var a = /* @data:2026-27 */ null; var b = /* @data:ons-ashe-2026 */ null;');
  assert.ok(!js.includes('@data') && !js.includes('$about') && !js.includes('$source'));
  assert.ok(js.includes('"lumpSumAllowance":' + year.pensions.lumpSumAllowance));
  assert.throws(() => inline('/* @data:2099-00 */ null'), /No data file/);
  for (const file of ['dist/lg-calc.min.js', 'dist/v2/take-home-pay.min.js']) assert.ok(!fs.readFileSync(path.join(ROOT, file), 'utf8').includes('@data:'), file);
});
