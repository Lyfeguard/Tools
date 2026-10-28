// Compares the final (computed) styles of every element on every calculator
// between the current dist/ and the dist/ at an earlier git ref.
// Use it after a CSS clean-up to prove nothing visible changed:
//   npm run style-diff -- v1.1.0
//   npm run style-diff -- v1.1.0 --only=inheritance-tax --all
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT, openCalculator, run } = require('../test/page');
const scenarios = require('../test/scenarios');

const ref = process.argv[2];
// Optional: --only=<calculator key> and --all to compare every scenario, not just the first two.
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const allScenarios = process.argv.includes('--all');
if (!ref) {
  console.error('Usage: npm run style-diff -- <git ref, e.g. v1.1.0>');
  process.exit(2);
}
const baseDist = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-base-'));
for (const file of ['lg-calc.min.css', 'lg-calc.min.js']) {
  fs.writeFileSync(path.join(baseDist, file), execFileSync('git', ['show', `${ref}:dist/${file}`], { cwd: ROOT }));
}

async function styles(browser, key, steps, width, dist) {
  const page = await openCalculator(browser, key, { width, dist });
  await run(page, steps);
  const result = await page.evaluate(() => {
    const out = {};
    const els = [document.querySelector('.lg-calc-wrap'), ...document.querySelectorAll('.lg-calc-wrap *')];
    els.forEach((el, i) => {
      const name = `${i} ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;
      const pseudos = ['', '::before', '::after'];
      if (el.matches('input, textarea')) pseudos.push('::placeholder');
      if (el.matches('summary, li')) pseudos.push('::marker');
      for (const pseudo of pseudos) {
        const cs = getComputedStyle(el, pseudo || null);
        const parts = [];
        // Custom properties (--lg-*) are inputs to the styles, not results; skip them.
        for (let j = 0; j < cs.length; j++) if (!cs[j].startsWith('--')) parts.push(cs[j] + '\u0001' + cs.getPropertyValue(cs[j]));
        out[name + pseudo] = parts.join('\u0002');
      }
    });
    return out;
  });
  await page.close();
  return result;
}

(async () => {
  const browser = await chromium.launch();
  let differences = 0;
  for (const key of Object.keys(scenarios)) {
    if (only && key !== only) continue;
    const names = Object.keys(scenarios[key]);
    for (const name of allScenarios ? names : names.slice(0, 2)) {
      for (const width of [1280, 620, 375]) {
        const steps = scenarios[key][name];
        const before = await styles(browser, key, steps, width, baseDist);
        const now = await styles(browser, key, steps, width, path.join(ROOT, 'dist'));
        const shown = [];
        for (const el of new Set([...Object.keys(before), ...Object.keys(now)])) {
          if (before[el] === now[el]) continue;
          const parse = (text) => Object.fromEntries((text || '').split('\u0002').map((pair) => pair.split('\u0001')));
          const a = parse(before[el]),
            b = parse(now[el]);
          for (const prop of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (a[prop] !== b[prop]) {
              differences++;
              if (shown.length < 8) shown.push(`  ${el} ${prop}: ${a[prop]} -> ${b[prop]}`);
            }
          }
        }
        console.log(`${shown.length ? 'DIFF' : 'same'}  ${key} / ${name} @ ${width}px`);
        shown.forEach((line) => console.log(line));
      }
    }
  }
  await browser.close();
  console.log(differences ? `${differences} style differences against ${ref}` : `No style differences against ${ref}`);
  process.exit(differences ? 1 : 0);
})();
