// Renders one calculator the way the Webflow CMS template does, using the
// built files in dist/, and reads back everything the calculator shows.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIXED_NOW = Date.UTC(2026, 9, 28, 12, 0, 0);

// wrapper 'cms': .lg-calc-wrap[data-calc] as in the Webflow template.
// wrapper 'plain': no data-calc and no lg-calc-wrap class, to prove styling
// depends only on the pasted markup.
function pageHtml(key, dist, wrapper = 'cms') {
  const markup = fs.readFileSync(path.join(ROOT, 'markup', key + '.html'), 'utf8');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="file://${dist}/lg-calc.min.css">
<script src="file://${dist}/lg-calc.min.js" defer></script>
<style>body{margin:0;background:#f3f7f6;font-family:Arial,sans-serif}.container{max-width:960px;margin:0 auto;padding:24px 16px}
.lg-calc-wrap,.plain-wrap{display:flex;flex-direction:column;gap:24px}*,*::before,*::after{transition:none!important;animation:none!important}</style>
</head><body><div class="container">${wrapper === 'plain' ? '<div class="plain-wrap">' : `<div class="lg-calc-wrap" data-calc="${key}">`}
<div class="lg-heading-wrap calculator"><h1 id="calc-heading">Calculator</h1></div>
<div class="lg-calc-markup w-richtext"><div class="w-embed">${markup}</div></div>
</div></div></body></html>`;
}

// Writes the page to a temp file and opens it. dist defaults to the repo's dist/.
async function openCalculator(browser, key, { width = 1280, dist = path.join(ROOT, 'dist'), wrapper = 'cms' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-calc-'));
  const file = path.join(dir, key + '.html');
  fs.writeFileSync(file, pageHtml(key, dist, wrapper));
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.lgErrors = [];
  page.on('pageerror', (e) => page.lgErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') page.lgErrors.push(m.text());
  });
  // A fixed clock keeps dates stable; timers (debounced updates) are run with runFor.
  await page.clock.install({ time: FIXED_NOW });
  // The sticky result bars depend on when the browser reports scroll position,
  // which isn't tied to the fake clock, so they stay hidden here. They're
  // checked in a real browser instead.
  await page.addInitScript(() => {
    window.IntersectionObserver = undefined;
  });
  await page.goto('file://' + file);
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.clock.runFor(1000);
  return page;
}

// Steps: ['fill', '#id', 'value'] | ['check', 'selector'] | ['select', '#id', 'value'] | ['click', 'selector']
async function run(page, steps) {
  for (const [action, selector, value] of steps) {
    if (action === 'fill') await page.fill(selector, value);
    else if (action === 'check') await page.check(selector);
    else if (action === 'select') await page.selectOption(selector, value);
    else if (action === 'click') await page.click(selector);
    else throw new Error('Unknown step ' + action);
  }
  await page.clock.runFor(3000);
}

// Everything visible to the user: text, hidden state, aria labels and the
// inline widths/positions of bars and markers, for every element with an id.
async function readOutputs(page) {
  return page.evaluate(() => {
    const out = {};
    const wrap = document.querySelector('.lg-calc-wrap');
    wrap.querySelectorAll('[id]').forEach((el) => {
      if (el.matches('input, select, textarea')) {
        const inv = el.getAttribute('aria-invalid');
        if (inv) out[el.id + '@invalid'] = inv;
        if (el.disabled) out[el.id + '@disabled'] = true;
        return;
      }
      const entry = { text: el.textContent.replace(/\s+/g, ' ').trim() };
      if (el.hidden) entry.hidden = true;
      if (el.disabled) entry.disabled = true;
      const label = el.getAttribute('aria-label');
      if (label) entry.label = label;
      if (el.style.width) entry.width = el.style.width;
      if (el.style.left) entry.left = el.style.left;
      Object.keys(el.dataset).forEach((k) => {
        if (!/^ready$|Ready$|^lgShared$/.test(k)) entry['data-' + k] = el.dataset[k]; // start-up markers aren't user-visible
      });
      if (el.tagName === 'svg' || el.closest('svg')) entry.text = entry.text.slice(0, 400);
      out[el.id] = entry;
    });
    return out;
  });
}

module.exports = { ROOT, openCalculator, run, readOutputs };
