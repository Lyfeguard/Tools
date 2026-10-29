// Analytics: the site-wide click tracking (dist/lg-track.min.js) and the
// calculators' own events, both lyf_event pushes to the dataLayer (GA4 via GTM).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT, componentPageHtml, run } = require('./page');
const scenarios = require('./scenarios');

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
});

// A page at https://lyfeguard.com<pathname> (served from memory), with
// the given scripts.
async function sitePage(pathname, html, scripts) {
  const page = await browser.newPage();
  page.lgErrors = [];
  page.on('pageerror', (e) => page.lgErrors.push(String(e)));
  await page.route('https://lyfeguard.com/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === pathname) return route.fulfill({ contentType: 'text/html', body: html.replace('</head>', scripts.map((s) => `<script src="https://lyfeguard.com/__/${s}"></script>`).join('') + '</head>') });
    if (url.pathname.startsWith('/__/')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, url.pathname.slice(4))) });
    return route.fulfill({ status: 204 });
  });
  await page.route(/^https?:\/\/(?!lyfeguard\.com)/, (route) => route.abort());
  await page.goto('https://lyfeguard.com' + pathname);
  // Clicks don't navigate, so each one's event can be read.
  await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault()));
  return page;
}
const events = (page) => page.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'lyf_event'));

// Links and buttons of every kind the tracker knows about.
const LINKS = `<header><a href="/personal/pricing">Pricing</a><a href="https://app.lyfeguard.com/login">Log in</a></header>
<section class="hero"><a href="https://app.lyfeguard.com/register">Start free</a><a href="https://meetings.lyfeguard.com/meetings/fraser-stewart">Book a demo</a>
<a href="/guides/what-is-life-admin">Read the guide</a><a href="/tools/mortgage-calculator">Mortgage calculator</a><a href="/insights/held-away">Held-away assets</a></section>
<div data-track-section="faq"><a href="/professionals/legal">Legal</a><a href="mailto:hello@lyfeguard.com">Email us</a><a href="tel:+442000000000">Call</a>
<a href="/policies/privacy">Privacy</a><a href="/somewhere-else">Elsewhere</a><a href="/about" data-track-event="cta_click" data-track-action="custom" data-track-id="my-id" data-track-variant="b">About</a></div>
<footer><a href="/contact">Contact</a><a href="/somewhere-else">Elsewhere</a></footer><div data-track-ignore="true"><a href="/trust">Trust</a></div>`;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>${LINKS}</body></html>`;

test('lg-track tracks every click outside calculators exactly as the old footer code did', async () => {
  const clickAll = async (page) => {
    for (const a of await page.$$('a')) await a.click();
    return events(page);
  };
  const old = await sitePage('/guides/example', PAGE, ['test/fixtures/lg-track-before.js']);
  const now = await sitePage('/guides/example', PAGE, ['dist/lg-track.min.js']);
  const expected = await clickAll(old);
  assert.ok(expected.length >= 12, expected.length + ' events');
  assert.deepEqual(await clickAll(now), expected);
  assert.deepEqual(now.lgErrors, []);
  await old.close();
  await now.close();
});

test('lg-track: buttons with data-track-event, in-page links, loading twice', async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><button data-track-event="cta_click" data-track-action="open_chat">Chat</button>
<a href="#faq">Jump to FAQs</a><a href="/guides/example#faq">Same page</a></body></html>`;
  const page = await sitePage('/guides/example', html, ['dist/lg-track.min.js', 'dist/lg-track.min.js']);
  for (const el of await page.$$('button, a')) await el.click();
  assert.deepEqual(await events(page), [
    { event: 'lyf_event', ga4_event_name: 'cta_click', cta_action: 'open_chat', element_id: 'guides_example_body_open_chat_chat', element_text: 'Chat', element_location: 'body', audience: '' },
  ]);
  await page.close();
});

test('calculators: clicks inside are tracked, with the calculator events', async () => {
  const key = 'mortgage';
  const html = componentPageHtml(key, 'DIST', false).replace(/file:\/\/DIST\//g, 'https://lyfeguard.com/__/dist/');
  const page = await sitePage('/tools/mortgage-calculator', html.replace(/<script src="https:\/\/www\.lyfeguard\.com\/__\/dist\/v2\/mortgage\.min\.js" defer><\/script>/, ''), ['dist/lg-track.min.js', 'dist/v2/mortgage.min.js']);
  await page.waitForFunction(() => document.querySelector('lg-calculator').shadowRoot);
  const inside = (fn) => page.evaluate(fn);
  // Nothing before anyone uses it.
  assert.deepEqual(await events(page), []);

  await run(page, Object.values(scenarios[key])[1]);
  await inside(() => {
    const root = document.querySelector('lg-calculator').shadowRoot;
    root.querySelector('.lgc-sticky-link').click();
    // A link to the app inside the calculator, as in a call to action.
    const a = document.createElement('a');
    a.href = 'https://app.lyfeguard.com/register';
    a.textContent = 'Create free account';
    root.querySelector('.lg-calc').appendChild(a);
    a.click();
    root.querySelector('[data-clear]').click();
  });
  // A deposit above the price shows an error; another error doesn't add a second event.
  await run(page, Object.values(scenarios[key]).find((steps) => steps.some((s) => s[1] === '#lgmc-deposit' && s[2] === '250000')));
  await page.fill('#lgmc-deposit', '300000');
  await page.clock.runFor(3000);
  const got = await events(page);
  const names = got.map((e) => e.ga4_event_name);
  assert.deepEqual(names.slice(0, 5), ['calculator_start', 'calculator_result', 'calculator_see_results', 'cta_click', 'calculator_clear']);
  assert.equal(names.filter((n) => n === 'calculator_error').length, 1, 'one error event a page');
  assert.equal(names.filter((n) => n === 'calculator_start').length, 1);
  const cta = got.find((e) => e.ga4_event_name === 'cta_click');
  assert.equal(cta.element_location, 'calculator');
  assert.equal(cta.cta_action, 'create_account');
  assert.deepEqual(got[0], { event: 'lyf_event', ga4_event_name: 'calculator_start', cta_action: 'start', element_id: 'tools_mortgage_calculator_calculator_start', element_text: '', element_location: 'calculator', audience: 'consumer', content_topic: 'mortgage' });
  // Never the figures entered.
  assert.ok(!JSON.stringify(got).includes('350'), 'no figures');
  assert.deepEqual(page.lgErrors, []);
  await page.close();
});
