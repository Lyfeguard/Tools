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
// template: the CMS template as v2 runs it: only this calculator's files
// (dist/v2/<key>.min.css and .min.js), no v1. { embed: true } adds an empty
// <lg-calculator> Code Embed after the Rich Text (as the v2 pilot did),
// which should show nothing.
function pageHtml(key, dist, wrapper = 'cms', template = null, siteCss = false) {
  const markup = fs.readFileSync(path.join(ROOT, 'markup', key + '.html'), 'utf8');
  const embed = template && template.embed ? `<div class="w-embed"><lg-calculator key="${key}"></lg-calculator></div>` : '';
  const files = template
    ? `<link rel="stylesheet" href="file://${dist}/v2/${key}.min.css">\n<script src="file://${dist}/v2/${key}.min.js" defer></script>`
    : `<link rel="stylesheet" href="file://${dist}/lg-calc.min.css">\n<script src="file://${dist}/lg-calc.min.js" defer></script>`;
  const site = siteCss ? `<link rel="stylesheet" href="file://${path.join(__dirname, 'fixtures', 'webflow-site.css')}">` : '';
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${site}${files}
<style>body{margin:0;background:#f3f7f6;font-family:Arial,sans-serif}.container{max-width:960px;margin:0 auto;padding:24px 16px}
.lg-calc-wrap,.plain-wrap{display:flex;flex-direction:column;gap:24px}*,*::before,*::after{transition:none!important;animation:none!important}</style>
</head><body><div class="container">${wrapper === 'plain' ? '<div class="plain-wrap">' : `<div class="lg-calc-wrap" data-calc="${key}">`}
<div class="lg-heading-wrap calculator"><h1 id="calc-heading">Calculator</h1></div>
<div class="lg-calc-markup w-richtext"><div class="w-embed">${markup}</div></div>${embed}
</div></div></body></html>`;
}

// Rules a site might have that would break a calculator styled from outside.
const HOSTILE_CSS = `lg-calculator{color:red!important;font:italic 30px/3 serif!important;letter-spacing:4px!important;padding:40px!important;
text-transform:uppercase!important;text-align:right!important;display:inline!important;border:5px solid red!important;visibility:visible}
p,label,h2,h3,input,select,button{color:red!important;margin:30px!important;font-size:40px!important}`;

// v2: the <lg-calculator> component (its markup, as in the CMS field), on a
// page that loads only that calculator's files, as the Tools template does.
// siteCss adds the Webflow site's CSS (test/fixtures/webflow-site.css) and
// the hostile rules above.
function componentPageHtml(key, dist, siteCss) {
  const markup = fs.readFileSync(path.join(ROOT, 'markup', key + '.html'), 'utf8');
  const site = siteCss ? `<link rel="stylesheet" href="file://${path.join(__dirname, 'fixtures', 'webflow-site.css')}"><style>${HOSTILE_CSS}</style>` : '';
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${site}<link rel="stylesheet" href="file://${dist}/v2/${key}.min.css">
<script src="file://${dist}/v2/${key}.min.js" defer></script>
<style>body{margin:0!important}*,*::before,*::after{transition:none!important;animation:none!important}</style>
</head><body><main style="display:block;max-width:960px;margin:0 auto;padding:24px 16px;box-sizing:border-box">
${markup}
</main></body></html>`;
}

// Writes the page to a temp file and opens it. dist defaults to the repo's dist/.
// version 'v2' renders the <lg-calculator> component instead of the pasted markup.
// hash: what follows # in the address (figures handed over by another calculator).
async function openCalculator(browser, key, { width = 1280, dist = path.join(ROOT, 'dist'), wrapper = 'cms', version = 'v1', siteCss = false, template = null, hash = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-calc-'));
  const file = path.join(dir, key + '.html');
  fs.writeFileSync(file, version === 'v2' ? componentPageHtml(key, dist, siteCss) : pageHtml(key, dist, wrapper, template, siteCss));
  // The page's no-transition rule can't reach inside the component; reduced
  // motion switches its transitions off instead.
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: version === 'v2' || template ? 'reduce' : 'no-preference' });
  page.lgErrors = [];
  page.on('pageerror', (e) => page.lgErrors.push(String(e)));
  page.on('console', (m) => {
    if (siteCss && /^https?:/.test(m.location().url)) return; // the site CSS's fonts and images, see below
    if (m.type() === 'error' || m.type() === 'warning') page.lgErrors.push(m.text());
  });
  // A fixed clock keeps dates stable; timers (debounced updates) are run with runFor.
  await page.clock.install({ time: FIXED_NOW });
  // The sticky result bars depend on when the browser reports scroll position,
  // which isn't tied to the fake clock, so they stay hidden here. They're
  // checked in a real browser instead.
  await page.addInitScript(() => {
    window.IntersectionObserver = undefined;
    // The page's no-transition rule can't reach inside a component, so add it
    // there too (components are set up before DOMContentLoaded).
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('lg-calculator').forEach((el) => {
        if (!el.shadowRoot) return;
        const style = document.createElement('style');
        style.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
        el.shadowRoot.appendChild(style);
      });
    });
  });
  // The site CSS refers to fonts and images on Webflow's CDN; the tests run offline.
  // Those requests are refused, and the failures left out of page.lgErrors.
  if (siteCss) await page.route(/^https?:/, (route) => route.abort());
  await page.goto('file://' + file + hash);
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
    const host = document.querySelector('lg-calculator');
    const wrap = host && host.shadowRoot ? host.shadowRoot : document.querySelector('.lg-calc-wrap');
    wrap.querySelectorAll('[id]').forEach((el) => {
      if (el.matches('input, select, textarea')) {
        const inv = el.getAttribute('aria-invalid');
        if (inv) out[el.id + '@invalid'] = inv;
        if (el.disabled) out[el.id + '@disabled'] = true;
        return;
      }
      // v2's PDF summary button (not in v1) is left out of the text.
      let text = el.textContent;
      el.querySelectorAll('.lgc-pdf').forEach((b) => (text = text.replace(b.textContent, '')));
      const entry = { text: text.replace(/\s+/g, ' ').trim() };
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

module.exports = { ROOT, openCalculator, run, readOutputs, pageHtml, componentPageHtml };
