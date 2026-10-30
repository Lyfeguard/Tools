/*!
 * Lyfeguard calculators | lg-calc.js | v1.9.0
 * One file for every /tools calculator. Each module starts only when its
 * markup is on the page, so the same file is safe to load on every calculator.
 * Load with: <script src=".../lg-calc.js" defer></script>
 */
(function (window, document) {
  'use strict';

  var LG = (window.LyfeTools = window.LyfeTools || {});
  LG.version = '1.9.0';

  /* ------------------------------------------------------------------
     Core: start-up helpers
     ------------------------------------------------------------------ */
  function report(key, error) {
    if (window.console && console.error) console.error('[Lyfeguard calculators] ' + key + ':', error);
  }

  // Run fn once the DOM is parsed and every deferred script has run (at
  // DOMContentLoaded), so a calculator the v2 <lg-calculator> script has
  // already taken over is left alone. Works with defer, async or inline loading.
  function domContentLoaded() {
    if (document.readyState === 'complete') return true;
    var nav = window.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    return !!(nav && nav.domContentLoadedEventStart > 0);
  }
  LG.ready = function (fn) {
    function run() {
      try {
        fn();
      } catch (error) {
        report('init', error);
      }
    }
    if (domContentLoaded()) run();
    else document.addEventListener('DOMContentLoaded', run, { once: true });
  };

  // Each calculator is isolated: an error in one never stops the others.
  function module(key, factory) {
    try {
      factory();
    } catch (error) {
      report(key, error);
    }
  }

  /* @v2:core-start (scripts/build-v2.js copies from here to @v2:core-end) */
  /* ------------------------------------------------------------------
     Core: shared .xlsx writer (net worth and inheritance tax downloads)
     Builds a real Excel workbook without loading any external library.
     ------------------------------------------------------------------ */
  function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }
  function workbookZip(fileContents) {
    const encoder = new TextEncoder();
    const locals = [],
      centrals = [];
    let offset = 0;
    for (const [name, content] of fileContents) {
      const filename = encoder.encode(name),
        bytes = encoder.encode(content);
      const checksum = crc32(bytes);
      const local = new Uint8Array(30 + filename.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint32(14, checksum, true);
      dv.setUint32(18, bytes.length, true);
      dv.setUint32(22, bytes.length, true);
      dv.setUint16(26, filename.length, true);
      local.set(filename, 30);
      locals.push(local, bytes);
      const central = new Uint8Array(46 + filename.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint32(16, checksum, true);
      cv.setUint32(20, bytes.length, true);
      cv.setUint32(24, bytes.length, true);
      cv.setUint16(28, filename.length, true);
      cv.setUint32(42, offset, true);
      central.set(filename, 46);
      centrals.push(central);
      offset += local.length + bytes.length;
    }
    const centralLength = centrals.reduce((n, x) => n + x.length, 0);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, fileContents.length, true);
    view.setUint16(10, fileContents.length, true);
    view.setUint32(12, centralLength, true);
    view.setUint32(16, offset, true);
    return new Blob([...locals, ...centrals, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  LG.xlsx = { zip: workbookZip, crc32: crc32 };

  /* ------------------------------------------------------------------
     Core: UK Income Tax, employee National Insurance and student loans
     The figures for the tax year are in data/2026-27.json, put in here by
     the build (scripts/data.js). Each April, add the new year's file and
     point the marker below at it. Every calculator reads from LG.taxYear.
     ------------------------------------------------------------------ */
  var YEAR = (LG.taxYear = /* @data:2026-27 */ null);
  var TAX = {
    taxYear: YEAR.taxYear,
    personalAllowance: YEAR.incomeTax.personalAllowance,
    taperStart: YEAR.incomeTax.taperStart,
    basicBand: YEAR.incomeTax.basicBand,
    additionalThreshold: YEAR.incomeTax.additionalThreshold,
    niPrimary: YEAR.nationalInsurance.primaryThreshold,
    niUpper: YEAR.nationalInsurance.upperEarningsLimit,
    // Auto-enrolment qualifying earnings
    qualifyingLower: YEAR.autoEnrolment.qualifyingLower,
    qualifyingUpper: YEAR.autoEnrolment.qualifyingUpper,
  };
  // Rates on taxable income above the Personal Allowance: [band top, rate, name].
  // Scotland: the Scottish bands as they apply after the full allowance.
  var SCOTLAND = YEAR.incomeTax.scotland.map(function (b) {
    return [b.upTo === null ? Infinity : b.upTo, b.rate, b.name];
  });
  var REST_OF_UK = [
    [TAX.basicBand, YEAR.incomeTax.rates.basic, 'Basic rate'],
    [TAX.additionalThreshold, YEAR.incomeTax.rates.higher, 'Higher rate'],
    [Infinity, YEAR.incomeTax.rates.additional, 'Additional rate'],
  ];
  // Repayment thresholds a year and rates; repayments are on pay above the threshold.
  var STUDENT_LOANS = YEAR.studentLoans;
  // The allowance shrinks by 1 for every 2 of income over 100,000.
  function personalAllowance(taxableIncome) {
    var pa = TAX.personalAllowance;
    if (taxableIncome > TAX.taperStart) pa = Math.max(0, pa - Math.floor((taxableIncome - TAX.taperStart) / 2));
    return pa;
  }
  // region: 'scotland' for Scottish rates; anything else is England, Wales and Northern Ireland.
  function incomeTax(taxableIncome, region) {
    var t = Math.max(0, taxableIncome - personalAllowance(taxableIncome));
    var bands = region === 'scotland' ? SCOTLAND : REST_OF_UK;
    var tax = 0;
    var low = 0;
    bands.forEach(function (b) {
      tax += Math.max(0, Math.min(t, b[0]) - low) * b[1];
      low = b[0];
    });
    return tax;
  }
  // The rate band the next pound of taxable income falls in, or null if it's tax-free.
  function taxBand(taxableIncome, region) {
    var t = taxableIncome - personalAllowance(taxableIncome);
    if (t <= 0) return null;
    var bands = region === 'scotland' ? SCOTLAND : REST_OF_UK;
    for (var i = 0; i < bands.length; i++) if (t <= bands[i][0]) return { name: bands[i][2], rate: bands[i][1] };
    return null;
  }
  function employeeNI(gross) {
    var main = Math.min(Math.max(gross - TAX.niPrimary, 0), TAX.niUpper - TAX.niPrimary);
    var upper = Math.max(gross - TAX.niUpper, 0);
    return main * YEAR.nationalInsurance.mainRate + upper * YEAR.nationalInsurance.upperRate;
  }
  // Yearly repayment, in whole pounds as payroll rounds down.
  function studentLoan(pay, plan) {
    var p = STUDENT_LOANS[plan];
    return p ? Math.floor(Math.max(0, pay - p.threshold) * p.rate) : 0;
  }
  LG.ukTax = {
    rates: TAX,
    incomeTax: incomeTax,
    employeeNI: employeeNI,
    personalAllowance: personalAllowance,
    taxBand: taxBand,
    studentLoan: studentLoan,
    studentLoans: STUDENT_LOANS,
  };

  /* ------------------------------------------------------------------
     Core: shared helpers used by every calculator
     ------------------------------------------------------------------ */
  var GBP_FORMATS = {};
  function gbpFormat(digits) {
    if (!GBP_FORMATS[digits]) {
      GBP_FORMATS[digits] = new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    }
    return GBP_FORMATS[digits];
  }
  // Format pounds. digits: 0 or 2; leave it out to show pence only when there are any.
  LG.money = function (n, digits) {
    if (digits === undefined) digits = Math.abs(Math.round(n * 100)) % 100 === 0 ? 0 : 2;
    return gbpFormat(digits).format(n);
  };

  // Read a number typed by the user. Accepts an optional pound sign, spaces,
  // and commas only as thousands separators ("12,500" but not "1,2,3").
  // Returns { entered, valid, value }; blank is entered: false, value: NaN.
  LG.parseNumber = function (raw, maxDecimals) {
    var text = String(raw == null ? '' : raw).replace(/[\u00A3\s]/g, '');
    if (text === '') return { entered: false, valid: true, value: NaN };
    var places = maxDecimals === undefined ? 2 : maxDecimals;
    var decimals = places > 0 ? '(?:\\.\\d{0,' + places + '})?' : '';
    var shape = new RegExp('^(?:\\d{1,3}(?:,\\d{3})+' + decimals + '|\\d+' + decimals + (places > 0 ? '|\\.\\d{1,' + places + '}' : '') + ')$');
    if (!shape.test(text)) return { entered: true, valid: false, value: NaN };
    var value = Number(text.replace(/,/g, ''));
    return { entered: true, valid: Number.isFinite(value), value: value };
  };

  // Standard start-up for a calculator: finds its panel, checks the required
  // element ids are present, and runs setup once. Returns nothing.
  //   LG.start({ name, panel, required, setup(root, get) })
  // get(id) looks up document.getElementById(id). root is the CMS wrapper
  // (.lg-calc-wrap / [data-calc]) holding the panel, or the page body.
  LG.start = function (options) {
    LG.ready(function () {
      var panel = document.getElementById(options.panel);
      if (!panel) return; // not this calculator's page
      var root = panel.closest('[data-calc], .lg-calc-wrap') || document.body;
      var flag = 'lgReady' + options.panel.replace(/[^a-z0-9]/gi, '');
      if (root.dataset[flag] === 'true') return;
      var get = function (id) {
        return document.getElementById(id);
      };
      var missing = (options.required || []).filter(function (id) {
        return !get(id);
      });
      if (missing.length) {
        if (window.console && console.warn) console.warn('[Lyfeguard ' + options.name + '] Missing IDs:', missing.join(', '));
        return;
      }
      root.dataset[flag] = 'true';
      options.setup(root, get);
    });
  };

  // Format a percentage with up to `digits` decimal places (default 1): 12.5%.
  var PCT_FORMATS = {};
  LG.percent = function (n, digits) {
    var d = digits === undefined ? 1 : digits;
    if (!PCT_FORMATS[d]) PCT_FORMATS[d] = new Intl.NumberFormat('en-GB', { maximumFractionDigits: d });
    return PCT_FORMATS[d].format(n) + '%';
  };

  // Mark a field as invalid for assistive technology and styling, or clear the mark.
  LG.markInvalid = function (el, invalid) {
    if (!el) return;
    if (invalid) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  };

  // Show or clear a calculator's error message (an element with role="alert").
  LG.showError = function (el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
    el.style.display = message ? 'block' : 'none';
  };

  /* @v2:core-end */

  /* ------------------------------------------------------------------
     Core: shared behaviours, switched on by data attributes in the markup
     ------------------------------------------------------------------ */
  // Text that means "no result yet".
  var NO_RESULT = /^(?:|\u2014|\u2013|\u00A3\u2013|\u00A3\u2014)$/;
  function textOf(id) {
    var el = document.getElementById(id);
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function watchText(ids, fn) {
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) new MutationObserver(fn).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  // <div class="lgc-sticky" data-source="id" data-results="id" hidden> with a
  // [data-sticky-value] inside: on narrow screens, shows the source's text while
  // the results are further down the page.
  function initSticky(bar) {
    var results = document.getElementById(bar.getAttribute('data-results'));
    var value = bar.querySelector('[data-sticky-value]');
    var sourceId = bar.getAttribute('data-source');
    // Optional: data-source-label="id" keeps the label in step with a heading that changes.
    var labelId = bar.getAttribute('data-source-label');
    var label = bar.querySelector('.lgc-sticky-label');
    if (!results || !value || !document.getElementById(sourceId)) return;
    var below = false;
    function update() {
      var text = textOf(sourceId);
      value.textContent = text;
      if (labelId && label && textOf(labelId)) label.textContent = textOf(labelId);
      bar.hidden = NO_RESULT.test(text) || !below;
    }
    watchText(labelId ? [sourceId, labelId] : [sourceId], update);
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          below = !e.isIntersecting && e.boundingClientRect.top > 0;
        });
        update();
      }).observe(results);
    }
    update();
  }

  // <p class="lgc-sr-only" aria-live="polite" data-announce="id id">: reads out
  // those elements' text once, after typing pauses, instead of a whole panel.
  function initAnnouncer(el) {
    var ids = el.getAttribute('data-announce').split(/\s+/).filter(Boolean);
    var prefix = el.getAttribute('data-announce-prefix') || '';
    var timer = null;
    watchText(ids, function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var parts = ids.map(textOf);
        var ready = parts.length && !parts.some(function (t) { return NO_RESULT.test(t); });
        // A label then an amount reads as one phrase; whole sentences get a full stop.
        var text = parts.reduce(function (acc, t) {
          return acc ? acc + (/[A-Za-z]$/.test(acc) && /^[^A-Za-z]/.test(t) ? ' ' : '. ') + t : t;
        }, '');
        el.textContent = ready ? (prefix ? prefix + ' ' : '') + text.replace(/\.\s*\./g, '.') : '';
      }, 900);
    });
  }

  // <button data-clear>: puts every field in the calculator back to how the
  // page loaded it, then lets the calculator update.
  function initClear(button, root) {
    button.addEventListener('click', function () {
      var fields = root.querySelectorAll('input, select, textarea');
      var first = null;
      fields.forEach(function (el) {
        if (el.type === 'radio' || el.type === 'checkbox') el.checked = el.defaultChecked;
        else if (el.tagName === 'SELECT')
          Array.prototype.forEach.call(el.options, function (o) {
            o.selected = o.defaultSelected;
          });
        else el.value = el.defaultValue;
        if (!first && el.type !== 'radio' && el.type !== 'checkbox' && !el.disabled) first = el;
      });
      fields.forEach(function (el) {
        // An unchecked radio firing change would look like the user picked it.
        if (el.type === 'radio' && !el.checked) return;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (first) first.focus();
    });
  }

  // <button class="lgc-tip-button" aria-expanded="false" aria-controls="id">:
  // a (?) that shows or hides the explanation it controls.
  function initTip(button) {
    var tip = document.getElementById(button.getAttribute('aria-controls'));
    if (!tip) return;
    function show(open) {
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      tip.hidden = !open;
    }
    button.addEventListener('click', function () {
      show(button.getAttribute('aria-expanded') !== 'true');
    });
    button.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') show(false);
    });
  }

  LG.ready(function () {
    document.querySelectorAll('.lg-calc').forEach(function (root) {
      if (root.dataset.lgShared === 'true') return;
      root.dataset.lgShared = 'true';
      root.querySelectorAll('.lgc-tip-button[aria-controls]').forEach(initTip);
      root.querySelectorAll('.lgc-sticky[data-source]').forEach(initSticky);
      root.querySelectorAll('[data-announce]').forEach(initAnnouncer);
      root.querySelectorAll('[data-clear]').forEach(function (b) {
        initClear(b, root);
      });
    });
  });

  // Inputs with data-format="money" are tidied to 12,500 style when you leave them.
  document.addEventListener(
    'focusout',
    function (event) {
      var el = event.target;
      if (!el || !el.matches || !el.matches('.lg-calc input[data-format="money"]')) return;
      var item = LG.parseNumber(el.value, 2);
      if (item.entered && item.valid) el.value = item.value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
    },
    true,
  );

  /* ==================================================================
     Net worth calculator  [net-worth]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:net-worth-start */
  module('net-worth', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    'use strict';

    const ASSETS = [
      { id: 'current-accounts', label: 'Current accounts', color: '#079d8a' },
      { id: 'cash', label: 'Savings & cash', color: '#68c6b4' },
      { id: 'isa', label: 'ISAs', color: '#164f60' },
      { id: 'investments', label: 'Other investments', color: '#819eae' },
      { id: 'pensions', label: 'Pension pots', color: '#787ba6' },
      { id: 'property', label: 'Your home', color: '#d8aa77' },
      { id: 'other-property', label: 'Other property', color: '#ae835d' },
      { id: 'vehicles', label: 'Vehicles', color: '#bacbc3' },
      { id: 'business', label: 'Business interests', color: '#617d9b' },
      { id: 'other-assets', label: 'Other valuable assets', color: '#d28e8b' },
    ];
    const LIABILITIES = [
      { id: 'mortgage', label: 'Mortgages' },
      { id: 'car-finance', label: 'Car finance' },
      { id: 'credit-cards', label: 'Credit cards' },
      { id: 'personal-loans', label: 'Personal loans' },
      { id: 'overdraft', label: 'Overdrafts' },
      { id: 'student-loan', label: 'Student loans' },
      { id: 'other-debts', label: 'Other debts' },
    ];
    const ALL = ASSETS.concat(LIABILITIES);
    const NS = 'http://www.w3.org/2000/svg';
    const get = (id) => scope.getElementById(id);
    const set = (id, value) => {
      const node = get(id);
      if (node) node.textContent = value;
    };
    const dateLabel = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const pence = (n) => Math.round(n * 100);
    const pounds = (cents) => cents / 100;
    const money = (cents) => LG.money(pounds(cents), cents % 100 === 0 ? 0 : 2);
    const ratioText = (n) => LG.percent(n);
    const compact = (cents) => {
      const amount = pounds(cents);
      if (amount >= 1e9) return '\u00A3' + (amount / 1e9).toFixed(1).replace(/\.0$/, '') + 'bn';
      if (amount >= 1e6) return '\u00A3' + (amount / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
      if (amount >= 1e5) return '\u00A3' + (amount / 1e3).toFixed(0) + 'k';
      return money(cents);
    };

    function createSvg(tag, attrs, text) {
      const el = document.createElementNS(NS, tag);
      Object.entries(attrs || {}).forEach(([name, value]) => el.setAttribute(name, String(value)));
      if (text !== undefined) el.textContent = text;
      return el;
    }

    function readAmount(id) {
      const input = get('lgnw-' + id);
      const item = LG.parseNumber(input.value, 2);
      if (!item.entered) return { valid: true, cents: 0, entered: false };
      const valid = item.valid && item.value <= 1e12;
      return { valid, cents: valid ? pence(item.value) : 0, entered: true };
    }

    function showInvalid(group, invalid) {
      const all = group === 'assets' ? ASSETS : LIABILITIES;
      const error = get('lgnw-' + group + '-error');
      all.forEach((item) => {
        const input = get('lgnw-' + item.id);
        if (input) {
          const bad = invalid.includes(item.id);
          input.setAttribute('aria-invalid', bad ? 'true' : 'false');
          input.setAttribute('aria-describedby', bad ? 'lgnw-' + group + '-error' : 'lgnw-' + group + '-note');
        }
      });
      if (error) {
        error.textContent = invalid.length
          ? 'Enter valid amounts of \u00A30 or more, using up to two decimal places (maximum \u00A31 trillion per field).'
          : '';
        error.hidden = invalid.length === 0;
      }
    }

    function buildModel() {
      const values = {},
        entered = {},
        invalidAssets = [],
        invalidLiabilities = [];
      let hasEntries = false;
      for (const item of ASSETS) {
        const v = readAmount(item.id);
        if (!v.valid) invalidAssets.push(item.id);
        values[item.id] = v.cents;
        entered[item.id] = v.entered;
        hasEntries = hasEntries || v.entered;
      }
      for (const item of LIABILITIES) {
        const v = readAmount(item.id);
        if (!v.valid) invalidLiabilities.push(item.id);
        values[item.id] = v.cents;
        entered[item.id] = v.entered;
        hasEntries = hasEntries || v.entered;
      }
      showInvalid('assets', invalidAssets);
      showInvalid('liabilities', invalidLiabilities);
      if (invalidAssets.length || invalidLiabilities.length) return null;
      const totalAssets = ASSETS.reduce((n, item) => n + values[item.id], 0);
      const totalLiabilities = LIABILITIES.reduce((n, item) => n + values[item.id], 0);
      return {
        values,
        entered,
        hasEntries,
        totalAssets,
        totalLiabilities,
        net: totalAssets - totalLiabilities,
        scope: (scope.querySelector('input[name="lgnw-scope"]:checked') || {}).value || 'personal',
      };
    }

    function renderBridge(model) {
      const svg = get('lgnw-bridge-svg');
      if (!svg) return;
      const wrap = svg.parentElement;
      const empty = get('lgnw-bridge-empty');
      svg.replaceChildren();
      if (!model || !model.hasEntries) {
        if (empty) empty.hidden = false;
        svg.setAttribute('aria-label', 'Enter assets and liabilities to see how net worth is calculated');
        return;
      }
      if (empty) empty.hidden = true;
      const W = Math.max(280, Math.round(svg.getBoundingClientRect().width || wrap.clientWidth || 900));
      const H = W < 500 ? 220 : 242;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('height', H);
      const A = model.totalAssets,
        L = model.totalLiabilities,
        N = model.net;
      const highest = Math.max(A, 0),
        lowest = Math.min(N, 0);
      const scale = Math.max(100, highest - lowest);
      const vmax = highest + 0.13 * scale;
      const vmin = lowest - 0.13 * scale;
      const top = 17,
        bottom = H - 17;
      const y = (value) => top + ((vmax - value) / (vmax - vmin)) * (bottom - top);
      const zeroY = y(0);
      const centres = [0.18, 0.5, 0.82].map((pos) => pos * W);
      const bw = Math.min(105, Math.max(28, W * 0.17));
      const canvas = createSvg('g');
      svg.appendChild(canvas);
      const line = (x1, y1, x2, y2, colour, dash) =>
        canvas.appendChild(
          createSvg('line', {
            x1,
            y1,
            x2,
            y2,
            stroke: colour,
            'stroke-width': 1.3,
            ...(dash ? { 'stroke-dasharray': dash } : {}),
          }),
        );
      const rect = (cx, v0, v1, colour) => {
        const a = Math.min(y(v0), y(v1)),
          b = Math.max(y(v0), y(v1));
        const height = Math.max(2, b - a);
        canvas.appendChild(
          createSvg('rect', {
            x: cx - bw / 2,
            y: a,
            width: bw,
            height,
            rx: Math.min(7, height / 2),
            fill: colour,
          }),
        );
      };
      // A waterfall bridge: the middle bar deducts liabilities from assets.
      line(18, zeroY, W - 18, zeroY, '#b8cec9', '4 5');
      if (W > 500)
        canvas.appendChild(
          createSvg(
            'text',
            {
              x: 19,
              y: zeroY - 7,
              fill: '#7e9698',
              'font-family': 'Manrope, sans-serif',
              'font-size': 11,
            },
            '\u00A30',
          ),
        );
      line(centres[0] + bw / 2 + 4, y(A), centres[1] - bw / 2 - 4, y(A), '#9dc8be', '4 5');
      line(centres[1] + bw / 2 + 4, y(N), centres[2] - bw / 2 - 4, y(N), '#9dc8be', '4 5');
      rect(centres[0], 0, A, '#099e89');
      rect(centres[1], A, N, '#dbaa89');
      rect(centres[2], 0, N, N < 0 ? '#c67d69' : '#176878');
      svg.setAttribute('aria-label', `Assets ${money(A)}, less liabilities ${money(L)}, equals net worth ${money(N)}.`);
    }

    function renderAssetComposition(model) {
      const svg = get('lgnw-asset-donut');
      const group = get('lgnw-asset-segments');
      const legend = get('lgnw-asset-legend');
      if (!svg || !group || !legend) return;
      group.replaceChildren();
      legend.replaceChildren();
      if (!model || !model.hasEntries || model.totalAssets <= 0) {
        const empty = document.createElement('p');
        empty.className = 'lgnw-empty';
        empty.textContent = 'Enter assets above to see where your wealth sits.';
        legend.appendChild(empty);
        set('lgnw-asset-donut-total', model && model.hasEntries ? '\u00A30' : '\u2014');
        svg.setAttribute('aria-label', 'No positive asset values to chart');
        return;
      }
      const total = model.totalAssets;
      const r = 89,
        circumference = 2 * Math.PI * r;
      let progress = 0;
      const description = [];
      for (const item of ASSETS) {
        const amount = model.values[item.id];
        if (!amount) continue;
        const fraction = amount / total;
        const segment = createSvg('circle', {
          cx: 120,
          cy: 120,
          r,
          fill: 'none',
          stroke: item.color,
          'stroke-width': 27,
          'stroke-dasharray': `${fraction * circumference} ${circumference}`,
          'stroke-dashoffset': -(progress * circumference),
        });
        group.appendChild(segment);
        progress += fraction;
        description.push(item.label + ' ' + ratioText(fraction * 100));
        const row = document.createElement('div');
        row.className = 'lgnw-legend-row';
        const name = document.createElement('span');
        name.className = 'lgnw-legend-label';
        const dot = document.createElement('i');
        dot.className = 'lgnw-legend-dot';
        dot.style.setProperty('--dot', item.color);
        dot.setAttribute('aria-hidden', 'true');
        const title = document.createElement('span');
        title.textContent = item.label;
        name.append(dot, title);
        const val = document.createElement('strong');
        val.className = 'lgnw-legend-amount';
        val.textContent = money(amount);
        const pct = document.createElement('span');
        pct.className = 'lgnw-legend-pct';
        pct.textContent = ratioText(fraction * 100) + ' of assets';
        row.append(name, val, pct);
        legend.appendChild(row);
      }
      set('lgnw-asset-donut-total', compact(total));
      svg.setAttribute('aria-label', 'Asset composition: ' + description.join('; '));
    }

    function renderDebtBreakdown(model) {
      const list = get('lgnw-debt-bars');
      if (!list) return;
      list.replaceChildren();
      if (!model || model.totalLiabilities === 0) {
        const empty = document.createElement('p');
        empty.className = 'lgnw-empty';
        empty.textContent = model && model.hasEntries ? 'No outstanding debts entered.' : 'Enter outstanding debts to see the breakdown.';
        list.appendChild(empty);
        return;
      }
      const items = LIABILITIES.filter((item) => model.values[item.id] > 0).sort((a, b) => model.values[b.id] - model.values[a.id]);
      const maximum = model.values[items[0].id];
      for (const item of items) {
        const value = model.values[item.id];
        const row = document.createElement('div');
        row.className = 'lgnw-debt-row';
        const head = document.createElement('div');
        head.className = 'lgnw-debt-row-head';
        const name = document.createElement('span');
        name.textContent = item.label;
        const amount = document.createElement('strong');
        amount.textContent = money(value);
        head.append(name, amount);
        const track = document.createElement('div');
        track.className = 'lgnw-debt-track';
        track.setAttribute('role', 'img');
        track.setAttribute('aria-label', `${item.label}: ${money(value)}, ${ratioText((value / model.totalLiabilities) * 100)} of total debt`);
        const fill = document.createElement('div');
        fill.className = 'lgnw-debt-fill';
        fill.style.width = ((value / maximum) * 100).toFixed(3) + '%';
        track.appendChild(fill);
        const share = document.createElement('span');
        share.className = 'lgnw-debt-share';
        share.textContent = ratioText((value / model.totalLiabilities) * 100) + ' of total liabilities';
        row.append(head, track, share);
        list.appendChild(row);
      }
    }

    function clearOutputs() {
      const text = [
        'lgnw-assets-subtotal',
        'lgnw-liabilities-subtotal',
        'lgnw-net-worth',
        'lgnw-assets-total',
        'lgnw-liabilities-total',
        'lgnw-bridge-assets',
        'lgnw-bridge-liabilities',
        'lgnw-bridge-net',
        'lgnw-asset-donut-total',
        'lgnw-debt-total',
        'lgnw-liquid-investments',
        'lgnw-property-equity',
        'lgnw-debt-asset-ratio',
        'lgnw-net-ex-student',
      ];
      text.forEach((id) => set(id, '\u2014'));
      set('lgnw-results-context', 'Enter your figures above to see your financial position.');
      set('lgnw-scope-result', 'Estimated net worth');
      set('lgnw-method-dynamic', 'Net worth is calculated by subtracting your outstanding liabilities from your estimated asset values.');
      const panel = get('lgnw-results-panel');
      if (panel) panel.dataset.sign = 'neutral';
      const bridge = get('lgnw-bridge-panel');
      if (bridge) bridge.dataset.negative = 'false';
      const button = get('lgnw-export');
      if (button) button.disabled = true;
      renderBridge(null);
      renderAssetComposition(null);
      renderDebtBreakdown(null);
    }

    let lastModel = null;
    function update() {
      const model = buildModel();
      if (!model || !model.hasEntries) {
        lastModel = null;
        clearOutputs();
        return;
      }
      lastModel = model;
      const { values, entered, totalAssets: A, totalLiabilities: L, net: N } = model;
      const negative = N < 0;
      set('lgnw-assets-subtotal', money(A));
      set('lgnw-liabilities-subtotal', money(L));
      set('lgnw-assets-total', money(A));
      set('lgnw-liabilities-total', money(L));
      set('lgnw-net-worth', money(N));
      set('lgnw-bridge-assets', money(A));
      set('lgnw-bridge-liabilities', money(L));
      set('lgnw-bridge-net', money(N));
      set('lgnw-debt-total', money(L));
      set('lgnw-liquid-investments', money(values['current-accounts'] + values.cash + values.isa + values.investments));
      set(
        'lgnw-property-equity',
        values.property + values['other-property'] > 0 ? money(values.property + values['other-property'] - values.mortgage) : '\u2014',
      );
      set('lgnw-net-ex-student', money(N + values['student-loan']));
      set('lgnw-scope-result', model.scope === 'household' ? 'Estimated household net worth' : 'Estimated personal net worth');
      set('lgnw-debt-asset-ratio', A > 0 ? ratioText((100 * L) / A) : '\u2014');
      if (N > 0) set('lgnw-results-context', 'The estimated value of your assets exceeds your outstanding liabilities by ' + money(N) + '.');
      else if (N < 0)
        set('lgnw-results-context', 'Your liabilities exceed your assets by ' + money(-N) + '. This is a snapshot, not a judgement of financial wellbeing.');
      else set('lgnw-results-context', 'The estimated value of your assets equals your outstanding liabilities.');
      set(
        'lgnw-method-dynamic',
        `You entered total assets of ${money(A)} and liabilities of ${money(L)}. Net worth = ${money(A)} \u2212 ${money(L)} = ${money(N)}. Blank fields are treated as \u00A30. This is a gross balance-sheet estimate and does not adjust for taxes or selling costs.`,
      );
      const panel = get('lgnw-results-panel');
      if (panel) panel.dataset.sign = negative ? 'negative' : 'positive';
      const bridge = get('lgnw-bridge-panel');
      if (bridge) bridge.dataset.negative = String(negative);
      const button = get('lgnw-export');
      if (button) button.disabled = false;
      renderBridge(model);
      renderAssetComposition(model);
      renderDebtBreakdown(model);
    }

    const workbookZip = LG.xlsx.zip; // shared .xlsx writer (core)

    function makeExcel(model) {
      const xmlEsc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const cols = ['A', 'B', 'C'];
      const rows = [];
      const add = (a, b, c, style) => rows.push({ a, b, c, style });
      add('Lyfeguard | Net Worth Snapshot', null, null, 1);
      add('Calculated on', dateLabel());
      add('Calculation basis', model.scope === 'household' ? 'Household' : 'Personal');
      add();
      add('Section', 'Category', 'Amount (GBP)', 1);
      ASSETS.forEach((item) => add('Assets', item.label, pounds(model.values[item.id]), 2));
      add('', 'TOTAL ASSETS', pounds(model.totalAssets), 4);
      add();
      LIABILITIES.forEach((item) => add('Liabilities', item.label, pounds(model.values[item.id]), 2));
      add('', 'TOTAL LIABILITIES', pounds(model.totalLiabilities), 4);
      add();
      add('', 'NET WORTH', pounds(model.net), 4);
      add(
        'Insights',
        'Cash, savings, ISAs & investments',
        pounds(model.values['current-accounts'] + model.values.cash + model.values.isa + model.values.investments),
        2,
      );
      if (model.values.property + model.values['other-property'] > 0)
        add('Insights', 'Indicative property equity', pounds(model.values.property + model.values['other-property'] - model.values.mortgage), 2);
      add('Insights', 'Net worth excluding student loans (comparison)', pounds(model.net + model.values['student-loan']), 2);
      if (model.totalAssets > 0) add('Insights', 'Liabilities / assets', model.totalLiabilities / model.totalAssets, 3);
      add();
      add('Notes', 'This is an estimate based on values you entered, not financial advice.');
      add(
        'Notes',
        'Assets are gross valuations; liabilities are outstanding balances. Use a consistent personal or household basis for joint assets and debts.',
      );
      add('Notes', 'No taxes, fees, selling costs or restrictions on asset access are modelled. Student loan repayments can be conditional on income.');
      const cells = (row, index) => {
        let result = '';
        [row.a, row.b, row.c].forEach((value, i) => {
          if (value === undefined || value === null) return;
          const ref = cols[i] + index;
          const style = typeof value === 'number' ? row.style || 2 : row.style === 1 ? 1 : 0;
          if (typeof value === 'number') result += `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
          else result += `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${xmlEsc(value)}</t></is></c>`;
        });
        return `<row r="${index}">${result}</row>`;
      };
      const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="17" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/></cols><sheetData>${rows.map((row, i) => cells(row, i + 1)).join('')}</sheetData></worksheet>`;
      const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;\u00A3&quot;#,##0.00;[Red](&quot;\u00A3&quot;#,##0.00)"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FF082C37"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
      const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
      const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
      const book = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Net Worth Snapshot" sheetId="1" r:id="rId1"/></sheets></workbook>`;
      const bookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
      return workbookZip([
        ['[Content_Types].xml', types],
        ['_rels/.rels', rootRels],
        ['xl/workbook.xml', book],
        ['xl/_rels/workbook.xml.rels', bookRels],
        ['xl/worksheets/sheet1.xml', sheet],
        ['xl/styles.xml', styles],
      ]);
    }

    function init(root) {
      scope = root.getRootNode();
      set('lgnw-snapshot-date', 'Calculated ' + dateLabel());
      ALL.forEach((item) => {
        const input = get('lgnw-' + item.id);
        input.addEventListener('input', update);
        input.addEventListener('change', update);
      });
      scope.querySelectorAll('input[name="lgnw-scope"]').forEach((input) => input.addEventListener('change', update));
      const exportButton = get('lgnw-export');
      if (exportButton)
        exportButton.addEventListener('click', () => {
          if (!lastModel || !lastModel.hasEntries) return;
          const blob = makeExcel(lastModel);
          const objectURL = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectURL;
          link.download = 'lyfeguard-net-worth-' + new Date().toISOString().slice(0, 10) + '.xlsx';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(objectURL), 2000);
        });
      const reset = get('lgnw-reset');
      if (reset)
        reset.addEventListener('click', () => {
          if (!ALL.some((item) => get('lgnw-' + item.id).value.trim())) return;
          if (!window.confirm('Clear all asset and liability figures from this calculator?')) return;
          ALL.forEach((item) => {
            get('lgnw-' + item.id).value = '';
          });
          update();
          const first = get('lgnw-current-accounts');
          if (first) first.focus();
        });
      const svg = get('lgnw-bridge-svg');
      if (svg && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          if (lastModel) renderBridge(lastModel);
        });
        observer.observe(svg.parentElement);
      } else if (svg) {
        window.addEventListener('resize', () => {
          if (lastModel) renderBridge(lastModel);
        });
      }
      update();
    }
    LG.start({ name: 'Net Worth', panel: 'lgnw-assets-panel', required: ALL.map((item) => 'lgnw-' + item.id), setup: init });
  });
  /* @v2:net-worth-end */

  /* ==================================================================
     Inheritance tax calculator  [inheritance-tax]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:inheritance-tax-start */
  module('inheritance-tax', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    'use strict';

    const PREFIX = 'lgiht-';
    const get = (id) => scope.getElementById(PREFIX + id);
    const write = (id, value) => {
      const el = get(id);
      if (el) el.textContent = value;
    };
    const ASSETS = ['home', 'other-property', 'cash', 'investments', 'possessions', 'insurance', 'pensions', 'pensions-2027', 'business', 'other'];
    const DEBTS = ['mortgage', 'debts', 'funeral'];
    const OTHERS = ['spouse', 'charity', 'home-equity', 'transfer-nrb', 'transfer-rnrb', 'gifts', 'business-relief'];
    const MONETARY = ASSETS.concat(DEBTS, ['spouse', 'charity', 'home-equity', 'gifts', 'business-relief']);
    const ALL_INPUTS = MONETARY.concat(['transfer-nrb', 'transfer-rnrb']);
    let announceTimer = null;
    const MAX = 100000000000;
    // In pence, from the tax year's figures (data/2026-27.json).
    const NRB = LG.taxYear.inheritanceTax.nilRateBand * 100;
    const RNRB = LG.taxYear.inheritanceTax.residenceNilRateBand * 100;
    const TWO_MILLION = LG.taxYear.inheritanceTax.taperThreshold * 100;
    const pounds = (pence) => pence / 100;
    const money = (pence) => LG.money(pounds(pence), pence % 100 === 0 ? 0 : 2);
    const ratio = (n) => LG.percent(n);
    let lastModel = null;

    function parseAmount(id, percent = false) {
      const input = get(id);
      if (!input) return { valid: false, entered: false, value: 0 };
      const item = LG.parseNumber(percent ? String(input.value ?? '').replace(/%\s*$/, '') : input.value, 2);
      if (!item.entered) return { valid: true, entered: false, value: 0 };
      const number = item.value;
      if (!item.valid || number < 0 || number > (percent ? 100 : MAX)) return { valid: false, entered: true, value: 0 };
      return { valid: true, entered: true, value: percent ? number : Math.round(number * 100) };
    }

    function announce(message) {
      const status = scope.getElementById('lgiht-status');
      if (!status) return;
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => {
        status.textContent = message;
      }, 650);
    }

    function showErrors(errors, invalid) {
      const groups = { assets: 'assets', debts: 'debts', family: 'family', advanced: 'advanced' };
      Object.keys(groups).forEach((group) => {
        const box = get(group + '-error');
        if (!box) return;
        box.textContent = errors[group] || '';
        box.hidden = !errors[group];
      });
      ALL_INPUTS.forEach((id) => {
        const input = get(id);
        if (input) input.setAttribute('aria-invalid', invalid.includes(id) ? 'true' : 'false');
      });
      // Associate inline issues with their fields while retaining each original help description.
      const fieldErrors = {
        assets: [],
        debts: [],
        family: [],
        advanced: [],
      };
      invalid.forEach((id) => {
        const group = ASSETS.includes(id) ? 'assets' : DEBTS.includes(id) ? 'debts' : ['spouse', 'charity', 'home-equity'].includes(id) ? 'family' : 'advanced';
        fieldErrors[group].push(id);
      });
      if (errors.family && /home equity|home value|main home/i.test(errors.family)) fieldErrors.family.push('home-equity');
      if (errors.family && /spouse exemption/i.test(errors.family)) fieldErrors.family.push('spouse-scope');
      if (errors.advanced && /percentage/i.test(errors.advanced)) fieldErrors.advanced.push('transfer-nrb', 'transfer-rnrb');
      if (errors.advanced && /gifts/i.test(errors.advanced)) fieldErrors.advanced.push('gifts');
      if (errors.advanced && /relief/i.test(errors.advanced)) fieldErrors.advanced.push('business-relief');
      ALL_INPUTS.concat(['period', 'home-desc', 'transfer', 'spouse-scope', 'relief-confirmation']).forEach((id) => {
        const element = get(id);
        if (!element) return;
        const group = Object.keys(fieldErrors).find((key) => fieldErrors[key].includes(id));
        const errorId = 'lgiht-' + id + '-field-error';
        const errorNode = scope.getElementById(errorId);
        if (errorNode) {
          errorNode.textContent = group ? errors[group] || '' : '';
          errorNode.hidden = !group;
        }
        const described = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== errorId);
        if (group && errorNode) described.push(errorId);
        if (described.length) element.setAttribute('aria-describedby', described.join(' '));
        else element.removeAttribute('aria-describedby');
        element.setAttribute('aria-invalid', group || invalid.includes(id) ? 'true' : 'false');
      });
      const homeSelect = get('home-desc');
      if (homeSelect) homeSelect.setAttribute('aria-invalid', homeSelect.value === 'unknown' && Boolean(errors.family) ? 'true' : 'false');
    }

    function setupConditionalFields() {
      const home = get('home-desc')?.value === 'yes';
      const transfer = get('transfer')?.value === 'yes';
      const homeInput = get('home-equity');
      if (homeInput) homeInput.disabled = !home;
      ['transfer-nrb', 'transfer-rnrb'].forEach((id) => {
        const el = get(id);
        if (el) el.disabled = !transfer;
      });
      const period = get('period')?.value || '2026';
      const pension2027 = get('pensions-2027');
      if (pension2027) pension2027.disabled = period !== '2027';
      const pension2027Row = scope.getElementById('lgiht-pension-2027-field');
      if (pension2027Row) pension2027Row.hidden = period !== '2027';
      const spouseRow = scope.getElementById('lgiht-spouse-scope-row');
      const spouseValue = parseAmount('spouse');
      if (spouseRow) spouseRow.hidden = !(spouseValue.valid && spouseValue.value > 0);
      const reliefRow = scope.getElementById('lgiht-relief-confirmation-row');
      const businessValue = parseAmount('business');
      if (reliefRow) reliefRow.hidden = !(businessValue.valid && businessValue.value > 0);
      const message =
        period === '2027'
          ? 'From 6 April 2027, most unused pension funds and death benefits are included in the IHT estate, with exceptions. Enter only the amount in scope.'
          : 'For 2026-27, many discretionary pension benefits are normally outside the estate. Include only pensions actually subject to IHT.';
      write('pension-note', message);
      write('period-label', period === '2027' ? 'From 6 April 2027' : '2026-27 tax year');
      write('ledger-year', period === '2027' ? 'From 6 Apr 2027' : '2026-27');
    }

    function buildModel() {
      const v = {},
        invalid = [],
        errors = {};
      let any = false;
      ALL_INPUTS.forEach((id) => {
        const percent = id.startsWith('transfer-');
        const active = id !== 'home-equity' || get('home-desc')?.value === 'yes';
        const activeTransfer = !percent || get('transfer')?.value === 'yes';
        const activePeriod = id !== 'pensions-2027' || get('period')?.value === '2027';
        if (!active || !activeTransfer || !activePeriod) {
          v[id] = 0;
          return;
        }
        const item = parseAmount(id, percent);
        if (!item.valid) invalid.push(id);
        if (!percent) any = any || item.entered;
        v[id] = item.value;
      });
      const groupOf = (id) =>
        ASSETS.includes(id) ? 'assets' : DEBTS.includes(id) ? 'debts' : ['spouse', 'charity', 'home-equity'].includes(id) ? 'family' : 'advanced';
      invalid.forEach((id) => {
        errors[groupOf(id)] = 'Enter non-negative numbers with up to two decimal places (or a percentage from 0 to 100).';
      });
      if (invalid.length) {
        showErrors(errors, invalid);
        return null;
      }
      const sum = (ids) => ids.reduce((total, id) => total + v[id], 0);
      const gross = sum(ASSETS);
      const debtsEntered = sum(DEBTS);
      const allowableDebts = Math.min(gross, debtsEntered);
      const netEstate = gross - allowableDebts;
      if (v.spouse + v.charity > netEstate) errors.family = 'The amounts left to a spouse and charity together cannot exceed the estate after debts.';
      const homeState = get('home-desc')?.value || 'unknown';
      const homeYes = homeState === 'yes';
      if (homeState === 'unknown' && v.home > 0)
        errors.family = 'Please confirm whether a share of the main home will pass to qualifying direct descendants, or seek advice if uncertain.';
      if (homeYes && (!get('home-equity')?.value.trim() || v['home-equity'] <= 0)) {
        errors.family = 'Enter the value of the home equity passing to direct descendants, or select No above.';
      }
      if (homeYes && v['home-equity'] > v.home) errors.family = 'Home equity inherited by descendants cannot exceed the main home value.';
      if (v['business-relief'] > v.business)
        errors.advanced = 'Confirmed business or agricultural relief cannot exceed the gross business/agricultural assets entered.';
      if (v['business-relief'] + v.spouse + v.charity > netEstate)
        errors.advanced = 'Confirmed relief plus spouse and charity exemptions cannot exceed the estate after debts. Check for overlap.';
      const transferState = get('transfer')?.value || 'unknown';
      const transferYes = transferState === 'yes';
      const missingPercentages = transferYes ? ['transfer-nrb', 'transfer-rnrb'].filter((id) => !get(id)?.value.trim()) : [];
      if (transferState === 'unknown' && any)
        errors.advanced =
          'If a spouse or civil partner died earlier, their unused allowance needs checking. Select No only if no transferable allowance can apply.';
      if (missingPercentages.length) errors.advanced = 'Enter both confirmed unused allowance percentages, including 0 if none. Blank values cannot mean 100%.';
      const spouseScope = get('spouse-scope')?.value || 'unknown';
      if (v.spouse > 0 && spouseScope !== 'unrestricted')
        errors.family =
          'Spouse exemption is not confirmed. Mixed long-term UK residence can restrict it; seek specialist advice before relying on an estimate.';
      const businessConfirmed = get('relief-confirmation')?.value || 'unknown';
      if (v.business > 0 && businessConfirmed === 'unknown')
        errors.advanced =
          'Business or agricultural assets need a verified relief position, including the April 2026 limit. Choose a confirmed position or seek professional advice.';
      if (v.business > 0 && businessConfirmed === 'none' && v['business-relief'] > 0)
        errors.advanced = 'You selected No relief applies but entered a relief amount.';
      if (v.business > 0 && businessConfirmed === 'confirmed' && v['business-relief'] <= 0)
        errors.advanced = 'You selected Confirmed relief but have not entered a positive verified relief amount.';
      // Basic upper bound with one \u00A32.5m 100% APR/BPR allowance.
      // Transferred APR/BPR allowances are specialist and deliberately unsupported here.
      const APR_BPR_100_CAP = LG.taxYear.inheritanceTax.fullReliefCap * 100; // pence
      const reliefUpperBound = Math.min(v.business, APR_BPR_100_CAP) + Math.max(0, v.business - APR_BPR_100_CAP) / 2;
      if (v.business > 0 && v['business-relief'] > reliefUpperBound)
        errors.advanced =
          'The claimed relief exceeds the basic April 2026 \u00A32.5m allowance plus 50% of qualifying excess. An additional transferred APR/BPR allowance may be relevant: obtain specialist confirmation.';
      showErrors(errors, missingPercentages.concat(v.spouse > 0 && spouseScope !== 'unrestricted' ? ['spouse'] : []));
      if (Object.keys(errors).length) return null;
      const nrbTransferPct = transferYes ? v['transfer-nrb'] : 0;
      const rnrbTransferPct = transferYes ? v['transfer-rnrb'] : 0;
      const maxNRB = Math.round(NRB * (1 + nrbTransferPct / 100));
      const maxRNRB = Math.round(RNRB * (1 + rnrbTransferPct / 100));
      if (v.gifts > maxNRB) {
        showErrors(
          {
            advanced:
              'Non-exempt lifetime gifts exceed the available standard allowance. Separate tax on gifts and timing-related reliefs may apply; this calculator cannot produce a reliable total estimate.',
          },
          ['gifts'],
        );
        return null;
      }
      const giftNRBUsed = Math.min(maxNRB, v.gifts);
      const availableNRB = maxNRB - giftNRBUsed;
      const taper = homeYes ? Math.min(maxRNRB, Math.max(0, Math.round((netEstate - TWO_MILLION) / 2))) : 0;
      const availableRNRB = homeYes ? Math.max(0, maxRNRB - taper) : 0;
      const eligibleHome = homeYes ? v['home-equity'] : 0;
      const chargeableBeforeBands = Math.max(0, netEstate - v.spouse - v.charity - v['business-relief']);
      const nrbUsed = Math.min(chargeableBeforeBands, availableNRB);
      const rnrbUsed = Math.min(Math.max(0, chargeableBeforeBands - nrbUsed), availableRNRB, eligibleHome);
      const taxable = Math.max(0, chargeableBeforeBands - nrbUsed - rnrbUsed);
      // Simple single-component baseline: standard NRB is deducted; RNRB must NOT be used in this test.
      const charityBaseline = Math.max(0, netEstate - v.spouse - v['business-relief'] - availableNRB);
      const charityMayQualify = v.charity > 0 && charityBaseline > 0 && v.charity * 10 >= charityBaseline;
      // Deliberately use 40% in the headline: the 36% test can depend on estate components,
      // grossing up and eligibility which this consumer calculator does not establish.
      const charityQualifies = false;
      const charitable36Scenario = charityMayQualify ? Math.round((taxable * 36) / 100) : null;
      const taxRate = 40;
      const tax = Math.round((taxable * taxRate) / 100);
      const afterTax = Math.max(0, netEstate - tax);
      return {
        v,
        any,
        period: get('period').value,
        gross,
        debtsEntered,
        allowableDebts,
        netEstate,
        nrbTransferPct,
        rnrbTransferPct,
        maxNRB,
        maxRNRB,
        giftNRBUsed,
        availableNRB,
        taper,
        availableRNRB,
        eligibleHome,
        homeYes,
        transferYes,
        chargeableBeforeBands,
        nrbUsed,
        rnrbUsed,
        taxable,
        taxRate,
        charityBaseline,
        charityQualifies,
        charityMayQualify,
        charitable36Scenario,
        tax,
        afterTax,
      };
    }

    const TO_CLEAR = [
      'tax',
      'net-estate',
      'taxable',
      'after-tax',
      'allocation-total',
      'nrb-max',
      'nrb-used',
      'gift-use',
      'rnrb-max',
      'rnrb-used',
      'rnrb-taper',
      'gross',
      'debts-used',
      'net',
      'spouse-used',
      'charity-used',
      'relief-used',
      'nrb-available',
      'nrb-used-ledger',
      'rnrb-taper-ledger',
      'rnrb-used-ledger',
      'taxable-ledger',
      'tax-rate-ledger',
      'tax-ledger',
      'effective-rate',
    ];

    function clearView(isInvalid) {
      TO_CLEAR.forEach((id) => write(id, '\u2014'));
      ['assets-subtotal', 'debts-subtotal'].forEach((id) => write(id, '\u2014'));
      const card = get('results-card');
      if (card) card.dataset.state = 'empty';
      write('rate-pill', 'Illustrative estimate');
      write(
        'result-description',
        isInvalid ? 'Please check the highlighted inputs to complete your estimate.' : 'Enter estate figures above to see your estimate.',
      );
      write('allowance-explain', 'Enter your estate details to see which allowances may apply.');
      write('method-dynamic', 'Add values above to see which rules affect the result.');
      const review = get('review-notice');
      if (review) {
        review.hidden = true;
        review.textContent = '';
      }
      const bar = get('alloc-bar'),
        legend = get('alloc-legend');
      if (bar) {
        bar.setAttribute('aria-label', isInvalid ? 'Estate breakdown unavailable. Check the inputs.' : 'Enter estate figures to see the breakdown.');
        bar.replaceChildren();
        const span = document.createElement('span');
        span.className = 'lgiht-alloc-empty';
        span.textContent = isInvalid ? 'Check the amounts entered.' : 'Enter your estate figures to see the breakdown.';
        bar.appendChild(span);
      }
      if (legend) legend.replaceChildren();
      ['nrb-bar', 'rnrb-bar'].forEach((id) => {
        const el = get(id);
        if (el) el.style.width = '0%';
      });
      const btn = get('download');
      if (btn) btn.disabled = true;
    }

    const COLOURS = { spouse: '#0d8177', charity: '#8a80ab', relief: '#79bfaa', nrb: '#29ab96', home: '#a6e1d2', taxable: '#e1a783' };
    function renderAllocation(m) {
      const bar = get('alloc-bar'),
        legend = get('alloc-legend');
      if (!bar || !legend) return;
      bar.replaceChildren();
      legend.replaceChildren();
      const items = [
        { label: 'To spouse / civil partner', amount: m.v.spouse, color: COLOURS.spouse },
        { label: 'To charity', amount: m.v.charity, color: COLOURS.charity },
        { label: 'Business / agricultural relief', amount: m.v['business-relief'], color: COLOURS.relief },
        { label: 'Standard tax-free allowance', amount: m.nrbUsed, color: COLOURS.nrb },
        { label: 'Home tax-free allowance', amount: m.rnrbUsed, color: COLOURS.home },
        { label: 'Subject to IHT', amount: m.taxable, color: COLOURS.taxable },
      ];
      const total = m.netEstate;
      if (total === 0) {
        const span = document.createElement('span');
        span.className = 'lgiht-alloc-empty';
        span.textContent = 'No positive estate remains after debts.';
        bar.appendChild(span);
      }
      for (const item of items) {
        if (item.amount <= 0) continue;
        const fraction = total ? item.amount / total : 0;
        const seg = document.createElement('span');
        seg.style.width = fraction * 100 + '%';
        seg.style.backgroundColor = item.color;
        seg.setAttribute('aria-hidden', 'true');
        bar.appendChild(seg);
        const row = document.createElement('div');
        row.className = 'lgiht-legend-row';
        const label = document.createElement('span');
        label.className = 'lgiht-leg-label';
        const dot = document.createElement('i');
        dot.className = 'lgiht-leg-dot';
        dot.style.backgroundColor = item.color;
        dot.setAttribute('aria-hidden', 'true');
        label.append(dot, document.createTextNode(item.label));
        const amt = document.createElement('strong');
        amt.className = 'lgiht-leg-value';
        amt.textContent = money(item.amount);
        const pct = document.createElement('span');
        pct.className = 'lgiht-leg-pct';
        pct.textContent = ratio(fraction * 100) + ' of net estate';
        row.append(label, amt, pct);
        legend.appendChild(row);
      }
      bar.setAttribute(
        'aria-label',
        items
          .filter((x) => x.amount > 0)
          .map((x) => x.label + ': ' + money(x.amount))
          .join('; ') || 'No amount to display',
      );
    }

    function render(m) {
      const setMoney = (id, val) => write(id, money(val));
      setMoney('assets-subtotal', m.gross);
      setMoney('debts-subtotal', m.debtsEntered);
      setMoney('tax', m.tax);
      setMoney('net-estate', m.netEstate);
      setMoney('taxable', m.taxable);
      setMoney('after-tax', m.afterTax);
      write('rate-pill', m.taxable <= 0 ? 'No estimated tax payable' : m.charityQualifies ? '36% reduced charity rate (indicative)' : '40% standard IHT rate');
      const special = [];
      if (m.giftNRBUsed > 0) special.push('Earlier gifts have reduced the standard allowance.');
      if (m.taper > 0) special.push('The home allowance is reduced by the estate-size taper.');
      if (m.v['business-relief'] > 0)
        special.push('Verified business or agricultural relief entered by the user is assumed accurate; eligibility is not assessed.');
      if (m.charityMayQualify) special.push('A 36% charity rate may be available but has not been applied without specialist confirmation.');
      if (m.period === '2027') special.push('The model uses pension treatment from April 2027.');
      write(
        'result-description',
        m.taxable > 0
          ? 'Based on the estate and allowances entered. ' + (special[0] || 'A simplified UK estate estimate, not a formal tax calculation.')
          : 'Based on the amounts entered, no IHT is estimated on the estate. ' + (special[0] || 'This is not an HMRC assessment.'),
      );
      const panel = get('results-card');
      if (panel) panel.dataset.state = m.tax <= 0 ? 'zero' : 'positive';
      const review = get('review-notice');
      if (review) {
        const issues = [];
        if (m.debtsEntered > m.gross)
          issues.push('Debts and costs exceed assets. Deductions were capped at the gross estate; insolvent estates require specialist review.');
        if (m.v.gifts > 0) issues.push('Lifetime gifts have reduced the standard band; separate tax or taper relief on gifts is not calculated.');
        if (m.v.business > 0) issues.push('Business/agricultural relief has not been independently verified by Lyfeguard.');
        if (m.charityMayQualify) issues.push('The 36% charitable rate might apply. This headline deliberately uses 40%; have the component test verified.');
        if (m.period === '2027' && m.v['pensions-2027'] > 0)
          issues.push('Post-April 2027 pension amount and beneficiaries must be verified with pension providers.');
        review.textContent = issues.join(' ');
        review.hidden = issues.length === 0;
      }
      const dl = get('download');
      if (dl) dl.disabled = false;
      setMoney('allocation-total', m.netEstate);
      renderAllocation(m);

      setMoney('nrb-max', m.maxNRB);
      setMoney('nrb-used', m.nrbUsed);
      setMoney('gift-use', m.giftNRBUsed);
      setMoney('rnrb-max', m.maxRNRB);
      setMoney('rnrb-used', m.rnrbUsed);
      setMoney('rnrb-taper', m.taper);
      const standard = get('nrb-bar'),
        home = get('rnrb-bar');
      if (standard) standard.style.width = (m.maxNRB ? ((m.nrbUsed + m.giftNRBUsed) / m.maxNRB) * 100 : 0) + '%';
      if (home) home.style.width = (m.maxRNRB ? (m.rnrbUsed / m.maxRNRB) * 100 : 0) + '%';
      let explanation = 'Standard allowance ' + money(m.maxNRB) + ', with ' + money(m.giftNRBUsed) + ' allocated to earlier gifts. ';
      explanation += m.homeYes
        ? 'Home allowance: ' + money(m.maxRNRB) + ' before taper, ' + money(m.rnrbUsed) + ' used against this estate.'
        : 'No home allowance applied because a qualifying home has not been specified as passing to direct descendants.';
      if (m.taper > 0) explanation += ' The net estate exceeds \u00A32m, reducing the available home allowance by ' + money(m.taper) + '.';
      write('allowance-explain', explanation);

      const ledger = {
        gross: m.gross,
        'debts-used': m.allowableDebts,
        net: m.netEstate,
        'spouse-used': m.v.spouse,
        'charity-used': m.v.charity,
        'relief-used': m.v['business-relief'],
        'nrb-available': m.availableNRB,
        'nrb-used-ledger': m.nrbUsed,
        'rnrb-taper-ledger': m.taper,
        'rnrb-used-ledger': m.rnrbUsed,
        'taxable-ledger': m.taxable,
        'tax-ledger': m.tax,
      };
      Object.keys(ledger).forEach((id) => setMoney(id, ledger[id]));
      write('tax-rate-ledger', m.taxRate + '%');
      write('effective-rate', m.netEstate > 0 ? ratio((m.tax / m.netEstate) * 100) : '0%');
      write(
        'ledger-note',
        'This is a simplified 40% estate estimate. The reduced 36% charity rate is not automatically applied; qualifying estate components need confirmation.',
      );
      const dynamic = [];
      dynamic.push('Net estate after debts: ' + money(m.netEstate) + '.');
      dynamic.push('Standard allowance used: ' + money(m.nrbUsed) + '.');
      if (m.homeYes) dynamic.push('Residence allowance used: ' + money(m.rnrbUsed) + '.');
      if (m.taper > 0) dynamic.push('Home allowance tapered by ' + money(m.taper) + '.');
      if (m.charityMayQualify)
        dynamic.push(
          'The simplified 10% charitable baseline test is met, but the headline remains at 40% until eligibility is confirmed. If 36% applies, the indicative tax would be ' +
            money(m.charitable36Scenario) +
            '.',
        );
      if (m.giftNRBUsed > 0)
        dynamic.push('Prior chargeable gifts use ' + money(m.giftNRBUsed) + ' of the standard nil-rate band; separate gift tax is not calculated.');
      if (m.period === '2027') dynamic.push('Pensions are entered using the post-April 2027 scope, where applicable.');
      write('method-dynamic', dynamic.join(' '));
    }

    function update() {
      setupConditionalFields();
      const model = buildModel();
      lastModel = model && model.any ? model : null;
      if (!lastModel) {
        clearView(!model);
        const st = scope.getElementById('lgiht-status');
        clearTimeout(announceTimer);
        if (st) st.textContent = '';
        return;
      }
      render(lastModel);
      announce(
        'Estimate updated for ' +
          (lastModel.period === '2027' ? 'from April 2027' : '2026 to 2027') +
          '. Estimated inheritance tax: ' +
          money(lastModel.tax) +
          '. Illustrative estimate.',
      );
    }

    const workbookZip = LG.xlsx.zip; // shared .xlsx writer (core)

    function makeExcel(m) {
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const rows = [];
      const add = (a, b, c) => rows.push([a, b, c]);
      add('Lyfeguard | Inheritance Tax Estimate', null, null);
      add('Estimate period', m.period === '2027' ? 'From 6 April 2027' : '2026-27');
      add('Generated', new Date().toLocaleDateString('en-GB'));
      add('Section', 'Item', 'Amount (GBP)');
      const names = {
        home: 'Main home',
        'other-property': 'Other property',
        cash: 'Cash and savings',
        investments: 'Investments',
        possessions: 'Personal possessions',
        insurance: 'Life insurance',
        pensions: 'Pensions already in IHT estate',
        'pensions-2027': 'Additional pensions in IHT from April 2027',
        business: 'Business and agricultural assets',
        other: 'Other assets',
        mortgage: 'Outstanding mortgages',
        debts: 'Other debts',
        funeral: 'Funeral costs',
        spouse: 'Left to spouse / civil partner',
        charity: 'Left to charity',
        'home-equity': 'Home equity inherited by descendants',
        gifts: 'Prior chargeable gifts',
        'business-relief': 'Confirmed business / agricultural relief',
      };
      for (const id of ASSETS) add('Estate assets', names[id], pounds(m.v[id]));
      for (const id of DEBTS) add('Estate debts', names[id], pounds(m.v[id]));
      for (const id of ['spouse', 'charity', 'home-equity', 'gifts', 'business-relief']) add('Estate options', names[id], pounds(m.v[id]));
      add('Allowances', 'Unused standard band transferred (%)', m.nrbTransferPct);
      add('Allowances', 'Unused home band transferred (%)', m.rnrbTransferPct);
      add('Calculation', 'Gross estate', pounds(m.gross));
      add('Calculation', 'Debts and funeral costs deducted', pounds(m.allowableDebts));
      add('Calculation', 'Net estate', pounds(m.netEstate));
      add('Calculation', 'Spouse exemption', pounds(m.v.spouse));
      add('Calculation', 'Charity exemption', pounds(m.v.charity));
      add('Calculation', 'Business / agricultural relief', pounds(m.v['business-relief']));
      add('Calculation', 'Standard nil-rate band available for estate', pounds(m.availableNRB));
      add('Calculation', 'Standard nil-rate band used', pounds(m.nrbUsed));
      add('Calculation', 'Residence nil-rate band lost to taper', pounds(m.taper));
      add('Calculation', 'Residence nil-rate band used', pounds(m.rnrbUsed));
      add('Calculation', 'Taxable estate', pounds(m.taxable));
      add('Calculation', 'Indicative tax rate (%)', m.taxRate);
      add('Calculation', 'ESTIMATED IHT', pounds(m.tax));
      add('Notes', 'Simplified single-component estimate only, not a formal HMRC valuation.');
      add('Notes', 'Charity reduced-rate test, gifts, reliefs, pensions and estate components may need specialist review.');
      if (m.debtsEntered > m.gross)
        add('Notes', 'Debts entered exceed assets. Allowable deductions were capped at the gross estate; specialist review may be required.');
      add('Sources', 'https://www.gov.uk/inheritance-tax');
      const columns = ['A', 'B', 'C'];
      const sheetRows = rows
        .map((row, i) => {
          let cells = '';
          row.forEach((value, j) => {
            if (value === null || value === undefined) return;
            const ref = columns[j] + (i + 1);
            if (typeof value === 'number') cells += `<c r="${ref}"><v>${value}</v></c>`;
            else cells += `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
          });
          return `<row r="${i + 1}">${cells}</row>`;
        })
        .join('');
      const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
      const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><cols><col min="1" max="1" width="21" customWidth="1"/><col min="2" max="2" width="49" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData></worksheet>`;
      const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
      const relRoot = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
      const book = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="IHT Estimate" sheetId="1" r:id="rId1"/></sheets></workbook>`;
      const bookRel = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
      return workbookZip([
        ['[Content_Types].xml', contentTypes],
        ['_rels/.rels', relRoot],
        ['xl/workbook.xml', book],
        ['xl/_rels/workbook.xml.rels', bookRel],
        ['xl/worksheets/sheet1.xml', sheet],
      ]);
    }

    const REQUIRED = ALL_INPUTS.concat(['period', 'home-desc', 'transfer', 'spouse-scope', 'relief-confirmation']);
    function init(root) {
      scope = root.getRootNode();
      const required = REQUIRED;
      for (const id of required) {
        get(id).addEventListener('input', update);
        get(id).addEventListener('change', update);
      }
      get('download')?.addEventListener('click', function () {
        if (!lastModel) return;
        const blob = makeExcel(lastModel);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lyfeguard-inheritance-tax-estimate-' + new Date().toISOString().slice(0, 10) + '.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1800);
      });
      get('clear')?.addEventListener('click', function () {
        if (!window.confirm('Clear all Inheritance Tax Calculator figures?')) return;
        ALL_INPUTS.forEach((id) => {
          get(id).value = '';
        });
        get('period').value = '2026';
        get('home-desc').value = 'unknown';
        get('transfer').value = 'unknown';
        get('spouse-scope').value = 'unknown';
        get('relief-confirmation').value = 'unknown';
        update();
        get('home').focus();
      });
      update();
    }
    LG.start({ name: 'IHT', panel: PREFIX + 'assets-card', required: REQUIRED.map((id) => PREFIX + id), setup: init });
  });
  /* @v2:inheritance-tax-end */

  /* ==================================================================
     Compound interest calculator  [compound-interest]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:compound-interest-start */
  module('compound-interest', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    'use strict';
    const ids = ['lgci-initial', 'lgci-contribution', 'lgci-frequency', 'lgci-rate', 'lgci-years'];
    LG.start({ name: 'Compound Interest', panel: 'lgci-input-panel', required: ids, setup: setup });
    function setup(root, el) {
      scope = root.getRootNode();
      const money = (n, digits = 0) => LG.money(n, digits);
      const compact = (n) =>
        n >= 1e6 ? '\u00A3' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'm' : n >= 1000 ? '\u00A3' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : money(n);
      const decimals = { 'lgci-initial': 2, 'lgci-contribution': 2, 'lgci-rate': 4, 'lgci-years': 4 };
      const read = (id) => {
        const item = LG.parseNumber(el(id).value, decimals[id]);
        return item.valid ? item.value : NaN;
      };
      const write = (id, text) => {
        const target = el(id);
        if (target) target.textContent = text;
      };
      const bar = (id, pct) => {
        const target = el(id);
        if (target) target.style.width = Math.max(0, Math.min(100, pct)).toFixed(3) + '%';
      };
      const period = {
        weekly: { step: 7 / 365.25, label: 'week' },
        fortnightly: { step: 14 / 365.25, label: 'two weeks' },
        monthly: { step: 1 / 12, label: 'month' },
        quarterly: { step: 1 / 4, label: 'quarter' },
        annually: { step: 1, label: 'year' },
        none: { step: Infinity, label: 'none' },
      };
      const showError = (message) => LG.showError(el('lgci-error'), message);
      function schedule(years, amount, frequency) {
        const step = period[frequency].step,
          events = [];
        if (!Number.isFinite(step) || amount === 0) return events;
        // Payments occur at the END of each period, including the final period when aligned.
        const count = Math.floor((years + 1e-9) / step);
        for (let k = 1; k <= count; k++) events.push({ t: k * step, amount });
        return events;
      }
      function series(initial, events, rate, years) {
        const logGrowth = Math.log1p(rate / 100);
        let balance = initial,
          invested = initial,
          previous = 0,
          index = 0;
        const evolveTo = (t) => {
          while (index < events.length && events[index].t <= t + 1e-9) {
            const event = events[index++];
            balance *= Math.exp(logGrowth * (event.t - previous));
            balance += event.amount;
            invested += event.amount;
            previous = event.t;
          }
          balance *= Math.exp(logGrowth * (t - previous));
          previous = t;
          return { t, balance, invested, growth: balance - invested };
        };
        const steps = Math.min(120, Math.max(12, Math.ceil(years * 4)));
        const points = [{ t: 0, balance: initial, invested: initial, growth: 0 }];
        for (let i = 1; i <= steps; i++) points.push(evolveTo((years * i) / steps));
        return { points, final: points[points.length - 1] };
      }
      function renderChart(points, years) {
        const svg = el('lgci-growth-svg');
        if (!svg) return;
        const NS = 'http://www.w3.org/2000/svg',
          W = 1000,
          H = 295,
          left = 60,
          right = 20,
          top = 16,
          bottom = 36;
        const plotW = W - left - right,
          plotH = H - top - bottom;
        const max = Math.max(1, ...points.map((p) => p.balance));
        const ceiling = max * 1.1;
        const x = (t) => left + (plotW * t) / years,
          y = (n) => top + plotH * (1 - n / ceiling);
        const make = (tag, attrs, text) => {
          const node = document.createElementNS(NS, tag);
          Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
          if (text != null) node.textContent = text;
          svg.appendChild(node);
          return node;
        };
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        make('title', {}, 'Projected savings balance versus contributions over time');
        for (let i = 0; i <= 4; i++) {
          const value = (ceiling * i) / 4,
            py = y(value);
          make('line', { x1: left, y1: py, x2: W - right, y2: py, stroke: '#e5efed', 'stroke-width': 1 });
          make(
            'text',
            { x: left - 12, y: py + 4, 'text-anchor': 'end', 'font-family': 'Manrope, sans-serif', 'font-size': 12, fill: '#61777d' },
            compact(value),
          );
        }
        for (let i = 0; i <= 4; i++) {
          const t = (years * i) / 4,
            px = x(t);
          make(
            'text',
            {
              x: px,
              y: H - 10,
              'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle',
              'font-family': 'Manrope, sans-serif',
              'font-size': 12,
              fill: '#61777d',
            },
            Number(t.toFixed(1)) + 'y',
          );
        }
        const path = (key) => points.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(2) + ' ' + y(p[key]).toFixed(2)).join(' ');
        const area = path('balance') + ' L' + x(years) + ' ' + y(0) + ' L' + x(0) + ' ' + y(0) + ' Z';
        make('path', { d: area, fill: '#099d85', 'fill-opacity': '.10' });
        make('path', { d: path('invested'), fill: 'none', stroke: '#67969a', 'stroke-width': 2.5, 'stroke-dasharray': '7 5', 'stroke-linejoin': 'round' });
        make('path', { d: path('balance'), fill: 'none', stroke: '#099d85', 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
        const end = points[points.length - 1];
        make('circle', { cx: x(end.t), cy: y(end.balance), r: 5, fill: '#099d85', stroke: '#fff', 'stroke-width': 2 });
        svg.setAttribute('aria-label', `Projected final savings ${money(end.balance)}; total money contributed ${money(end.invested)} after ${years} years`);
      }
      const resetIds = [
        'lgci-future',
        'lgci-start-result',
        'lgci-contributions',
        'lgci-invested',
        'lgci-growth',
        'lgci-principal-pct',
        'lgci-interest-pct',
        'lgci-breakdown-principal',
        'lgci-breakdown-interest',
        'lgci-lower',
        'lgci-current',
        'lgci-higher',
        'lgci-lower-diff',
        'lgci-higher-diff',
        'lgci-chart-final',
      ];
      function clear() {
        resetIds.forEach((id) => write(id, '\u2014'));
        write('lgci-assumption', 'Enter your savings details to see a projection.');
        write('lgci-method-text', 'Enter your savings details to see how the projection is calculated.');
        write('lgci-chart-caption', 'Enter your savings details to see the growth projection.');
        bar('lgci-principal-bar', 0);
        bar('lgci-interest-bar', 0);
        const svg = el('lgci-growth-svg');
        if (svg) {
          svg.replaceChildren();
          svg.setAttribute('aria-label', 'Enter details to view your growth projection');
        }
      }
      function update() {
        const frequency = el('lgci-frequency').value;
        if (!period[frequency]) {
          clear();
          showError('Choose a contribution frequency.');
          return;
        }
        const inputs = ['lgci-initial', 'lgci-rate', 'lgci-years'];
        if (frequency !== 'none') inputs.push('lgci-contribution');
        const regularField = el('lgci-contribution');
        regularField.disabled = frequency === 'none';
        const tip = el('lgci-frequency-tip');
        if (tip)
          tip.textContent =
            frequency === 'none' ? 'Only your starting amount will grow.' : 'Contributions are added at the end of each ' + period[frequency].label + '.';
        if (inputs.some((id) => String(el(id).value ?? '').trim() === '')) {
          clear();
          showError('');
          return;
        }
        const initial = read('lgci-initial'),
          contribution = frequency === 'none' ? 0 : read('lgci-contribution'),
          rate = read('lgci-rate'),
          years = read('lgci-years');
        const valid =
          [initial, contribution, rate, years].every(Number.isFinite) &&
          initial >= 0 &&
          initial <= 1e9 &&
          contribution >= 0 &&
          contribution <= 1e7 &&
          (initial > 0 || contribution > 0) &&
          rate >= 0 &&
          rate <= 100 &&
          years >= 0.5 &&
          years <= 60 &&
          Math.abs(years * 12 - Math.round(years * 12)) < 1e-7;
        if (!valid) {
          clear();
          showError('Enter a starting amount or contribution above \u00A30, a rate from 0% to 100%, and a period from 6 months to 60 years in whole months.');
          return;
        }
        showError('');
        const events = schedule(years, contribution, frequency);
        const result = series(initial, events, rate, years),
          end = result.final,
          added = events.length * contribution;
        write('lgci-future', money(end.balance, 2));
        write('lgci-start-result', money(initial));
        write('lgci-contributions', money(added));
        write('lgci-invested', money(end.invested));
        write('lgci-growth', money(end.growth));
        const addText = frequency === 'none' ? 'with no regular contributions' : `plus ${money(contribution)} every ${period[frequency].label}`;
        write(
          'lgci-assumption',
          `${money(initial)} initially, ${addText}, at ${rate}% annual effective growth for ${years} ${years === 1 ? 'year' : 'years'}.`,
        );
        const contribPct = end.balance > 0 ? Math.max(0, Math.min(100, (100 * end.invested) / end.balance)) : 100,
          growthPct = 100 - contribPct;
        bar('lgci-principal-bar', contribPct);
        bar('lgci-interest-bar', growthPct);
        write('lgci-principal-pct', contribPct.toFixed(1) + '%');
        write('lgci-interest-pct', growthPct.toFixed(1) + '%');
        write('lgci-breakdown-principal', money(end.invested));
        write('lgci-breakdown-interest', money(end.growth));
        const chart = el('lgci-breakdown-chart');
        if (chart) chart.setAttribute('aria-label', `Contributions ${contribPct.toFixed(1)}%; growth ${growthPct.toFixed(1)}%`);
        const low = Math.max(0, rate - 1),
          high = Math.min(100, rate + 1),
          lowVal = series(initial, events, low, years).final.balance,
          highVal = series(initial, events, high, years).final.balance;
        const fmtRate = (n) => Number(n.toFixed(2)) + '% effective rate';
        write('lgci-lower-label', fmtRate(low));
        write('lgci-current-label', fmtRate(rate));
        write('lgci-higher-label', fmtRate(high));
        write('lgci-lower', money(lowVal, 2));
        write('lgci-current', money(end.balance, 2));
        write('lgci-higher', money(highVal, 2));
        const diff = (n) => (Math.abs(n) < 0.005 ? 'No change' : money(Math.abs(n), 2) + (n < 0 ? ' less' : ' more'));
        write('lgci-lower-diff', diff(lowVal - end.balance));
        write('lgci-higher-diff', diff(highVal - end.balance));
        write('lgci-chart-final', money(end.balance, 2));
        write(
          'lgci-chart-caption',
          `Illustrative ${years}-year projection assuming a constant ${rate}% annual effective growth rate. Contributions: ${events.length} payments of ${money(contribution)}.`,
        );
        renderChart(result.points, years);
        write(
          'lgci-method-text',
          `The starting balance of ${money(initial)} grows at an assumed effective annual rate of ${rate}% for ${years} years. ${events.length} ${frequency === 'none' ? 'regular contributions' : 'end-of-period contributions'} totalling ${money(added)} are added at the selected frequency. Each payment then grows for the remaining portion of the term using (1 + annual rate) raised to the time remaining in years. Final balance = starting amount grown + accumulated value of contributions. Estimated growth = final balance minus ${money(end.invested)} contributed. This illustration assumes no tax, fees, withdrawals, inflation or changing returns.`,
        );
      }
      ids.forEach((id) => {
        el(id).addEventListener('input', update);
        el(id).addEventListener('change', update);
      });
      update();
    }
  });
  /* @v2:compound-interest-end */

  /* ==================================================================
     Savings goal calculator  [savings-goal]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:savings-goal-start */
  module('savings-goal', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    (function (root, factory) {
      'use strict';
      const api = factory();
      if (typeof module === 'object' && module.exports) module.exports = api;
      LG.savingsGoal = api; // window.LyfeTools.savingsGoal in v1
    })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
      'use strict';
      const MAX_MONTHS = 600;
      function number(value, label, min, max, money) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
          throw new RangeError(label + ' must be between ' + min + ' and ' + max + '.');
        }
        if (money && Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
          throw new RangeError(label + ' must have no more than two decimal places.');
        }
        return money ? Math.round(value * 100) / 100 : value;
      }
      function calculate(input) {
        if (!input || typeof input !== 'object') throw new TypeError('Enter calculation inputs.');
        const mode = input.mode;
        if (mode !== 'monthly' && mode !== 'time') throw new RangeError('Choose monthly or time mode.');
        const goal = number(input.goal, 'Savings goal', 0.01, 10000000, true);
        const initial = number(input.initial, 'Current savings', 0, 10000000, true);
        const annualRate = number(input.annualRate, 'Annual interest rate', 0, 25, false);
        const rate = Math.expm1(Math.log1p(annualRate / 100) / 12);
        let monthly = 0;
        let months;
        if (mode === 'monthly') {
          months = number(input.months, 'Saving period in months', 1, MAX_MONTHS, false);
          if (!Number.isInteger(months)) throw new RangeError('Saving period must be whole months.');
        } else monthly = number(input.monthly, 'Monthly saving', 0, 1000000, true);
        const base = { mode, goal, initial, annualRate };
        // Ignore only floating-point noise; the largest tolerance is under 0.001p.
        const tolerance = Math.max(1e-9, Number.EPSILON * goal * 1000);
        const reached = (balance) => balance >= goal - tolerance;
        function balanceAfter(periods, deposit) {
          if (rate === 0) return (Math.round(initial * 100) + periods * Math.round(deposit * 100)) / 100;
          let balance = initial;
          for (let i = 0; i < periods; i += 1) balance += balance * rate + deposit;
          return balance;
        }
        function result(periods, deposit, status) {
          let balance = initial;
          const schedule = [{ month: 0, balance, contributions: 0, interest: 0 }];
          for (let month = 1; month <= periods; month += 1) {
            balance = rate === 0 ? (Math.round(initial * 100) + month * Math.round(deposit * 100)) / 100 : balance + balance * rate + deposit;
            if (month % 12 === 0 || month === periods) {
              const contributions = (month * Math.round(deposit * 100)) / 100;
              schedule.push({ month, balance, contributions, interest: Math.max(0, balance - initial - contributions) });
            }
          }
          const totalContributions = (periods * Math.round(deposit * 100)) / 100;
          return {
            ...base,
            status,
            months: periods,
            monthly: deposit,
            totalContributions,
            interest: Math.max(0, balance - initial - totalContributions),
            finalBalance: balance,
            schedule,
          };
        }
        if (initial >= goal) return result(0, 0, 'achieved');
        if (mode === 'monthly') {
          const growth = Math.expm1(months * Math.log1p(rate));
          const factor = rate === 0 ? months : growth / rate;
          const required = Math.max(0, (goal - initial * (1 + growth)) / factor);
          let cents = Math.ceil(required * 100);
          // Verify the penny ceiling against the same monthly cash-flow model.
          while (!reached(balanceAfter(months, cents / 100))) cents += 1;
          while (cents > 0 && reached(balanceAfter(months, (cents - 1) / 100))) cents -= 1;
          return result(months, cents / 100, 'ok');
        }
        let balance = initial;
        for (let month = 1; month <= MAX_MONTHS; month += 1) {
          balance = rate === 0 ? (Math.round(initial * 100) + month * Math.round(monthly * 100)) / 100 : balance + balance * rate + monthly;
          if (reached(balance)) return result(month, monthly, 'ok');
        }
        return {
          ...base,
          status: 'unreachable',
          reason: monthly === 0 && (rate === 0 || initial === 0) ? 'no_progress' : 'beyond_horizon',
          months: null,
          monthly,
          totalContributions: null,
          interest: null,
          finalBalance: null,
          schedule: [],
        };
      }
      return Object.freeze({ calculate, MAX_MONTHS });
    });

    /* One calculator per page. This script makes no network requests. */
    (function () {
      'use strict';
      const required = [
        'fields',
        'goal',
        'initial',
        'years',
        'months',
        'monthly',
        'rate',
        'result',
        'result-value',
        'result-label',
        'result-summary',
        'state-badge',
        'projection',
        'schedule',
        'download',
        'chart',
        'chart-details',
        'show-all',
        'status',
        'startup',
      ];
      function boot(root) {
        scope = root.getRootNode();
        const $ = (id) => scope.getElementById('sg-' + id);
        const form = $('form');
        const engine = LG.savingsGoal;
        if (!engine) return;
        const fieldIds = ['goal', 'initial', 'years', 'months', 'monthly', 'rate'];
        const touched = new Set();
        const compact = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1 });
        const money = (value) => LG.money(value, 2);
        const text = (id, value) => {
          if ($(id)) $(id).textContent = value;
        };
        const show = (id, visible) => {
          if ($(id)) $(id).hidden = !visible;
        };
        const mode = () => form.querySelector('input[name="sg-mode"]:checked').value;
        const duration = (months) => {
          const years = Math.floor(months / 12),
            remainder = months % 12;
          return (
            [years ? years + (years === 1 ? ' year' : ' years') : '', remainder ? remainder + (remainder === 1 ? ' month' : ' months') : '']
              .filter(Boolean)
              .join(' and ') || 'today'
          );
        };
        let last = null,
          lastKey = '',
          example = false,
          expanded = false,
          submitted = false;
        let updateTimer, announcementTimer, chartTimer;
        let chartRows = [];
        let announced = '';
        function announce(message, delay = 400) {
          clearTimeout(announcementTimer);
          if (message === announced) return;
          announcementTimer = setTimeout(() => {
            text('status', message);
            announced = message;
          }, delay);
        }
        function isEmpty() {
          return (
            $('goal').value.trim() === '' &&
            ['initial', 'years', 'months', 'monthly', 'rate'].every((id) => {
              const raw = $(id).value.trim();
              return raw === '' || /^0+(?:\.0+)?$/.test(raw);
            })
          );
        }
        function setMode() {
          const monthlyMode = mode() === 'monthly';
          show('term-field', monthlyMode);
          show('monthly-field', !monthlyMode);
          ['years', 'months'].forEach((id) => {
            $(id).disabled = !monthlyMode;
            $(id).required = false;
          });
          $('monthly').disabled = monthlyMode;
          $('monthly').required = !monthlyMode;
          text('result-label', monthlyMode ? 'Monthly saving needed' : 'Estimated time to goal');
        }
        function readInputs() {
          const errors = {};
          function read(id, min, max, kind, blankIsZero = false) {
            let raw = $(id).value.trim();
            if (kind === 'money') raw = raw.replace(/^\u00A3\s*/, '');
            if (kind === 'rate') raw = raw.replace(/%$/, '').trim();
            if (!raw && blankIsZero) return 0;
            const item = LG.parseNumber(raw, kind === 'money' ? 2 : kind === 'whole' ? 0 : 4);
            const value = item.valid ? item.value : NaN;
            if (!Number.isFinite(value) || value < min || value > max) {
              const messages = {
                goal: raw ? 'Enter a target from \u00A30.01 to \u00A310,000,000, with up to two decimal places.' : 'Enter your savings target in pounds.',
                initial: raw
                  ? 'Enter current savings from \u00A30 to \u00A310,000,000, with up to two decimal places.'
                  : 'Enter your current savings, or 0 if you are starting now.',
                monthly: raw
                  ? 'Enter a monthly saving from \u00A30 to \u00A31,000,000, with up to two decimal places.'
                  : 'Enter the amount you can save each month.',
                years: 'Enter a whole number of years from 0 to 50.',
                months: 'Enter a whole number of additional months from 0 to 11.',
                rate: raw ? 'Enter an AER from 0% to 25%, with up to four decimal places.' : 'Enter your account\u2019s AER, or 0 to exclude interest.',
              };
              errors[id] = messages[id];
            }
            return value;
          }
          const input = { mode: mode(), goal: read('goal', 0.01, 1e7, 'money'), initial: read('initial', 0, 1e7, 'money') };
          if (input.mode === 'monthly') {
            const years = read('years', 0, 50, 'whole', true);
            const months = read('months', 0, 11, 'whole', true);
            input.months = years * 12 + months;
            if (!errors.years && !errors.months && (input.months < 1 || input.months > 600)) {
              errors.term = input.months > 600 ? 'The total saving period must be 50 years or less.' : 'Enter a saving period of at least 1 month.';
            }
          } else input.monthly = read('monthly', 0, 1e6, 'money');
          input.annualRate = read('rate', 0, 25, 'rate');
          return { input, errors };
        }
        function syncErrors(parsed) {
          const monthlyMode = parsed.input.mode === 'monthly';
          const termError = monthlyMode && (submitted || touched.has('years') || touched.has('months')) ? parsed.errors.term || '' : '';
          fieldIds.forEach((id) => {
            const active = !$(id).disabled;
            const message = active && (submitted || touched.has(id)) ? parsed.errors[id] || '' : '';
            text(id + '-error', message);
            show(id + '-error', Boolean(message));
            if (message || (termError && (id === 'years' || id === 'months'))) $(id).setAttribute('aria-invalid', 'true');
            else $(id).removeAttribute('aria-invalid');
          });
          text('term-error', termError);
          show('term-error', Boolean(termError));
          const count = Object.keys(parsed.errors).length;
          text('errors', submitted && count ? 'Please check the highlighted ' + (count === 1 ? 'field.' : 'fields.') : '');
          show('errors', submitted && count > 0);
        }
        function emptyTable(message, preserveRows) {
          const tbody = $('schedule');
          if (preserveRows && tbody.querySelector('th')) {
            tbody.querySelectorAll('th,td').forEach((cell) => {
              cell.textContent = '\u2014';
            });
          } else {
            tbody.replaceChildren();
            const row = document.createElement('tr'),
              cell = document.createElement('td');
            cell.colSpan = 4;
            cell.className = 'lg-table-pending';
            cell.textContent = message;
            row.appendChild(cell);
            tbody.appendChild(row);
          }
        }
        function chart() {
          const width = Math.max(160, Math.round($('chart').getBoundingClientRect().width || 600));
          const height = 250,
            left = width < 360 ? 54 : 68,
            right = width - 14,
            bottom = 214;
          let content;
          if (!last || !chartRows.length || !last.months) {
            const notice = last && last.status === 'achieved' ? 'Goal already reached.' : 'Enter your details above.';
            content = '<text x="' + width / 2 + '" y="125" text-anchor="middle">' + notice + '</text>';
          } else {
            const max = Math.max(last.finalBalance, last.initial + last.totalContributions, 1) * 1.08;
            const x = (month) => left + (month / last.months) * (right - left);
            const y = (value) => bottom - (value / max) * 184;
            const points = (key) => chartRows.map((row) => x(row.month).toFixed(2) + ',' + y(row[key]).toFixed(2)).join(' ');
            content = [0, max / 2, max]
              .map(
                (value) =>
                  '<line class="lg-gridline" x1="' +
                  left +
                  '" y1="' +
                  y(value) +
                  '" x2="' +
                  right +
                  '" y2="' +
                  y(value) +
                  '"/><text x="' +
                  (left - 7) +
                  '" y="' +
                  (y(value) + 4) +
                  '" text-anchor="end">' +
                  compact.format(value) +
                  '</text>',
              )
              .join('');
            content +=
              '<polyline class="lg-balance-line" points="' +
              points('balance') +
              '"/><polyline class="lg-paid-line" points="' +
              points('paidIn') +
              '"/><text x="' +
              left +
              '" y="244">Today</text><text x="' +
              right +
              '" y="244" text-anchor="end">Month ' +
              last.months +
              '</text>';
          }
          // SVG content contains only calculated numbers, formatted currency and fixed messages.
          $('chart').innerHTML = '<svg class="lg-chart" viewBox="0 0 ' + width + ' ' + height + '" focusable="false" aria-hidden="true">' + content + '</svg>';
        }
        function pending(busy = false, empty = false) {
          clearTimeout(announcementTimer);
          last = null;
          lastKey = '';
          chartRows = [];
          $('result').setAttribute('aria-busy', String(busy));
          $('result').classList.toggle('lg-pending', !empty);
          text('status', '');
          text('state-badge', empty ? 'Enter your details' : busy ? 'Updating\u2026' : 'Complete your details');
          text('result-value', '\u2014');
          text('result-summary', empty ? 'Add your target and savings details to see your plan.' : 'Complete valid figures above to update your plan.');
          ['initial', 'contributions', 'interest', 'balance'].forEach((id) => text('out-' + id, '\u2014'));
          text('assumptions', 'Monthly deposits at month-end. Excludes tax, fees, inflation and bonuses.');
          if (empty) {
            show('scenario', false);
            text('scenario', '');
          } else if ($('scenario') && !$('scenario').hidden) {
            text('scenario', 'Your saving comparison will update when your figures are complete.');
            $('scenario').setAttribute('aria-hidden', 'true');
          }
          show('example-badge', false);
          $('download').disabled = true;
          $('show-all').disabled = true;
          emptyTable('Your savings breakdown will appear here.', !empty);
          text('breakdown-note', empty ? 'Your starting savings, new deposits and interest will appear here.' : 'Waiting for complete, valid figures.');
          if ($('chart-details').open) chart();
          show('example', isEmpty());
        }
        function table() {
          if (!last || last.status === 'unreachable') return;
          const all = last.schedule;
          const canCompact = all.length > 7;
          const rows = canCompact && !expanded ? [...all.slice(0, 6), all[all.length - 1]] : all;
          $('schedule').replaceChildren();
          rows.forEach((row) => {
            const tr = document.createElement('tr');
            const label = row.month === 0 ? 'Today' : row.month % 12 === 0 ? 'Year ' + row.month / 12 : 'Month ' + row.month;
            [label, money(last.initial + row.contributions), money(row.interest), money(row.balance)].forEach((value, index) => {
              const cell = document.createElement(index ? 'td' : 'th');
              if (!index) cell.scope = 'row';
              cell.textContent = value;
              tr.appendChild(cell);
            });
            $('schedule').appendChild(tr);
          });
          show('show-all', canCompact);
          $('show-all').disabled = false;
          $('show-all').setAttribute('aria-expanded', String(expanded));
          text('show-all', expanded ? 'Show fewer years' : 'Show all years');
          text('table-caption', 'Your savings breakdown');
          text(
            'breakdown-note',
            canCompact && !expanded
              ? 'Showing the start, first five years and final month. Paid in includes your starting savings.'
              : 'Paid in includes your starting savings. Figures are rounded to the nearest penny.',
          );
        }
        function monthlyRows(result) {
          const rate = Math.expm1(Math.log1p(result.annualRate / 100) / 12);
          const depositCents = Math.round(result.monthly * 100),
            initialCents = Math.round(result.initial * 100);
          let balance = result.initial;
          const rows = [{ month: 0, balance, paidIn: balance }];
          for (let month = 1; month <= result.months; month += 1) {
            balance = rate === 0 ? (initialCents + month * depositCents) / 100 : balance + balance * rate + result.monthly;
            rows.push({ month, balance, paidIn: (initialCents + month * depositCents) / 100 });
          }
          return rows;
        }
        function render(result, key) {
          last = result;
          lastKey = key;
          $('result').setAttribute('aria-busy', 'false');
          $('result').classList.remove('lg-pending');
          if ($('scenario')) $('scenario').removeAttribute('aria-hidden');
          text('state-badge', 'Up to date');
          show('example', false);
          show('example-badge', example);
          show('scenario', false);
          text('result-label', result.mode === 'monthly' ? 'Monthly saving needed' : 'Estimated time to goal');
          const available = result.status !== 'unreachable';
          $('download').disabled = !available;
          if (result.status === 'achieved') {
            text('result-value', 'Goal already reached');
            text('result-summary', 'Your ' + money(result.initial) + ' already covers your ' + money(result.goal) + ' target.');
          } else if (!available) {
            text('result-value', result.reason === 'no_progress' ? 'No progress yet' : 'More than 50 years');
            text(
              'result-summary',
              result.reason === 'no_progress'
                ? 'Add regular savings, or enter the interest your existing savings earn.'
                : 'This plan does not reach ' + money(result.goal) + ' within 50 years. Try a larger monthly saving or a smaller target.',
            );
          } else {
            text('result-value', result.mode === 'monthly' ? money(result.monthly) : duration(result.months));
            const summary =
              result.mode === 'monthly'
                ? result.monthly === 0
                  ? 'Your existing savings could reach ' + money(result.goal) + ' through interest alone over ' + duration(result.months) + '.'
                  : 'To reach ' + money(result.goal) + ' in ' + duration(result.months) + '.'
                : result.monthly === 0
                  ? 'Your existing savings could reach ' + money(result.goal) + ' through interest alone.'
                  : 'To reach ' + money(result.goal) + ', saving ' + money(result.monthly) + ' a month.';
            text('result-summary', summary);
          }
          if (available) {
            text('out-initial', money(result.initial));
            text('out-contributions', money(result.totalContributions));
            text('out-interest', money(result.interest));
            text('out-balance', money(result.finalBalance));
            text(
              'assumptions',
              result.status === 'achieved'
                ? 'No future growth or deposits are needed for this target.'
                : result.annualRate + '% AER; deposits at month-end. Excludes tax, fees, inflation and bonuses.',
            );
            table();
            chartRows = monthlyRows(result);
            const extra = Math.round((result.monthly + 50) * 100) / 100;
            if (result.months > 0 && extra <= 1e6) {
              const baseline = engine.calculate({ ...result, mode: 'time', monthly: result.monthly });
              const faster = engine.calculate({ ...result, mode: 'time', monthly: extra });
              if (baseline.status === 'ok' && faster.status === 'ok' && faster.months < baseline.months) {
                text('scenario', '\u00A350 more a month (' + money(extra) + ') could get you there ' + duration(baseline.months - faster.months) + ' sooner.');
                show('scenario', true);
              }
            }
          } else {
            ['initial', 'contributions', 'interest', 'balance'].forEach((id) => text('out-' + id, '\u2014'));
            text('assumptions', '');
            show('show-all', false);
            chartRows = [];
            emptyTable('No savings projection is available for these figures.', false);
            text('breakdown-note', 'Adjust your figures to see a savings breakdown.');
          }
          if ($('chart-details').open) chart();
          text('chart-summary', 'The chart uses the balance at the end of every month.');
          announce((example ? 'Example. ' : '') + $('result-label').textContent + ': ' + $('result-value').textContent + '.');
        }
        function calculate(explicit = false) {
          clearTimeout(updateTimer);
          const parsed = readInputs();
          syncErrors(parsed);
          if (Object.keys(parsed.errors).length) {
            pending(false, isEmpty());
            if (explicit) {
              const first = Object.keys(parsed.errors)[0];
              $(first === 'term' ? 'years' : first).focus();
              announce('Check the highlighted fields.', 0);
            } else if (!isEmpty()) announce('Complete your figures to update the plan.');
            return;
          }
          try {
            render(engine.calculate(parsed.input), JSON.stringify(parsed.input));
          } catch (error) {
            pending();
            text('state-badge', 'Check your figures');
            text('result-summary', 'We could not calculate this plan. Please check your figures.');
            announce('Please check your figures.');
          }
        }
        function edit(event) {
          if (!fieldIds.includes(event.target.id.replace(/^sg-/, '')) && event.target.name !== 'sg-mode') return;
          const wasExample = example;
          example = false;
          if (event.target.name === 'sg-mode') {
            submitted = false;
            setMode();
          }
          const parsed = readInputs();
          syncErrors(parsed);
          // A native change on blur can repeat an input we have already calculated.
          // Keep actions enabled while that unchanged field hands focus to them.
          if (last && !Object.keys(parsed.errors).length && JSON.stringify(parsed.input) === lastKey) {
            show('example-badge', false);
            if (wasExample) announce($('result-label').textContent + ': ' + $('result-value').textContent + '.');
            return;
          }
          pending(true, isEmpty());
          clearTimeout(updateTimer);
          updateTimer = setTimeout(() => calculate(), 200);
        }
        form.addEventListener('input', edit);
        form.addEventListener('change', edit);
        form.addEventListener('focusout', (event) => {
          // Keep the clicked action in place until its click completes.
          const next = event.relatedTarget;
          if (next && next.closest && next.closest('button,a,summary')) return;
          const id = event.target.id.replace(/^sg-/, '');
          if (fieldIds.includes(id) && !event.target.disabled) {
            touched.add(id);
            syncErrors(readInputs());
          }
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          submitted = true;
          fieldIds.forEach((id) => {
            if (!$(id).disabled) touched.add(id);
          });
          calculate(true);
        });
        function clearFigures(event) {
          if (event) event.preventDefault();
          clearTimeout(updateTimer);
          clearTimeout(announcementTimer);
          touched.clear();
          submitted = false;
          form.querySelector('input[value="monthly"]').checked = true;
          ['goal', 'years', 'months', 'monthly'].forEach((id) => {
            $(id).value = '';
          });
          ['initial', 'rate'].forEach((id) => {
            $(id).value = '0';
          });
          example = false;
          expanded = false;
          setMode();
          syncErrors(readInputs());
          pending(false, true);
          show('show-all', false);
          $('chart-details').open = false;
          text('chart', '');
          $('goal').focus();
          announce('Figures cleared.', 0);
        }
        form.addEventListener('reset', clearFigures);
        if ($('reset') && $('reset').type !== 'reset') $('reset').addEventListener('click', clearFigures);
        if ($('example'))
          $('example').addEventListener('click', () => {
            if (!isEmpty()) return;
            form.querySelector('input[value="monthly"]').checked = true;
            Object.entries({ goal: '10000', initial: '2000', years: '2', months: '0', rate: '4' }).forEach(([id, value]) => {
              $(id).value = value;
            });
            example = true;
            setMode();
            calculate();
            $('goal').focus();
          });
        $('show-all').addEventListener('click', () => {
          const current = readInputs();
          if (last && !Object.keys(current.errors).length && JSON.stringify(current.input) === lastKey) {
            expanded = !expanded;
            table();
          }
        });
        $('chart-details').addEventListener('toggle', () => {
          if ($('chart-details').open) chart();
        });
        const resizeChart = () => {
          clearTimeout(chartTimer);
          chartTimer = setTimeout(() => {
            if ($('chart-details').open) chart();
          }, 80);
        };
        if (window.ResizeObserver) new ResizeObserver(resizeChart).observe($('chart'));
        else window.addEventListener('resize', resizeChart);
        $('download').addEventListener('click', () => {
          const current = readInputs();
          if (!last || last.status === 'unreachable' || Object.keys(current.errors).length || JSON.stringify(current.input) !== lastKey) {
            pending();
            return;
          }
          const r = last;
          const rows = [
            ['Lyfeguard savings goal plan', ''],
            ['Created at (UTC)', new Date().toISOString()],
            ['Plan type', example ? 'Illustrative example' : 'Your inputs'],
            ['Mode', r.mode],
            ['Target (GBP)', r.goal.toFixed(2)],
            ['Starting savings (GBP)', r.initial.toFixed(2)],
            ['AER (%)', r.annualRate],
            ['Months', r.months],
            ['Monthly saving (GBP)', r.monthly.toFixed(2)],
            ['New savings paid in (GBP)', r.totalContributions.toFixed(2)],
            ['Estimated interest (GBP)', r.interest.toFixed(2)],
            ['Final balance (GBP)', r.finalBalance.toFixed(2)],
            [
              'Assumptions',
              'Constant AER; deposits at month-end; interest retained; no withdrawals, tax, fees, inflation or bonuses. Final deposit is the full monthly amount.',
            ],
            [],
            ['Month', 'Money paid in (GBP)', 'Interest (GBP)', 'Balance (GBP)'],
            ...r.schedule.map((row) => [row.month, (r.initial + row.contributions).toFixed(2), row.interest.toFixed(2), row.balance.toFixed(2)]),
          ];
          const csv = '\uFEFF' + rows.map((row) => row.map((value) => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n');
          const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = 'lyfeguard-savings-goal-plan.csv';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          announce('Your savings plan download has started.', 0);
        });
        const nav = $('tools-nav');
        if (nav && window.matchMedia) {
          const compactNav = window.matchMedia('(max-width:850px)');
          nav.open = !compactNav.matches;
          compactNav.addEventListener('change', (event) => {
            nav.open = !event.matches;
          });
        }
        $('fields').disabled = false;
        setMode();
        show('startup', false);

        // Show the worked example on load, matching the static figures in the
        // results and breakdown embeds. It clears as soon as someone types.
        function showDefaultExample() {
          example = true;
          render(engine.calculate({ mode: 'monthly', goal: 10000, initial: 2000, months: 24, annualRate: 4 }), '');
          clearTimeout(announcementTimer); // don't announce to screen readers on page load
          text('status', '');
          announced = '';
          text('state-badge', 'Example figures');
          text('result-summary', 'Example: \u00A310,000 target, \u00A32,000 already saved, 2 years at 4% AER. Enter your own figures above.');
          show('example', false);
        }
        showDefaultExample();
      }
      LG.start({ name: 'Savings Goal', panel: 'sg-form', required: required.map((id) => 'sg-' + id), setup: boot });
    })();
  });
  /* @v2:savings-goal-end */

  /* ==================================================================
     Emergency fund calculator  [emergency-fund]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:emergency-fund-start */
  module('emergency-fund', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    LG.start({ name: 'Emergency Fund', panel: 'ef-monthly', required: ['ef-monthly', 'ef-saved', 'ef-target'], setup: setup });
    function setup(root, $) {
      scope = root.getRootNode();
      var monthlyEl = $('ef-monthly');
      var savedEl = $('ef-saved');

      var money = function (n) {
        return LG.money(Math.round(n), 0);
      };
      // Read a money field: blank or invalid counts as 0, and invalid entries are marked.
      var num = function (el) {
        var item = LG.parseNumber(el.value, 2);
        LG.markInvalid(el, item.entered && !item.valid);
        return item.valid && item.value > 0 ? item.value : 0;
      };
      var months = function (n) {
        return n === 1 ? '1 month' : n + ' months';
      };
      var parts = scope.querySelectorAll('.ef-part');

      function selectedMonths() {
        var r = scope.querySelector('input[name="ef-months"]:checked');
        return r ? parseInt(r.value, 10) : 3;
      }

      function sumParts() {
        var total = 0,
          any = false;
        parts.forEach(function (p) {
          if (p.value.trim() !== '') {
            any = true;
            total += num(p);
          }
        });
        if (any) monthlyEl.value = total ? total.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '';
      }

      function render() {
        var monthly = num(monthlyEl);
        var saved = num(savedEl);
        var m = selectedMonths();
        var bad = Array.prototype.some.call(scope.querySelectorAll('.ef-money'), function (el) {
          return el.getAttribute('aria-invalid') === 'true';
        });
        LG.showError(scope.getElementById('ef-error'), bad ? 'Enter amounts using numbers only, for example 1,250 or 1250.50.' : '');

        if (!monthly) {
          $('ef-target').textContent = '\u00A3\u2013';
          $('ef-summary').textContent = 'Enter your monthly essentials to see your target.';
          $('ef-progress-block').hidden = true;
          return;
        }

        var target = monthly * m;
        var gap = Math.max(target - saved, 0);
        var pct = Math.min((saved / target) * 100, 100);
        var cover = saved / monthly;
        var coverRounded = Math.round(cover * 10) / 10;

        $('ef-target').textContent = money(target);
        $('ef-summary').textContent = 'That\u2019s ' + months(m) + ' of essentials at ' + money(monthly) + ' a month.';
        $('ef-progress-block').hidden = false;

        $('ef-bar').style.width = pct + '%';
        $('ef-barwrap').setAttribute('aria-valuenow', Math.round(pct));
        $('ef-caption').textContent = Math.floor(pct) + '% of your target';

        $('ef-st-saved').textContent = money(saved);
        $('ef-st-gap').textContent = money(gap);
        $('ef-st-cover').textContent = cover >= 10 ? Math.floor(cover) + ' months' : coverRounded + (coverRounded === 1 ? ' month' : ' months');

        var reached = gap === 0;
        $('ef-plan').hidden = reached;
        $('ef-done').hidden = !reached;
        if (!reached) {
          $('ef-p6').textContent = money(Math.ceil(gap / 6)) + ' a month';
          $('ef-p12').textContent = money(Math.ceil(gap / 12)) + ' a month';
          $('ef-p24').textContent = money(Math.ceil(gap / 24)) + ' a month';
        }
      }

      scope.querySelectorAll('.ef-money').forEach(function (el) {
        el.addEventListener('input', function () {
          if (el.classList.contains('ef-part')) sumParts();
          render();
        });
        el.addEventListener('blur', function () {
          var item = LG.parseNumber(el.value, 2);
          if (!item.entered || !item.valid) return; // leave invalid text for the person to correct
          el.value = item.value ? item.value.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '';
        });
      });

      scope.querySelectorAll('input[name="ef-months"]').forEach(function (r) {
        r.addEventListener('change', render);
      });

      var toggle = $('ef-toggle');
      if (toggle) {
        toggle.addEventListener('click', function () {
          var box = $('ef-breakdown'),
            open = box.hidden;
          box.hidden = !open;
          toggle.setAttribute('aria-expanded', String(open));
          toggle.textContent = open ? 'Hide the breakdown' : 'Not sure? Help me add it up';
        });
      }

      render();
    }
  });
  /* @v2:emergency-fund-end */

  /* ==================================================================
     Loan repayment calculator  [loan-repayment]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:loan-repayment-start */
  module('loan-repayment', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    'use strict';
    const fieldIds = ['lglc-amount', 'lglc-rate', 'lglc-term'];
    LG.start({
      name: 'Loan Calculator',
      panel: 'lglc-input-panel',
      required: [...fieldIds, 'lglc-monthly', 'lglc-principal', 'lglc-interest', 'lglc-total'],
      setup: setup,
    });
    function setup(root, get) {
      scope = root.getRootNode();
      const money = (value, digits = 2) => LG.money(value, digits);
      const read = (id, decimals) => {
        const item = LG.parseNumber(get(id).value, decimals);
        return item.valid ? item.value : NaN;
      };
      const write = (id, value) => {
        const el = get(id);
        if (el) el.textContent = value;
      };
      const setBar = (id, value) => {
        const el = get(id);
        if (el) el.style.width = Math.max(0, Math.min(100, value)).toFixed(2) + '%';
      };
      const payment = (loan, annualRate, months) => {
        if (annualRate === 0) return loan / months;
        const r = annualRate / 1200;
        return (loan * r) / (1 - Math.pow(1 + r, -months));
      };
      const rateLabel = (rate) => Number(rate.toFixed(2)) + '% rate';
      const showError = (message) => LG.showError(get('lglc-error'), message);
      function clear() {
        [
          'lglc-monthly',
          'lglc-principal',
          'lglc-interest',
          'lglc-total',
          'lglc-assumption',
          'lglc-method-text',
          'lglc-principal-pct',
          'lglc-interest-pct',
          'lglc-breakdown-principal',
          'lglc-breakdown-interest',
          'lglc-lower',
          'lglc-current',
          'lglc-higher',
          'lglc-lower-diff',
          'lglc-higher-diff',
        ].forEach((id) => write(id, '\u2014'));
        write('lglc-lower-label', 'Lower rate');
        write('lglc-current-label', 'Your rate');
        write('lglc-higher-label', 'Higher rate');
        setBar('lglc-principal-bar', 0);
        setBar('lglc-interest-bar', 0);
        const chart = get('lglc-breakdown-chart');
        if (chart) chart.setAttribute('aria-label', 'Repayment breakdown will appear after entering loan details');
      }
      function differenceText(delta) {
        if (Math.abs(delta) < 0.005) return 'No change';
        return money(Math.abs(delta)) + (delta < 0 ? ' less per month' : ' more per month');
      }
      function update() {
        const raw = fieldIds.map((id) => String(get(id).value || '').trim());
        if (raw.some((v) => !v)) {
          clear();
          showError('');
          return;
        }
        const amount = read('lglc-amount', 2);
        const rate = read('lglc-rate', 4);
        const years = read('lglc-term', 4);
        const monthsFloat = years * 12;
        const valid =
          [amount, rate, years].every(Number.isFinite) &&
          amount > 0 &&
          amount <= 100000000 &&
          rate >= 0 &&
          rate <= 100 &&
          years >= 0.5 &&
          years <= 40 &&
          Math.abs(monthsFloat - Math.round(monthsFloat)) < 1e-7;
        if (!valid) {
          clear();
          showError('Enter a loan above \u00A30, an annual rate between 0% and 100%, and a term of 6 months to 40 years in whole months.');
          return;
        }
        showError('');
        const months = Math.round(monthsFloat);
        const monthly = payment(amount, rate, months);
        const total = monthly * months;
        const interest = Math.max(0, total - amount);
        write('lglc-monthly', money(monthly));
        write('lglc-principal', money(amount, 0));
        write('lglc-interest', money(interest));
        write('lglc-total', money(total));
        write(
          'lglc-assumption',
          `Based on a ${money(amount, 0)} loan at ${Number(rate.toFixed(2))}% over ${Number(years.toFixed(4))} ${years === 1 ? 'year' : 'years'}.`,
        );
        const principalPct = total > 0 ? (amount / total) * 100 : 100;
        const interestPct = 100 - principalPct;
        setBar('lglc-principal-bar', principalPct);
        setBar('lglc-interest-bar', interestPct);
        write('lglc-principal-pct', principalPct.toFixed(1) + '%');
        write('lglc-interest-pct', interestPct.toFixed(1) + '%');
        write('lglc-breakdown-principal', money(amount, 0));
        write('lglc-breakdown-interest', money(interest));
        const chart = get('lglc-breakdown-chart');
        if (chart) chart.setAttribute('aria-label', `Repayment breakdown: ${principalPct.toFixed(1)}% borrowed amount and ${interestPct.toFixed(1)}% interest`);
        const low = Math.max(0, rate - 1);
        const high = Math.min(100, rate + 1);
        const lowMonthly = payment(amount, low, months);
        const highMonthly = payment(amount, high, months);
        write('lglc-lower-label', rateLabel(low));
        write('lglc-current-label', rateLabel(rate));
        write('lglc-higher-label', rateLabel(high));
        write('lglc-lower', money(lowMonthly));
        write('lglc-current', money(monthly));
        write('lglc-higher', money(highMonthly));
        write('lglc-lower-diff', differenceText(lowMonthly - monthly));
        write('lglc-higher-diff', differenceText(highMonthly - monthly));
        write(
          'lglc-method-text',
          rate === 0
            ? `At 0% interest, the original loan is divided into ${months} equal monthly payments, with no interest charged.`
            : `This estimate assumes ${months} equal monthly payments at an unchanged nominal annual interest rate of ${Number(rate.toFixed(2))}%. Monthly interest rate = annual rate \u00F7 12. Monthly repayment = P \u00D7 r \u00F7 (1 \u2212 (1 + r)^\u2212n), where P is the original loan amount, r the monthly interest rate and n the number of payments. Total interest = total repayments \u2212 amount borrowed. Fees and rate changes are excluded.`,
        );
      }
      root.addEventListener('input', (event) => {
        if (fieldIds.includes(event.target.id)) update();
      });
      root.addEventListener('change', (event) => {
        if (fieldIds.includes(event.target.id)) update();
      });
      update();
    }
  });
  /* @v2:loan-repayment-end */

  /* ==================================================================
     Pro rata salary calculator  [pro-rata-salary]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:pro-rata-salary-start */
  module('pro-rata-salary', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    // The tax year's rates (LG.taxYear): England, Wales and Northern Ireland
    var R = {
      personalAllowance: LG.ukTax.rates.personalAllowance,
      taperStart: LG.ukTax.rates.taperStart,
      basicBand: LG.ukTax.rates.basicBand,
      additionalThreshold: LG.ukTax.rates.additionalThreshold,
      niPrimary: LG.ukTax.rates.niPrimary,
      niUpper: LG.ukTax.rates.niUpper,
      higherRateStart: LG.ukTax.rates.personalAllowance + LG.ukTax.rates.basicBand,
      hicbcStart: LG.taxYear.childBenefitCharge.start,
      hicbcEnd: LG.taxYear.childBenefitCharge.end,
      aeTrigger: LG.taxYear.autoEnrolment.trigger,
    };
    // Income Tax and employee NI come from the shared UK tax core (LG.ukTax).
    var incomeTax = LG.ukTax.incomeTax;
    var employeeNI = LG.ukTax.employeeNI;

    // Pension paid by net pay arrangement: reduces income tax, not NI
    function takeHome(gross, eePct) {
      var pension = (gross * eePct) / 100;
      var adjusted = gross - pension;
      var tax = incomeTax(adjusted);
      var ni = employeeNI(gross);
      return { net: gross - pension - tax - ni, pension: pension, tax: tax, ni: ni, adjusted: adjusted };
    }

    function calculate(input) {
      var ratio = input.yours / input.fullTime;
      var salary = input.salary * ratio;
      var ft = takeHome(input.salary, input.eePct);
      var pt = takeHome(salary, input.eePct);
      return {
        ratio: ratio,
        salary: salary,
        monthly: salary / 12,
        weekly: salary / 52,
        ft: ft,
        pt: pt,
        holidayDays: input.holiday * ratio,
        pensionMonthly: ((salary * input.eePct) / 100 + (salary * input.erPct) / 100) / 12,
      };
    }

    function notes(input, r) {
      var out = [];
      var ftA = r.ft.adjusted,
        ptA = r.pt.adjusted;
      if (ftA > R.taperStart && ptA < ftA) {
        out.push(
          ptA <= R.taperStart
            ? 'You\u2019d get your full Personal Allowance back, because your income would drop below \u00A3100,000.'
            : 'You\u2019d get some of your Personal Allowance back, because less of your income is above \u00A3100,000.',
        );
      }
      if (ftA > R.higherRateStart && ptA <= R.higherRateStart) {
        out.push('You\u2019d move out of higher-rate tax, so none of your salary would be taxed at 40%.');
      }
      if (ftA > R.hicbcStart && ptA < ftA && ptA < R.hicbcEnd) {
        out.push(
          ptA <= R.hicbcStart
            ? 'If you claim Child Benefit, you\u2019d no longer pay the High Income Child Benefit Charge, as long as you\u2019re the higher earner and have no other income.'
            : 'If you claim Child Benefit, the High Income Child Benefit Charge would be lower, as long as you\u2019re the higher earner and have no other income.',
        );
      }
      if (input.salary >= R.aeTrigger && r.salary < R.aeTrigger) {
        out.push('Below \u00A310,000 a year, your employer doesn\u2019t have to enrol you in a workplace pension automatically, but you can ask to join.');
      }
      return out.slice(0, 3);
    }

    // Exposed for testing and for the worked examples
    window.LGProRata = { calculate: calculate, notes: notes, rates: R };

    LG.start({ name: 'Pro Rata Salary', panel: 'pr-salary', required: ['pr-salary', 'pr-full', 'pr-yours', 'pr-result', 'pr-error'], setup: setup });
    function setup(root, $) {
      scope = root.getRootNode();
      var money = function (n) {
        return LG.money(Math.round(n), 0);
      };
      // Fields that held something other than a number on the last render.
      var invalid = [];
      // Read a number field: blank or invalid counts as 0; invalid entries are noted.
      var num = function (id) {
        var item = LG.parseNumber($(id).value, 2);
        if (item.entered && !item.valid) invalid.push(id);
        return item.valid && item.value > 0 ? item.value : 0;
      };
      var dec = function (n) {
        var r = Math.round(n * 10) / 10;
        return r % 1 === 0 ? String(r) : r.toFixed(1);
      };
      var pctVal = function (id, fallback) {
        var item = LG.parseNumber($(id).value.replace(/%\s*$/, ''), 2);
        if (!item.entered) return fallback;
        if (!item.valid) {
          invalid.push(id);
          return fallback;
        }
        return Math.min(Math.max(item.value, 0), 100);
      };
      var defaults = { hours: { full: '37.5', yours: '22.5' }, days: { full: '5', yours: '3' } };

      function mode() {
        var r = scope.querySelector('input[name="pr-mode"]:checked');
        return r ? r.value : 'hours';
      }

      function setInvalid(id, bad) {
        var c = $(id).closest('.lg-control');
        if (c) c.setAttribute('data-invalid', bad ? 'true' : 'false');
        LG.markInvalid($(id), bad);
      }

      function render() {
        var m = mode();
        invalid = [];
        var input = {
          salary: num('pr-salary'),
          fullTime: num('pr-full'),
          yours: num('pr-yours'),
          eePct: pctVal('pr-ee', 5),
          erPct: pctVal('pr-er', 3),
          holiday: num('pr-holiday') || 28,
        };
        var max = m === 'hours' ? 168 : 7;
        var tooMany = input.yours > input.fullTime && input.fullTime > 0;
        var fullTooBig = input.fullTime > max;
        var notNumbers = invalid.length > 0;
        ['pr-salary', 'pr-ee', 'pr-er', 'pr-holiday'].forEach(function (id) {
          if ($(id)) setInvalid(id, invalid.indexOf(id) !== -1);
        });
        setInvalid('pr-yours', tooMany || invalid.indexOf('pr-yours') !== -1);
        setInvalid('pr-full', fullTooBig || invalid.indexOf('pr-full') !== -1);
        $('pr-error').hidden = !(notNumbers || tooMany || fullTooBig);
        $('pr-error').textContent = notNumbers
          ? 'Enter numbers only, for example 40,000 or 37.5.'
          : fullTooBig
            ? 'A full-time week can\u2019t be more than ' + max + ' ' + m + '.'
            : 'Your ' + m + ' can\u2019t be more than the full-time week. Use the full-time salary if you work full time.';

        if (notNumbers || !input.salary || !input.fullTime || !input.yours || tooMany || fullTooBig) {
          $('pr-salary-out').textContent = '\u00A3\u2013';
          $('pr-summary').textContent = 'Enter your full-time salary and your working week to see your pro rata salary.';
          $('pr-detail').hidden = true;
          return;
        }

        var r = calculate(input);
        var unit = m === 'hours' ? 'hours' : 'days';
        $('pr-detail').hidden = false;
        $('pr-salary-out').textContent = money(r.salary);
        $('pr-summary').textContent =
          'That\u2019s ' +
          money(r.monthly) +
          ' a month or ' +
          money(r.weekly) +
          ' a week, for ' +
          dec(input.yours) +
          ' of ' +
          dec(input.fullTime) +
          ' ' +
          unit +
          ' (' +
          Math.round(r.ratio * 100) +
          '% of full time).';

        var ftMonth = Math.round(r.ft.net / 12);
        var ptMonth = Math.round(r.pt.net / 12);
        var lessHours = Math.round((1 - r.ratio) * 100);
        var keptPay = r.ft.net > 0 ? r.pt.net / r.ft.net : r.ratio;
        var lessPay = Math.round((1 - keptPay) * 100);

        var full = r.ratio >= 0.999;
        $('pr-insight').hidden = full;
        if (!full) {
          $('pr-insight-text').textContent = 'You\u2019d work ' + lessHours + '% fewer ' + unit + ', but your take-home pay falls by about ' + lessPay + '%.';
          $('pr-bar-hours').style.width = Math.round(r.ratio * 100) + '%';
          $('pr-bar-pay').style.width = Math.min(Math.round(keptPay * 100), 100) + '%';
          $('pr-bar-hours-val').textContent = Math.round(r.ratio * 100) + '%';
          $('pr-bar-pay-val').textContent = Math.min(Math.round(keptPay * 100), 100) + '%';
        }

        $('pr-st-net').textContent = money(ptMonth);
        $('pr-st-holiday').textContent = m === 'hours' ? dec((r.holidayDays * input.fullTime) / 5) + ' hours' : dec(r.holidayDays) + ' days';
        $('pr-st-pension').textContent = money(r.pensionMonthly);

        $('pr-ft-net').textContent = money(ftMonth) + ' a month';
        $('pr-pt-net').textContent = money(ptMonth) + ' a month';
        $('pr-diff').textContent = ftMonth - ptMonth > 0 ? money(ftMonth - ptMonth) + ' less a month' : 'No change';

        var n = notes(input, r);
        $('pr-notes').hidden = n.length === 0;
        $('pr-notes-list').innerHTML = '';
        n.forEach(function (t) {
          var li = document.createElement('li');
          li.textContent = t;
          $('pr-notes-list').appendChild(li);
        });
      }

      function applyMode(reset) {
        var m = mode();
        scope.querySelectorAll('.pr-unit').forEach(function (el) {
          el.textContent = m;
        });
        $('pr-full-label').textContent = m === 'hours' ? 'Full-time hours a week' : 'Full-time days a week';
        $('pr-yours-label').textContent = m === 'hours' ? 'Your hours a week' : 'Your days a week';
        if (reset) {
          $('pr-full').value = defaults[m].full;
          $('pr-yours').value = '';
          $('pr-yours').placeholder = defaults[m].yours;
        }
      }

      scope.querySelectorAll('.pr-input').forEach(function (el) {
        el.addEventListener('input', render);
      });
      $('pr-salary').addEventListener('blur', function () {
        var item = LG.parseNumber($('pr-salary').value, 2);
        if (!item.entered || !item.valid) return; // leave invalid text for the person to correct
        $('pr-salary').value = item.value ? item.value.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '';
      });
      scope.querySelectorAll('input[name="pr-mode"]').forEach(function (r) {
        r.addEventListener('change', function () {
          applyMode(true);
          render();
        });
      });

      applyMode(false);
      render();
    }
  });
  /* @v2:pro-rata-salary-end */

  /* ==================================================================
     Average salary by age  [salary-by-age]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:salary-by-age-start */
  module('salary-by-age', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    // ONS Annual Survey of Hours and Earnings (ASHE) 2026 provisional, Table 6.7a, UK:
    // data/ons-ashe-2026.json, put in here by the build. Each row: median, mean,
    // p10, p20, p25, p30, p40, p60, p70, p75, p80, p90.
    var DATA = /* @data:ons-ashe-2026 */ null;

    var PCTS = [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90];
    var CHART = { min: 10000, max: 110000 };
    // Income Tax and employee NI come from the shared UK tax core (LG.ukTax).
    var incomeTax = LG.ukTax.incomeTax;
    var employeeNI = LG.ukTax.employeeNI;

    function takeHome(g) {
      return g - incomeTax(g) - employeeNI(g);
    }

    function group(sex, age) {
      var a = DATA[sex][age];
      return {
        median: a[0],
        mean: a[1],
        p: { 10: a[2], 20: a[3], 25: a[4], 30: a[5], 40: a[6], 50: a[0], 60: a[7], 70: a[8], 75: a[9], 80: a[10], 90: a[11] },
      };
    }

    function percentile(salary, g) {
      if (salary < g.p[10]) return { band: 'bottom', pos: 5 };
      if (salary >= g.p[90]) return { band: 'top', pos: 95 };
      for (var i = 0; i < PCTS.length - 1; i++) {
        var lo = PCTS[i],
          hi = PCTS[i + 1];
        if (salary >= g.p[lo] && salary < g.p[hi]) {
          var span = g.p[hi] - g.p[lo];
          var x = span > 0 ? lo + ((hi - lo) * (salary - g.p[lo])) / span : lo;
          return { band: 'mid', pct: Math.min(Math.max(Math.round(x), 10), 89), pos: x };
        }
      }
    }

    function calculate(input) {
      var g = group(input.sex, input.age);
      var uk = group(input.sex, 'all');
      var s = input.salary;
      return {
        group: g,
        uk: uk,
        rank: percentile(s, g),
        takeHome: takeHome(s),
        vsAge: s - g.median,
        vsUk: s - uk.median,
        agesAbove: DATA.ages.filter(function (a) {
          return s > DATA[input.sex][a][0];
        }).length,
        top25: g.p[75],
        top10: g.p[90],
      };
    }

    window.LGSalaryAge = { data: DATA, calculate: calculate, takeHome: takeHome, percentile: percentile, group: group };

    LG.start({ name: 'Salary by Age', panel: 'sa-salary', required: ['sa-salary', 'sa-result'], setup: setup });
    function setup(root, $) {
      scope = root.getRootNode();
      var money = function (n) {
        return LG.money(Math.round(n), 0);
      };
      var short = function (n) {
        var k = n / 1000;
        return '\u00A3' + (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
      };
      // Read the salary: blank or invalid counts as 0, and an invalid entry is marked.
      var num = function (el) {
        var item = LG.parseNumber(el.value, 2);
        LG.markInvalid(el, item.entered && !item.valid);
        return item.valid && item.value > 0 ? item.value : 0;
      };
      var dash = function (age) {
        return age.replace('-', '\u2013');
      };
      var people = { all: 'full-time employees', male: 'men working full time', female: 'women working full time' };
      var sexLabel = { all: 'everyone', male: 'men', female: 'women' };
      var pos = function (v) {
        return Math.min(Math.max(((v - CHART.min) / (CHART.max - CHART.min)) * 100, 0), 100);
      };

      function checked(name, fallback) {
        var r = scope.querySelector('input[name="' + name + '"]:checked');
        return r ? r.value : fallback;
      }

      function diffText(d, base) {
        if (Math.abs(d) < 1) return 'Level with it';
        var p = (Math.abs(d) / base) * 100;
        var pText = p < 1 ? 'under 1%' : Math.round(p) + '%';
        return money(Math.abs(d)) + (d > 0 ? ' above' : ' below') + ' (' + pText + ')';
      }

      function renderData(sex, age, salary) {
        $('sa-data-who').textContent = sexLabel[sex];
        DATA.ages.concat('all').forEach(function (a) {
          var g = group(sex, a);
          var row = scope.querySelector('.sa-row[data-age="' + a + '"]');
          if (row) {
            row.querySelector('.sa-whisker').style.cssText = 'left:' + pos(g.p[10]) + '%;width:' + (pos(g.p[90]) - pos(g.p[10])) + '%';
            row.querySelector('.sa-box').style.cssText = 'left:' + pos(g.p[25]) + '%;width:' + (pos(g.p[75]) - pos(g.p[25])) + '%';
            row.querySelector('.sa-med').style.left = pos(g.median) + '%';
            row.querySelector('.sa-row-val').textContent = short(g.median);
            row.classList.toggle('is-you', a === age);
            var line = row.querySelector('.sa-youline');
            line.hidden = !salary;
            if (salary) line.style.left = pos(salary) + '%';
          }
          var tr = scope.querySelector('.sa-table tr[data-age="' + a + '"]');
          if (tr) {
            var td = tr.querySelectorAll('td');
            td[0].textContent = money(g.median);
            td[1].textContent = money(g.p[25]) + ' to ' + money(g.p[75]);
            td[2].textContent = money(g.p[90]);
            td[3].textContent = money(takeHome(g.median) / 12);
            tr.classList.toggle('is-you', a === age);
          }
        });
      }

      function render() {
        var sex = checked('sa-who', 'all');
        var age = checked('sa-age', '30-39');
        var salary = num($('sa-salary'));
        LG.showError(
          scope.getElementById('sa-error'),
          $('sa-salary').getAttribute('aria-invalid') === 'true' ? 'Enter your salary using numbers only, for example 40,000.' : '',
        );
        renderData(sex, age, salary);

        var groupText = people[sex] + ' aged ' + dash(age);
        if (!salary) {
          $('sa-label').textContent = 'Where you sit';
          $('sa-value').textContent = '\u2013';
          $('sa-summary').textContent = 'Enter your salary to see how it compares with ' + groupText + '.';
          $('sa-detail').hidden = true;
          return;
        }

        var r = calculate({ salary: salary, age: age, sex: sex });
        var g = r.group;
        $('sa-detail').hidden = false;

        if (r.rank.band === 'top') {
          $('sa-label').textContent = 'You\u2019re in the';
          $('sa-value').textContent = 'Top 10%';
          $('sa-summary').textContent = 'of ' + groupText + '. The top 10% start at ' + money(g.p[90]) + '.';
        } else if (r.rank.band === 'bottom') {
          $('sa-label').textContent = 'You earn more than';
          $('sa-value').textContent = 'Under 10%';
          $('sa-summary').textContent = 'of ' + groupText + '. The lowest-paid 10% earn under ' + money(g.p[10]) + '.';
        } else {
          $('sa-label').textContent = 'You earn more than about';
          $('sa-value').textContent = r.rank.pct + '%';
          $('sa-summary').textContent = 'of ' + groupText + '. The median for this group is ' + money(g.median) + '.';
        }

        $('sa-fill').style.width = r.rank.pos + '%';
        $('sa-you').style.left = r.rank.pos + '%';
        $('sa-scale').setAttribute(
          'aria-label',
          r.rank.band === 'mid'
            ? 'Your salary ranks at about ' + r.rank.pct + ' out of 100 for ' + groupText
            : (r.rank.band === 'top' ? 'Your salary is in the top 10% for ' : 'Your salary is in the lowest 10% for ') + groupText,
        );
        [10, 25, 50, 75, 90].forEach(function (p) {
          $('sa-t' + p).textContent = short(g.p[p]);
        });

        $('sa-st-median').textContent = money(g.median);
        $('sa-uk-label').textContent = sex === 'all' ? 'UK median, all ages' : 'UK median for ' + sexLabel[sex] + ', all ages';
        $('sa-st-uk').textContent = money(r.uk.median);
        $('sa-st-net').textContent = money(r.takeHome / 12);

        $('sa-vs-age').textContent = diffText(r.vsAge, g.median);
        $('sa-vs-uk').textContent = diffText(r.vsUk, r.uk.median);
        $('sa-ages-above').textContent = r.agesAbove + ' of ' + DATA.ages.length + ' age groups';

        $('sa-top25').textContent = salary >= r.top25 ? 'Reached' : money(r.top25);
        $('sa-top10').textContent = salary >= r.top10 ? 'Reached' : money(r.top10);
      }

      function sync(source) {
        var v = checked(source, 'all');
        var other = source === 'sa-who' ? 'sa-who2' : 'sa-who';
        var target = scope.querySelector('input[name="' + other + '"][value="' + v + '"]');
        if (target) target.checked = true;
        if (source === 'sa-who2') {
          var main = scope.querySelector('input[name="sa-who"][value="' + v + '"]');
          if (main) main.checked = true;
        }
      }

      $('sa-salary').addEventListener('input', render);
      $('sa-salary').addEventListener('blur', function () {
        var el = $('sa-salary');
        var item = LG.parseNumber(el.value, 2);
        if (!item.entered || !item.valid) return; // leave invalid text for the person to correct
        el.value = item.value ? item.value.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '';
      });
      scope.querySelectorAll('input[name="sa-age"]').forEach(function (r) {
        r.addEventListener('change', render);
      });
      ['sa-who', 'sa-who2'].forEach(function (name) {
        scope.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
          r.addEventListener('change', function () {
            sync(name);
            render();
          });
        });
      });

      render();
    }
  });
  /* @v2:salary-by-age-end */

  /* ==================================================================
     Mortgage calculator  [mortgage]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:mortgage-start */
  module('mortgage', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    'use strict';
    const fieldIds = ['lgmc-price', 'lgmc-deposit', 'lgmc-rate', 'lgmc-term'];
    LG.start({
      name: 'Mortgage Calculator',
      panel: 'lgmc-input-panel',
      required: [...fieldIds, 'lgmc-monthly', 'lgmc-loan', 'lgmc-ltv', 'lgmc-interest', 'lgmc-total'],
      setup: setup,
    });
    function setup(root, get) {
      scope = root.getRootNode();
      const fields = fieldIds.map(get);
      const money = (n, digits = 2) => LG.money(n, digits);
      const write = (id, value) => {
        const el = get(id);
        if (el) el.textContent = value;
      };
      const bar = (id, percent) => {
        const el = get(id);
        if (el) el.style.width = Math.max(0, Math.min(100, percent)).toFixed(3) + '%';
      };
      const decimals = { 'lgmc-price': 2, 'lgmc-deposit': 2, 'lgmc-rate': 4, 'lgmc-term': 4 };
      const read = (id) => {
        const item = LG.parseNumber(get(id).value, decimals[id]);
        return item.valid ? item.value : NaN;
      };
      const mortgageType = () => {
        const selected = scope.querySelector('input[name="mortgage-type"]:checked');
        return selected && selected.value === 'interest-only' ? 'interest-only' : 'repayment';
      };
      function calculate(loan, rate, months, type) {
        const r = rate / 1200;
        if (type === 'interest-only') {
          const monthly = loan * r;
          return { monthly, interest: monthly * months, outstanding: loan };
        }
        const monthly = r === 0 ? loan / months : (loan * r) / (1 - Math.pow(1 + r, -months));
        return { monthly, interest: Math.max(0, monthly * months - loan), outstanding: 0 };
      }
      const resultIds = [
        'lgmc-monthly',
        'lgmc-loan',
        'lgmc-ltv',
        'lgmc-interest',
        'lgmc-total',
        'lgmc-outstanding',
        'lgmc-lower',
        'lgmc-current',
        'lgmc-higher',
        'lgmc-lower-diff',
        'lgmc-higher-diff',
        'lgmc-principal-pct',
        'lgmc-interest-pct',
        'lgmc-breakdown-principal',
        'lgmc-breakdown-interest',
      ];
      function clearResults() {
        resultIds.forEach((id) => write(id, '\u2014'));
        bar('lgmc-principal-bar', 0);
        bar('lgmc-interest-bar', 0);
        write('lgmc-assumption', 'Enter your mortgage details to see an estimate.');
        write('lgmc-method-text', 'Enter your mortgage details to see how the estimate is calculated.');
        write('lgmc-monthly-label', 'Estimated monthly repayment');
        write('lgmc-breakdown-intro', 'How the total mortgage cost is split between the amount borrowed and interest.');
        write('lgmc-breakdown-note', 'For interest-only mortgages, the capital is payable at the end of the term.');
        const chart = get('lgmc-breakdown-chart');
        if (chart) chart.setAttribute('aria-label', 'Mortgage repayment breakdown will appear once details are entered');
      }
      const error = (message) => LG.showError(get('lgmc-error'), message);
      function differenceText(change) {
        if (Math.abs(change) < 0.005) return 'No change';
        return money(Math.abs(change)) + (change < 0 ? ' less per month' : ' more per month');
      }
      function update() {
        const raw = fields.map((el) => String(el.value ?? '').trim());
        if (raw.some((value) => value === '')) {
          clearResults();
          error('');
          return;
        }
        const [price, deposit, rate, years] = fieldIds.map(read);
        const monthsFloat = years * 12;
        const valid =
          [price, deposit, rate, years].every(Number.isFinite) &&
          price > 0 &&
          price <= 1000000000 &&
          deposit >= 0 &&
          deposit < price &&
          rate >= 0 &&
          rate <= 100 &&
          years >= 0.5 &&
          years <= 40 &&
          Math.abs(monthsFloat - Math.round(monthsFloat)) < 1e-7;
        if (!valid) {
          clearResults();
          error(
            'Enter a property price above \u00A30, a deposit from \u00A30 up to (but below) the price, an interest rate from 0% to 100%, and a term of 6 months to 40 years in whole months.',
          );
          return;
        }
        error('');
        const months = Math.round(monthsFloat);
        const loan = price - deposit;
        const type = mortgageType();
        const interestOnly = type === 'interest-only';
        const result = calculate(loan, rate, months, type);
        const totalCost = loan + result.interest; // Includes final capital repayment for interest-only.
        const monthlyLabel = interestOnly ? 'Estimated monthly interest payment' : 'Estimated monthly repayment';
        write('lgmc-monthly-label', monthlyLabel);
        write('lgmc-monthly', money(result.monthly));
        write('lgmc-loan', money(loan, 0));
        write('lgmc-ltv', ((100 * loan) / price).toFixed(1).replace(/\.0$/, '') + '%');
        write('lgmc-interest', money(result.interest));
        write('lgmc-total', money(totalCost));
        write('lgmc-outstanding', money(result.outstanding, 0));
        write(
          'lgmc-assumption',
          `Based on a ${money(loan, 0)} ${interestOnly ? 'interest-only' : 'repayment'} mortgage at ${Number(rate.toFixed(2))}% over ${months === 12 ? '1 year' : Number((months / 12).toFixed(3)) + ' years'}.`,
        );

        const principalPct = totalCost > 0 ? (100 * loan) / totalCost : 100;
        const interestPct = 100 - principalPct;
        bar('lgmc-principal-bar', principalPct);
        bar('lgmc-interest-bar', interestPct);
        write('lgmc-principal-pct', principalPct.toFixed(1) + '%');
        write('lgmc-interest-pct', interestPct.toFixed(1) + '%');
        write('lgmc-breakdown-principal', money(loan, 0));
        write('lgmc-breakdown-interest', money(result.interest));
        write(
          'lgmc-breakdown-intro',
          interestOnly
            ? 'How your interest payments plus the final capital repayment make up the total mortgage cost.'
            : 'How your total mortgage repayments are split between repaying capital and paying interest.',
        );
        write('lgmc-principal-label', interestOnly ? 'Capital due at term end' : 'Amount borrowed');
        write(
          'lgmc-breakdown-note',
          interestOnly
            ? `You still need to repay ${money(loan, 0)} at the end of the term. Monthly payments do not reduce the mortgage balance.`
            : 'The mortgage balance is assumed to be fully repaid at the end of the term.',
        );
        const chart = get('lgmc-breakdown-chart');
        if (chart) chart.setAttribute('aria-label', `${principalPct.toFixed(1)}% capital and ${interestPct.toFixed(1)}% interest of total mortgage cost`);

        const low = Math.max(0, rate - 1);
        const high = Math.min(100, rate + 1);
        const rateLabel = (r) => `${Number(r.toFixed(2))}% rate`;
        const lowerMonthly = calculate(loan, low, months, type).monthly;
        const higherMonthly = calculate(loan, high, months, type).monthly;
        write('lgmc-lower-label', rateLabel(low));
        write('lgmc-current-label', rateLabel(rate));
        write('lgmc-higher-label', rateLabel(high));
        write('lgmc-lower', money(lowerMonthly));
        write('lgmc-current', money(result.monthly));
        write('lgmc-higher', money(higherMonthly));
        write('lgmc-lower-diff', differenceText(lowerMonthly - result.monthly));
        write('lgmc-higher-diff', differenceText(higherMonthly - result.monthly));
        write(
          'lgmc-method-text',
          interestOnly
            ? `Interest-only: the monthly interest payment is the amount borrowed multiplied by the annual nominal rate and divided by 12. Over ${months} months, total interest is ${money(result.interest)}. The original ${money(loan, 0)} remains due at the end. Total mortgage cost shown includes the final capital repayment. Fees and rate changes are excluded.`
            : rate === 0
              ? `At a 0% interest rate, ${money(loan, 0)} is divided by ${months} monthly payments. No interest is charged. The loan is fully repaid at the end of the term.`
              : `Repayment mortgage: monthly payment = L \u00D7 r \u00F7 (1 \u2212 (1 + r)^\u2212n), where L is ${money(loan, 0)} borrowed, r is the monthly interest rate (annual nominal rate \u00F7 12), and n is ${months} monthly payments. Total interest = sum of monthly payments \u2212 original borrowing. This assumes a constant rate and excludes fees and other charges.`,
        );
      }
      fields.forEach((el) => {
        el.addEventListener('input', update);
        el.addEventListener('change', update);
      });
      scope.querySelectorAll('input[name="mortgage-type"]').forEach((el) => el.addEventListener('change', update));
      update();
    }
  });
  /* @v2:mortgage-end */

  /* ==================================================================
     Debt-to-income calculator  [debt-to-income]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:debt-to-income-start */
  module('debt-to-income', function () {
    let scope = document; // the document, or the component's shadow root (set in setup)
    'use strict';
    const DEBTS = [
      { id: 'housing', label: 'Mortgage or rent', color: '#099d85' },
      { id: 'car', label: 'Car finance', color: '#164f60' },
      { id: 'loans', label: 'Personal loans', color: '#68c6b4' },
      { id: 'cards', label: 'Credit cards', color: '#e1a783' },
      { id: 'student', label: 'Student loan', color: '#787ba6' },
      { id: 'other', label: 'Other debts', color: '#819eae' },
    ];
    // Guide bands (upper bound exclusive). Lenders set their own limits.
    const BANDS = [
      {
        max: 20,
        key: 'low',
        label: 'Low',
        text: 'A ratio under 20% is generally seen as low. Most of your income is free for living costs, saving and unexpected bills.',
      },
      {
        max: 36,
        key: 'moderate',
        label: 'Manageable',
        text: 'A ratio of 20% to 35.9% is often seen as manageable, though lenders will still look closely at your spending and credit history.',
      },
      {
        max: 50,
        key: 'high',
        label: 'High',
        text: 'A ratio of 36% to 49.9% is often seen as high. Some lenders may offer less or charge more, and repayments could be hard to keep up if your circumstances change.',
      },
      {
        max: Infinity,
        key: 'very-high',
        label: 'Very high',
        text: 'A ratio of 50% or more is usually seen as very high. If repayments feel hard to manage, free, confidential help is available from MoneyHelper, StepChange or Citizens Advice.',
      },
    ];
    const TARGET = 36;
    const GAUGE_MAX = 60;
    const MAX = 1e9;
    const fieldIds = ['income', 'other-income'].concat(DEBTS.map((d) => d.id));
    LG.start({
      name: 'Debt-to-Income Calculator',
      panel: 'lgdti-input-panel',
      required: fieldIds.concat(['ratio', 'monthly-income', 'monthly-debt']).map((id) => 'lgdti-' + id),
      setup: setup,
    });
    function setup(root) {
      scope = root.getRootNode();
      const get = (id) => scope.getElementById('lgdti-' + id);
      const money = LG.money;
      const pct = (n) => n.toFixed(1) + '%';
      const write = (id, value) => {
        const el = get(id);
        if (el) el.textContent = value;
      };
      const period = () => {
        const selected = scope.querySelector('input[name="lgdti-period"]:checked');
        return selected && selected.value === 'month' ? 'month' : 'year';
      };
      function parse(id) {
        const item = LG.parseNumber(get(id).value, 2);
        const valid = item.valid && (!item.entered || item.value <= MAX);
        return { entered: item.entered, valid, value: item.entered && valid ? item.value : 0 };
      }
      function showError(message, invalid) {
        fieldIds.forEach((id) => get(id).setAttribute('aria-invalid', invalid.includes(id) ? 'true' : 'false'));
        LG.showError(get('error'), message);
      }

      const resultIds = [
        'ratio',
        'monthly-income',
        'monthly-debt',
        'left',
        'ratio-ex-housing',
        'target-max',
        'target-headroom',
        'target-reduce',
        'target-reduce-note',
        'target-income',
        'target-income-note',
      ];
      function clearResults(assumption) {
        resultIds.forEach((id) => write(id, '\u2014'));
        write('assumption', assumption || 'Enter your income and debt repayments to see your ratio.');
        write('band-text', 'Enter your details to see what your ratio may mean.');
        write('method-text', 'Enter your income and debt repayments to see how your ratio is calculated.');
        const band = get('band');
        if (band) band.hidden = true;
        const results = get('results-panel');
        if (results) results.dataset.band = 'none';
        const marker = get('gauge-marker');
        if (marker) marker.hidden = true;
        const track = get('gauge-track');
        if (track) track.setAttribute('aria-label', 'Your ratio will appear on the scale once you enter your details');
        const chart = get('breakdown-chart'),
          legend = get('breakdown-legend');
        if (chart) {
          chart.replaceChildren();
          chart.setAttribute('aria-label', 'Your breakdown will appear once you enter your details');
        }
        if (legend) {
          const empty = document.createElement('p');
          empty.className = 'lgdti-viz-empty';
          empty.textContent = 'Enter your income and debts to see the breakdown.';
          legend.replaceChildren(empty);
        }
      }

      function legendRow(label, color, share, amount) {
        const row = document.createElement('div');
        row.className = 'lgdti-viz-legend-row';
        const name = document.createElement('span');
        name.className = 'lgdti-viz-legend-name';
        const dot = document.createElement('i');
        dot.className = 'lgdti-viz-dot';
        dot.style.backgroundColor = color;
        dot.setAttribute('aria-hidden', 'true');
        name.append(dot, document.createTextNode(label));
        const muted = document.createElement('span');
        muted.className = 'lgdti-viz-muted';
        muted.textContent = share;
        const value = document.createElement('strong');
        value.textContent = amount;
        row.append(name, muted, value);
        return row;
      }

      function renderBreakdown(income, values, debt) {
        const chart = get('breakdown-chart'),
          legend = get('breakdown-legend');
        if (!chart || !legend) return;
        chart.replaceChildren();
        legend.replaceChildren();
        // The bar is the whole of income; if debts exceed income it scales to the debts instead.
        const whole = Math.max(income, debt);
        const described = [];
        DEBTS.forEach((d) => {
          const amount = values[d.id];
          if (amount <= 0) return;
          const seg = document.createElement('span');
          seg.style.width = ((amount / whole) * 100).toFixed(3) + '%';
          seg.style.backgroundColor = d.color;
          chart.appendChild(seg);
          legend.appendChild(legendRow(d.label, d.color, pct((amount / income) * 100), money(amount)));
          described.push(d.label + ' ' + pct((amount / income) * 100));
        });
        const left = income - debt;
        if (left > 0) {
          const seg = document.createElement('span');
          seg.className = 'lgdti-viz-left';
          seg.style.width = ((left / whole) * 100).toFixed(3) + '%';
          chart.appendChild(seg);
        }
        if (!debt) {
          const none = document.createElement('p');
          none.className = 'lgdti-viz-empty';
          none.textContent = 'No debt repayments entered.';
          legend.appendChild(none);
        }
        legend.appendChild(legendRow('Left after repayments', '#dce7e7', pct((Math.max(0, left) / income) * 100), money(left)));
        described.push('left after repayments ' + pct((Math.max(0, left) / income) * 100));
        chart.setAttribute('aria-label', 'Share of gross monthly income: ' + described.join('; '));
      }

      function update() {
        const items = {};
        const invalid = [];
        let anyDebt = false;
        fieldIds.forEach((id) => {
          const item = parse(id);
          if (!item.valid) invalid.push(id);
          if (item.entered && id !== 'income' && id !== 'other-income') anyDebt = true;
          items[id] = item;
        });
        write('income-label', period() === 'month' ? 'Gross salary per month' : 'Gross salary per year');
        const values = {};
        DEBTS.forEach((d) => {
          values[d.id] = items[d.id].value;
        });
        const debt = DEBTS.reduce((sum, d) => sum + values[d.id], 0);
        write('debt-subtotal', anyDebt && !invalid.length ? money(debt) : '\u2014');
        if (invalid.length) {
          clearResults('Please check the highlighted amounts.');
          showError('Enter amounts of \u00A30 or more using numbers only, with up to two decimal places (for example 1,250 or 1250.50).', invalid);
          return;
        }
        const incomeEntered = items.income.entered || items['other-income'].entered;
        if (!incomeEntered) {
          clearResults(anyDebt ? 'Enter your income to see your ratio.' : '');
          showError('', []);
          return;
        }
        const salaryMonthly = period() === 'month' ? items.income.value : items.income.value / 12;
        const income = salaryMonthly + items['other-income'].value;
        if (income <= 0) {
          clearResults('Enter your income to see your ratio.');
          showError('Enter an income above \u00A30 to work out your debt-to-income ratio.', ['income']);
          return;
        }
        showError('', []);
        const ratio = (debt / income) * 100;
        const shown = Math.round(ratio * 10) / 10;
        const band = BANDS.find((b) => shown < b.max);
        const housingRatio = ((debt - values.housing) / income) * 100;
        const left = income - debt;

        write('ratio', pct(ratio));
        const bandEl = get('band');
        if (bandEl) {
          bandEl.textContent = band.label;
          bandEl.hidden = false;
        }
        const results = get('results-panel');
        if (results) results.dataset.band = band.key;
        write('monthly-income', money(income));
        write('monthly-debt', money(debt));
        write('left', money(left));
        write('ratio-ex-housing', pct(housingRatio));
        write(
          'assumption',
          debt > 0
            ? `Monthly debt repayments of ${money(debt)} are ${pct(ratio)} of your gross monthly income of ${money(income)}.`
            : `No debt repayments entered, so none of your ${money(income)} gross monthly income goes on debt.`,
        );
        write('band-text', band.text);

        const marker = get('gauge-marker');
        if (marker) {
          marker.hidden = false;
          marker.dataset.band = band.key;
          marker.style.left = ((Math.min(ratio, GAUGE_MAX) / GAUGE_MAX) * 100).toFixed(3) + '%';
        }
        const track = get('gauge-track');
        if (track) track.setAttribute('aria-label', `Your ratio of ${pct(ratio)} is in the ${band.label.toLowerCase()} band`);
        renderBreakdown(income, values, debt);

        const maxDebt = (income * TARGET) / 100;
        const reduce = Math.max(0, debt - maxDebt);
        const incomeNeeded = (debt * 100) / TARGET;
        write('target-max', money(maxDebt));
        write(
          'target-headroom',
          debt <= maxDebt ? `${money(maxDebt - debt)} below this level` : `You're ${money(debt - maxDebt)} above this level`,
        );
        write('target-reduce', money(reduce));
        write('target-reduce-note', reduce > 0 ? `Brings repayments down to ${money(maxDebt)}` : `You're already at or below ${TARGET}%`);
        write('target-income', debt > 0 ? money(incomeNeeded) : '\u2014');
        write(
          'target-income-note',
          debt <= 0
            ? 'No debt repayments entered'
            : incomeNeeded > income
              ? `${money(incomeNeeded * 12)} a year, ${money(incomeNeeded - income)} a month more than now`
              : `${money(incomeNeeded * 12)} a year. Your income is already enough`,
        );

        const incomeText =
          period() === 'month'
            ? `a gross salary of ${money(items.income.value)} a month`
            : `a gross salary of ${money(items.income.value)} a year (${money(salaryMonthly)} a month)`;
        write(
          'method-text',
          `Gross monthly income = ${incomeText}` +
            (items['other-income'].value > 0 ? ` plus ${money(items['other-income'].value)} other income` : '') +
            ` = ${money(income)}. Total monthly debt repayments = ${money(debt)}. Debt-to-income ratio = ${money(debt)} \u00F7 ${money(income)} \u00D7 100 = ${pct(ratio)}. ` +
            `Excluding mortgage or rent, the ratio is ${pct(housingRatio)}. Blank fields are treated as \u00A30.`,
        );
      }

      root.addEventListener('input', (event) => {
        if (event.target.id && event.target.id.indexOf('lgdti-') === 0) update();
      });
      root.addEventListener('change', (event) => {
        if (event.target.id && event.target.id.indexOf('lgdti-') === 0) update();
      });
      update();
    }
  });
  /* @v2:debt-to-income-end */

  /* ==================================================================
     Retirement income calculator  [retirement-income]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:retirement-income-start */
  module('retirement-income', function () {
    'use strict';
    const MAX_AGE = 100;
    const LUMP_SUM_ALLOWANCE = LG.taxYear.pensions.lumpSumAllowance;
    const TAX_FREE_SHARE = LG.taxYear.pensions.taxFreeShare;

    // Year-by-year projection in today's money. Each year the pot pays what
    // the State Pension and other income don't cover, then the rest grows at
    // growth less inflation. Returns the rows and the first age the pot can't
    // pay in full (runsOut), or null if it lasts to MAX_AGE.
    function project(input) {
      const real = (1 + input.growth / 100) / (1 + input.inflation / 100) - 1;
      const upfront = input.lump === 'upfront';
      const lump = upfront ? Math.min(input.pot * TAX_FREE_SHARE, LUMP_SUM_ALLOWANCE) : 0;
      let balance = input.pot - lump;
      let taxFreeLeft = upfront ? 0 : LUMP_SUM_ALLOWANCE;
      const years = [];
      let runsOut = null;
      let anyNeed = false;
      for (let age = input.age; age < MAX_AGE; age++) {
        const sp = age >= input.spAge ? input.sp : 0;
        const need = Math.max(0, input.target - sp - input.other);
        if (need > 0) anyNeed = true;
        const fromPot = Math.min(need, Math.max(0, balance));
        const taxFree = Math.min(fromPot * TAX_FREE_SHARE, taxFreeLeft);
        taxFreeLeft -= taxFree;
        const tax = LG.ukTax.incomeTax(fromPot - taxFree + sp + input.other);
        years.push({ age, start: Math.max(0, balance), need, fromPot, sp, other: input.other, taxFree, tax, net: fromPot + sp + input.other - tax });
        if (runsOut === null && fromPot < need - 0.005) runsOut = age;
        balance = (balance - fromPot) * (1 + real);
      }
      return { real, lump, years, runsOut, anyNeed, endBalance: Math.max(0, balance) };
    }

    // The highest income target the pot can pay in full every year until planAge.
    function sustainableTarget(input) {
      const lasts = (target) => {
        const r = project(Object.assign({}, input, { target }));
        return r.runsOut === null || r.runsOut >= input.planAge;
      };
      let lo = 0;
      let hi = input.pot + input.sp + input.other + 1;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (lasts(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    }
    LG.retirementIncome = { project, sustainableTarget, MAX_AGE, LUMP_SUM_ALLOWANCE };

    // Field rules: kind (money / whole / rate), range, and whether blank is allowed.
    const FIELDS = {
      pot: { kind: 'money', min: 1, max: 50000000, required: true, label: 'your pension pot', msg: 'Enter a pension pot from \u00A31 to \u00A350,000,000.' },
      age: { kind: 'whole', min: 55, max: 90, required: true, msg: 'Enter an age from 55 to 90.' },
      target: { kind: 'money', min: 1, max: 1000000, required: true, msg: 'Enter the income you want, from \u00A31 to \u00A31,000,000 a year.' },
      sp: { kind: 'money', min: 0, max: 100000, blank: 0, msg: 'Enter your State Pension from \u00A30 to \u00A3100,000 a year, or 0.' },
      'sp-age': { kind: 'whole', min: 60, max: 75, blank: 67, msg: 'Enter a State Pension age from 60 to 75.' },
      other: { kind: 'money', min: 0, max: 1000000, blank: 0, msg: 'Enter other income from \u00A30 to \u00A31,000,000 a year, or 0.' },
      growth: { kind: 'rate', min: -5, max: 15, blank: 4, msg: 'Enter growth from -5% to 15% a year.' },
      inflation: { kind: 'rate', min: 0, max: 10, blank: 2.5, msg: 'Enter inflation from 0% to 10% a year.' },
      'plan-age': { kind: 'whole', min: 60, max: 100, blank: 95, msg: 'Enter a plan age from 60 to 100, older than the age you start.' },
    };
    const DEFAULTS = { sp: LG.taxYear.pensions.fullStatePension.toLocaleString('en-GB'), 'sp-age': '67', growth: '4', inflation: '2.5', 'plan-age': '95' };

    LG.start({
      name: 'Retirement Income',
      panel: 'lgri-form',
      required: Object.keys(FIELDS).map((id) => 'lgri-' + id).concat(['lgri-results', 'lgri-headline', 'lgri-chart', 'lgri-table-body']),
      setup: setup,
    });

    function setup(root) {
      // The document, or the component's shadow root when built into <lg-calculator>.
      const scope = root.getRootNode();
      const get = (id) => scope.getElementById('lgri-' + id);
      const write = (id, text) => {
        const el = get(id);
        if (el) el.textContent = text;
      };
      const money = (n) => LG.money(Math.round(n), 0);
      const compact = (n) => (n >= 1e6 ? '\u00A3' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm' : n >= 1e3 ? '\u00A3' + Math.round(n / 1e3) + 'k' : money(n));
      const touched = new Set();
      let announceTimer = null;
      let lastResult = null;

      function readField(id) {
        const rule = FIELDS[id];
        let raw = get(id).value;
        if (rule.kind === 'rate') raw = raw.replace(/%\s*$/, '');
        // Allow a minus sign for growth only.
        const negative = rule.kind === 'rate' && /^\s*-/.test(raw);
        const item = LG.parseNumber(negative ? raw.replace('-', '') : raw, rule.kind === 'whole' ? 0 : 2);
        if (!item.entered) return { blank: true, value: rule.blank, ok: rule.blank !== undefined };
        const value = negative ? -item.value : item.value;
        const ok = item.valid && value >= rule.min && value <= rule.max;
        return { blank: false, value, ok, error: ok ? '' : rule.msg };
      }

      function setFieldError(id, message) {
        const input = get(id);
        const box = get(id + '-error');
        LG.markInvalid(input, Boolean(message));
        if (box) {
          box.textContent = message;
          box.hidden = !message;
        }
      }

      function readAll() {
        const values = {};
        const errors = [];
        let complete = true;
        Object.keys(FIELDS).forEach((id) => {
          const r = readField(id);
          values[id] = r.value;
          if (r.blank && !r.ok) complete = false;
          if (r.error) errors.push({ id, message: r.error });
        });
        // Plan age must be after the starting age.
        if (!errors.some((e) => e.id === 'plan-age' || e.id === 'age') && values.age !== undefined && values['plan-age'] <= values.age) {
          errors.push({ id: 'plan-age', message: FIELDS['plan-age'].msg });
        }
        return { values, errors, complete };
      }

      function showErrors(errors) {
        const shown = errors.filter((e) => touched.has(e.id));
        Object.keys(FIELDS).forEach((id) => {
          const e = shown.find((x) => x.id === id);
          setFieldError(id, e ? e.message : '');
        });
        const summary = get('error-summary');
        const list = get('error-list');
        list.replaceChildren();
        shown.forEach((e) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = '#lgri-' + e.id;
          a.textContent = e.message;
          a.addEventListener('click', (event) => {
            event.preventDefault();
            get(e.id).focus();
          });
          li.appendChild(a);
          list.appendChild(li);
        });
        summary.hidden = shown.length === 0;
      }

      function clearResults(state, message) {
        lastResult = null;
        get('results').dataset.state = state;
        write('headline-label', 'Your pot could last until');
        write('headline', '\u2014');
        const status = get('status');
        status.hidden = true;
        write('summary', message);
        ['first-withdrawal', 'rate', 'cash', 'sustainable', 'low', 'mid', 'high', 'low-note', 'high-note'].forEach((id) => write(id, '\u2014'));
        write('cash-label', 'Tax-free cash');
        write('low-label', 'Lower growth');
        write('mid-label', 'Your assumption');
        write('high-label', 'Higher growth');
        const cols = get('income-cols');
        const empty = document.createElement('p');
        empty.className = 'lgc-empty';
        empty.textContent = 'Enter your details to see your income.';
        cols.replaceChildren(empty);
        const chart = get('chart');
        chart.replaceChildren();
        chart.setAttribute('aria-label', 'Your pot over time will appear once you enter your details');
        const body = get('table-body');
        body.innerHTML = '';
        const tr = body.insertRow();
        const td = tr.insertCell();
        td.colSpan = 7;
        td.textContent = 'Enter your details to see the figures.';
        write('method-text', 'Enter your details to see how the figures are worked out.');
        write('sticky-value', '\u2014');
        updateSticky();
        announce('');
      }

      const lastsText = (r) => (r.runsOut === null ? 'beyond age ' + MAX_AGE : 'age ' + r.runsOut);

      function render() {
        const { values: v, errors, complete } = readAll();
        showErrors(errors);
        if (errors.length) return clearResults('invalid', 'Check the highlighted fields to see your results.');
        if (!complete) return clearResults('empty', 'Enter your pension pot, your age and the income you want to see how long your pot could last.');
        const input = {
          pot: v.pot,
          age: v.age,
          target: v.target,
          sp: v.sp,
          spAge: v['sp-age'],
          other: v.other,
          growth: v.growth,
          inflation: v.inflation,
          planAge: v['plan-age'],
          lump: (root.querySelector('input[name="lgri-lump"]:checked') || {}).value === 'upfront' ? 'upfront' : 'spread',
        };
        const r = project(input);
        lastResult = { input, r };
        const first = r.years[0];
        const sustainable = sustainableTarget(input);
        const lastsToPlan = r.runsOut === null || r.runsOut >= input.planAge;
        const results = get('results');
        const status = get('status');

        if (!r.anyNeed) {
          results.dataset.state = 'covered';
          write('headline-label', 'Your pot');
          write('headline', 'Isn\u2019t needed');
          status.hidden = true;
          write('summary', 'Your State Pension and other income cover the ' + money(input.target) + ' a year you want, so your pot is untouched.');
        } else {
          results.dataset.state = lastsToPlan ? 'lasts' : 'short';
          write('headline-label', r.runsOut === null ? 'Your pot could last' : 'Your pot could last until');
          write('headline', r.runsOut === null ? 'Beyond age ' + MAX_AGE : 'Age ' + r.runsOut);
          status.hidden = false;
          status.dataset.tone = lastsToPlan ? 'good' : 'warn';
          status.textContent = lastsToPlan
            ? 'Lasts to your plan age of ' + input.planAge
            : 'Runs out ' + (input.planAge - r.runsOut) + (input.planAge - r.runsOut === 1 ? ' year' : ' years') + ' before age ' + input.planAge;
          const before = r.years.find((y) => y.age < input.spAge);
          const after = r.years.find((y) => y.age >= input.spAge);
          let text =
            before && after && input.sp > 0
              ? 'Taking ' + money(before.need) + ' a year from your pot until State Pension age (' + input.spAge + '), then ' + money(after.need) + ' a year.'
              : 'Taking ' + money(first.need) + ' a year from your pot.';
          const atPlan = r.years.find((y) => y.age === input.planAge);
          if (lastsToPlan) text += atPlan ? ' Your pot could still be worth ' + money(atPlan.start) + ' at age ' + input.planAge + '.' : '';
          else {
            const later = r.years.find((y) => y.age === input.planAge - 1) || r.years[r.years.length - 1];
            const gapYears = input.spAge - r.runsOut - 1;
            text +=
              gapYears > 0 && input.sp > 0
                ? ' After it runs out, you would have ' + money(input.other) + ' a year until your State Pension starts at ' + input.spAge + ', then ' + money(later.sp + later.other) + ' a year.'
                : ' After it runs out, your income falls to ' + money(later.sp + later.other) + ' a year.';
          }
          write('summary', text);
        }
        write('first-withdrawal', money(first.fromPot));
        write('rate', first.start > 0 ? LG.percent((first.fromPot / first.start) * 100) : '\u2014');
        if (input.lump === 'upfront') {
          write('cash-label', 'Tax-free cash at the start');
          write('cash', money(r.lump));
        } else {
          write('cash-label', 'Tax-free cash to your plan age');
          write('cash', money(r.years.filter((y) => y.age < input.planAge).reduce((n, y) => n + y.taxFree, 0)));
        }
        write('sustainable', money(sustainable) + ' a year');

        renderIncome(input, r);
        renderChart(input, r);
        renderTable(r);
        renderGrowth(input, r);
        write(
          'method-text',
          'Growth of ' +
            LG.percent(input.growth, 2) +
            ' less inflation of ' +
            LG.percent(input.inflation, 2) +
            ' gives growth of ' +
            LG.percent(r.real * 100, 2) +
            ' a year in today\u2019s money. ' +
            (input.lump === 'upfront'
              ? 'Taking ' + money(r.lump) + ' tax-free at the start leaves ' + money(input.pot - r.lump) + ' invested. '
              : 'Your ' + money(input.pot) + ' stays invested and 25% of each withdrawal is tax-free. ') +
            'In your first year your pot pays ' +
            money(first.fromPot) +
            ', the gap between the ' +
            money(input.target) +
            ' you want and your other income of ' +
            money(first.sp + first.other) +
            '. Your income could stay at ' +
            money(sustainable) +
            ' a year until age ' +
            input.planAge +
            ' before the pot runs out.',
        );
        write('sticky-value', r.anyNeed ? (r.runsOut === null ? 'Beyond ' + MAX_AGE : 'Age ' + r.runsOut) : 'Not needed');
        updateSticky();
        announce(
          r.anyNeed
            ? 'Your pot could last until ' + lastsText(r) + '. ' + (lastsToPlan ? 'That lasts to your plan age.' : 'That is before your plan age of ' + input.planAge + '.')
            : 'Your other income covers the income you want.',
        );
      }

      function announce(text) {
        clearTimeout(announceTimer);
        announceTimer = setTimeout(() => write('announce', text), 800);
      }

      function incomeColumn(title, row) {
        const col = document.createElement('div');
        col.className = 'lgc-income-col';
        const h = document.createElement('h4');
        h.textContent = title;
        const dl = document.createElement('dl');
        const add = (label, value, cls) => {
          const wrap = document.createElement('div');
          if (cls) wrap.className = cls;
          const dt = document.createElement('dt');
          dt.textContent = label;
          const dd = document.createElement('dd');
          dd.textContent = value;
          wrap.append(dt, dd);
          dl.appendChild(wrap);
        };
        add('From your pot', money(row.fromPot));
        add('State Pension', money(row.sp));
        if (row.other) add('Other income', money(row.other));
        add('Income tax (estimate)', row.tax ? '\u2212' + money(row.tax) : money(0));
        add('Take-home a year', money(row.net), 'lgc-total');
        add('Take-home a month', money(row.net / 12));
        col.append(h, dl);
        return col;
      }

      function renderIncome(input, r) {
        const cols = get('income-cols');
        cols.replaceChildren();
        const before = r.years.find((y) => y.age < input.spAge);
        const after = r.years.find((y) => y.age >= input.spAge && (r.runsOut === null || y.age < r.runsOut));
        if (before) cols.appendChild(incomeColumn('Age ' + input.age + ' to ' + (Math.min(input.spAge, r.runsOut || input.spAge) - 1), before));
        if (after) cols.appendChild(incomeColumn((before ? 'From age ' : 'Age ') + after.age + (r.runsOut ? ' to ' + (r.runsOut - 1) : ' onwards'), after));
        if (r.runsOut !== null && r.runsOut < MAX_AGE) cols.appendChild(incomeColumn('From age ' + r.runsOut + ', when your pot runs out', r.years.find((y) => y.age === r.runsOut + 1) || r.years[r.years.length - 1]));
      }

      function renderTable(r) {
        const body = get('table-body');
        body.innerHTML = '';
        r.years.forEach((y) => {
          const tr = body.insertRow();
          const th = document.createElement('th');
          th.scope = 'row';
          th.textContent = y.age;
          tr.appendChild(th);
          [y.start, y.fromPot, y.sp, y.other, y.tax, y.net].forEach((n) => (tr.insertCell().textContent = money(n)));
          if (r.runsOut !== null && y.age >= r.runsOut) tr.className = 'lgc-row-out';
        });
      }

      function renderGrowth(input, r) {
        const variants = [
          ['low', input.growth - 1],
          ['mid', input.growth],
          ['high', input.growth + 1],
        ];
        const lastAge = (res) => (res.runsOut === null ? MAX_AGE : res.runsOut);
        variants.forEach(([key, g]) => {
          const res = key === 'mid' ? r : project(Object.assign({}, input, { growth: g }));
          write(key + '-label', LG.percent(g, 2) + ' growth');
          write(key, !res.anyNeed ? 'Not needed' : res.runsOut === null ? 'Beyond age ' + MAX_AGE : 'Until age ' + res.runsOut);
          if (key !== 'mid') {
            const diff = lastAge(res) - lastAge(r);
            write(key + '-note', diff === 0 ? 'No change' : Math.abs(diff) + (Math.abs(diff) === 1 ? ' year ' : ' years ') + (diff < 0 ? 'sooner' : 'longer'));
          }
        });
      }

      const NS = 'http://www.w3.org/2000/svg';
      const svgEl = (tag, attrs) => {
        const el = document.createElementNS(NS, tag);
        Object.keys(attrs).forEach((k) => el.setAttribute(k, String(attrs[k])));
        return el;
      };

      function renderChart(input, r) {
        const box = get('chart');
        box.replaceChildren();
        const W = Math.max(280, Math.round(box.clientWidth || 640));
        const H = W < 480 ? 220 : 260;
        const pad = { l: 52, r: 12, t: 12, b: 28 };
        const pts = r.years.map((y) => [y.age, y.start]).concat([[MAX_AGE, r.endBalance]]);
        const maxV = Math.max(1, ...pts.map((p) => p[1]));
        const x0 = input.age;
        const x = (age) => pad.l + ((age - x0) / (MAX_AGE - x0)) * (W - pad.l - pad.r);
        const y = (v) => pad.t + (1 - v / maxV) * (H - pad.t - pad.b);
        const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, focusable: 'false', 'aria-hidden': 'true' });
        for (let i = 0; i <= 4; i++) {
          const v = (maxV * i) / 4;
          svg.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'lgc-chart-grid' }));
          const t = svgEl('text', { x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'lgc-chart-text' });
          t.textContent = compact(v);
          svg.appendChild(t);
        }
        const step = MAX_AGE - x0 > 30 ? 10 : 5;
        for (let a = Math.ceil(x0 / step) * step; a <= MAX_AGE; a += step) {
          const t = svgEl('text', { x: x(a), y: H - 8, 'text-anchor': 'middle', class: 'lgc-chart-text' });
          t.textContent = a;
          svg.appendChild(t);
        }
        const marker = (age, cls) => {
          if (age > x0 && age < MAX_AGE) svg.appendChild(svgEl('line', { x1: x(age), x2: x(age), y1: pad.t, y2: H - pad.b, class: cls }));
        };
        if (input.sp > 0) marker(input.spAge, 'lgc-chart-sp');
        marker(input.planAge, 'lgc-chart-plan');
        const line = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
        svg.appendChild(svgEl('path', { d: line + ' L' + x(MAX_AGE) + ' ' + y(0) + ' L' + x(x0) + ' ' + y(0) + ' Z', class: 'lgc-chart-area' }));
        svg.appendChild(svgEl('path', { d: line, class: 'lgc-chart-line' }));
        box.appendChild(svg);
        const atPlan = r.years.find((yy) => yy.age === input.planAge);
        box.setAttribute(
          'aria-label',
          'Pot value from age ' + x0 + ': ' + money(r.years[0].start) + ' at the start, ' + (r.runsOut === null ? 'still ' + money(r.endBalance) + ' at age ' + MAX_AGE : 'running out at age ' + r.runsOut) + (atPlan ? ', ' + money(atPlan.start) + ' at your plan age of ' + input.planAge : '') + '.',
        );
      }

      // Mobile: a small bar with the headline while the results are below the screen.
      const sticky = get('sticky');
      let resultsBelow = false;
      function updateSticky() {
        if (sticky) sticky.hidden = !(lastResult && resultsBelow);
      }
      if (sticky && typeof IntersectionObserver !== 'undefined') {
        new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            resultsBelow = !e.isIntersecting && e.boundingClientRect.top > 0;
          });
          updateSticky();
        }).observe(get('results'));
      }

      // Events
      Object.keys(FIELDS).forEach((id) => {
        const input = get(id);
        input.addEventListener('input', render);
        input.addEventListener('blur', () => {
          touched.add(id);
          const r = readField(id);
          // Tidy money fields to 12,500 style once they're valid.
          if (!r.blank && r.ok && FIELDS[id].kind === 'money') input.value = r.value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
          render();
        });
      });
      root.querySelectorAll('input[name="lgri-lump"]').forEach((el) => el.addEventListener('change', render));
      get('form').addEventListener('submit', (event) => {
        event.preventDefault();
        Object.keys(FIELDS).forEach((id) => touched.add(id));
        render();
        const summary = get('error-summary');
        if (!summary.hidden) summary.focus();
      });
      get('clear').addEventListener('click', () => {
        Object.keys(FIELDS).forEach((id) => {
          get(id).value = DEFAULTS[id] || '';
        });
        root.querySelector('input[name="lgri-lump"][value="spread"]').checked = true;
        touched.clear();
        render();
        get('pot').focus();
      });
      if (typeof ResizeObserver !== 'undefined') {
        let width = 0;
        new ResizeObserver(() => {
          const w = get('chart').clientWidth;
          if (lastResult && Math.abs(w - width) > 8) renderChart(lastResult.input, lastResult.r);
          width = w;
        }).observe(get('chart'));
      }
      render();
    }
  });
  /* @v2:retirement-income-end */

  /* ==================================================================
     Take-home pay calculator  [take-home-pay]
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:take-home-pay-start */
  module('take-home-pay', function () {
    'use strict';
    const PERIODS = { year: 1, month: 12, week: 52 };
    // Pay rises shown as cards, a year; the slider picks any other amount.
    const RISES = [
      ['rise1', 5000],
      ['rise2', 10000],
      ['rise3', 20000],
    ];
    const RISE_MAX = 1000000;

    // Everything a year. input: { gross, region, pensionPct, pensionType
    // ('netpay' | 'sacrifice' | 'ras'), pensionBasis ('total' | 'qualifying'),
    // loan ('' | 'plan1' | 'plan2' | 'plan4' | 'plan5'), postgrad }.
    function calculate(input) {
      const T = LG.ukTax.rates;
      const base = input.pensionBasis === 'qualifying' ? Math.min(Math.max(input.gross - T.qualifyingLower, 0), T.qualifyingUpper - T.qualifyingLower) : input.gross;
      const pension = (base * input.pensionPct) / 100; // the full contribution, including any tax relief
      // Salary sacrifice lowers your pay; net pay comes off before tax; relief at
      // source comes off after tax, and the provider adds 20% basic-rate relief.
      const sacrifice = input.pensionType === 'sacrifice' ? pension : 0;
      const netPay = input.pensionType === 'netpay' ? pension : 0;
      const ras = input.pensionType === 'ras' ? pension * 0.8 : 0;
      const pay = input.gross - sacrifice;
      const taxable = pay - netPay;
      const tax = LG.ukTax.incomeTax(taxable, input.region);
      const ni = LG.ukTax.employeeNI(pay);
      const loan = LG.ukTax.studentLoan(pay, input.loan);
      const postgrad = input.postgrad ? LG.ukTax.studentLoan(pay, 'postgrad') : 0;
      const net = pay - netPay - ras - tax - ni - loan - postgrad;
      // Relief above the basic rate on relief-at-source contributions is claimed back separately.
      const rasClaim = ras ? Math.max(0, tax - LG.ukTax.incomeTax(taxable - pension, input.region) - pension * 0.2) : 0;
      return { gross: input.gross, pension, sacrifice, netPay, ras, pay, taxable, tax, ni, loan, postgrad, net, rasClaim, band: LG.ukTax.taxBand(taxable, input.region) };
    }
    LG.takeHomePay = { calculate };

    const FIELDS = {
      salary: { kind: 'money', min: 1, max: 10000000, required: true, msg: 'Enter your pay before tax, from \u00A31 to \u00A310,000,000.' },
      pension: { kind: 'rate', min: 0, max: 100, blank: 0, msg: 'Enter a pension contribution from 0% to 100%, or 0.' },
    };

    LG.start({
      name: 'Take-Home Pay',
      panel: 'lgth-form',
      required: ['lgth-salary', 'lgth-pension', 'lgth-pension-type', 'lgth-loan', 'lgth-postgrad', 'lgth-results', 'lgth-headline', 'lgth-table-body', 'lgth-split', 'lgth-notes', 'lgth-rise-range', 'lgth-rise-amount'],
      setup: setup,
    });

    function setup(root) {
      // The document, or the component's shadow root when built into <lg-calculator>.
      const scope = root.getRootNode();
      const get = (id) => scope.getElementById('lgth-' + id);
      const write = (id, text) => {
        const el = get(id);
        if (el) el.textContent = text;
      };
      const pounds = (n) => LG.money(Math.round(n), 0);
      const pence = (n) => LG.money(Math.round(n * 100) / 100, 2);
      const choice = (name, fallback) => (root.querySelector('input[name="lgth-' + name + '"]:checked') || {}).value || fallback;
      const touched = new Set();
      let last = null; // the latest input and result, for the pay rise slider

      function readField(id) {
        const rule = FIELDS[id];
        let raw = get(id).value;
        if (rule.kind === 'rate') raw = raw.replace(/%\s*$/, '');
        const item = LG.parseNumber(raw, 2);
        if (!item.entered) return { blank: true, value: rule.blank, ok: rule.blank !== undefined };
        const ok = item.valid && item.value >= rule.min && item.value <= rule.max;
        return { blank: false, value: item.value, ok, error: ok ? '' : rule.msg };
      }

      function showErrors(errors) {
        const shown = errors.filter((e) => touched.has(e.id));
        Object.keys(FIELDS).forEach((id) => {
          const e = shown.find((x) => x.id === id);
          LG.markInvalid(get(id), Boolean(e));
          const box = get(id + '-error');
          box.textContent = e ? e.message : '';
          box.hidden = !e;
        });
        const list = get('error-list');
        list.replaceChildren();
        shown.forEach((e) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = '#lgth-' + e.id;
          a.textContent = e.message;
          a.addEventListener('click', (event) => {
            event.preventDefault();
            get(e.id).focus();
          });
          li.appendChild(a);
          list.appendChild(li);
        });
        get('error-summary').hidden = shown.length === 0;
      }

      function readInput() {
        const errors = [];
        const values = {};
        let complete = true;
        Object.keys(FIELDS).forEach((id) => {
          const r = readField(id);
          values[id] = r.value;
          if (r.blank && !r.ok) complete = false;
          if (r.error) errors.push({ id, message: r.error });
        });
        const period = choice('period', 'year');
        return {
          errors,
          complete,
          period,
          input: {
            gross: values.salary * PERIODS[period],
            region: choice('region', 'ruk'),
            pensionPct: values.pension,
            pensionType: get('pension-type').value,
            pensionBasis: choice('basis', 'total'),
            loan: get('loan').value,
            postgrad: get('postgrad').checked,
          },
        };
      }

      function resetResults(state, message) {
        get('results').dataset.state = state;
        write('headline', '\u2014');
        get('status').hidden = true;
        write('summary', message);
        ['year', 'week', 'deductions', 'keep'].forEach((id) => write(id, '\u2014'));
        last = null;
        RISES.forEach(([id]) => {
          write(id, '\u2014');
          write(id + '-note', '\u2014');
        });
        renderCustomRise();
        get('split').replaceChildren();
        get('split').setAttribute('aria-label', 'Where your pay goes will appear once you enter your pay');
        get('legend').replaceChildren();
        const body = get('table-body');
        body.innerHTML = '';
        const td = body.insertRow().insertCell();
        td.colSpan = 4;
        td.textContent = 'Enter your pay to see the breakdown.';
        get('notes').replaceChildren();
        get('notes').hidden = true;
        write('method-text', 'Enter your pay to see how the figures are worked out.');
      }

      const percentOf = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

      function render() {
        const { errors, complete, input } = readInput();
        showErrors(errors);
        if (errors.length) return resetResults('invalid', 'Check the highlighted fields to see your take-home pay.');
        if (!complete) return resetResults('empty', 'Enter your pay before tax to see what you take home.');
        const r = calculate(input);
        const deductions = r.gross - r.net;
        get('results').dataset.state = 'ready';
        write('headline', pence(r.net / 12));
        write('summary', pounds(r.net) + ' a year, or ' + pence(r.net / 52) + ' a week, from ' + pounds(r.gross) + ' a year before tax.');
        const status = get('status');
        status.hidden = false;
        status.textContent = r.band ? r.band.name + ' taxpayer' + (input.region === 'scotland' ? ' (Scotland)' : '') : 'No income tax to pay';
        write('year', pounds(r.net));
        write('week', pence(r.net / 52));
        write('deductions', pounds(deductions));
        write('keep', LG.percent(percentOf(r.net, r.gross)));
        renderSplit(r);
        renderTable(input, r);
        renderRises(input, r);
        renderNotes(input, r);
        renderMethod(input, r);
      }

      const PARTS = [
        ['net', 'Take-home pay', (r) => r.net],
        ['tax', 'Income tax', (r) => r.tax],
        ['ni', 'National Insurance', (r) => r.ni],
        ['pension', 'Pension', (r) => r.sacrifice + r.netPay + r.ras],
        ['loan', 'Student loans', (r) => r.loan + r.postgrad],
      ];

      function renderSplit(r) {
        const bar = get('split');
        const legend = get('legend');
        bar.replaceChildren();
        legend.replaceChildren();
        const described = [];
        PARTS.forEach(([part, label, value]) => {
          const n = value(r);
          if (n <= 0) return;
          const share = percentOf(n, r.gross);
          const seg = document.createElement('span');
          seg.dataset.part = part;
          seg.style.width = share + '%';
          bar.appendChild(seg);
          const li = document.createElement('li');
          const key = document.createElement('i');
          key.className = 'lgc-swatch';
          key.dataset.part = part;
          const text = document.createElement('span');
          text.textContent = label + ' ';
          const strong = document.createElement('strong');
          strong.textContent = LG.percent(share);
          text.appendChild(strong);
          li.append(key, text);
          legend.appendChild(li);
          described.push(label + ' ' + LG.percent(share));
        });
        bar.setAttribute('aria-label', 'Where your pay goes: ' + described.join(', ') + '.');
      }

      function renderTable(input, r) {
        const body = get('table-body');
        body.innerHTML = '';
        const row = (label, n, minus, cls) => {
          const tr = body.insertRow();
          if (cls) tr.className = cls;
          const th = document.createElement('th');
          th.scope = 'row';
          th.textContent = label;
          tr.appendChild(th);
          [n, n / 12, n / 52].forEach((v, i) => {
            const text = i ? pence(v) : pounds(v);
            const td = tr.insertCell();
            td.textContent = minus && v > 0 ? '\u2212' + text : text;
            if (i === 2) td.className = 'lgc-col-week';
          });
        };
        row('Pay before tax', r.gross);
        if (r.sacrifice) row('Salary sacrifice to pension', r.sacrifice, true);
        if (r.netPay) row('Pension (taken before tax)', r.netPay, true);
        row('Income tax', r.tax, true);
        row('National Insurance', r.ni, true);
        if (input.loan) row('Student loan (' + LG.ukTax.studentLoans[input.loan].name + ')', r.loan, true);
        if (input.postgrad) row('Postgraduate Loan', r.postgrad, true);
        if (r.ras) row('Pension (taken after tax)', r.ras, true);
        row('Take-home pay', r.net, false, 'lgc-row-total');
      }

      // Your figures with a pay rise of `rise` a year.
      function withRise(input, r, rise) {
        const next = calculate(Object.assign({}, input, { gross: r.gross + rise }));
        const extra = next.net - r.net;
        return { next, extra, keep: rise > 0 ? Math.round(percentOf(extra, rise)) : null };
      }

      function renderRises(input, r) {
        last = { input, r };
        RISES.forEach(([id, rise]) => {
          const w = withRise(input, r, rise);
          write(id, '+' + pence(w.extra / 12) + ' a month');
          write(id + '-note', pounds(w.next.gross) + ' a year. You keep ' + LG.percent(w.keep) + ' of the rise.');
        });
        renderCustomRise();
      }

      // The slider and the amount box show the same pay rise.
      const range = get('rise-range');
      const amount = get('rise-amount');
      function readRise() {
        const item = LG.parseNumber(amount.value, 2);
        const ok = !item.entered || (item.valid && item.value <= RISE_MAX);
        LG.markInvalid(amount, !ok);
        return item.entered && ok ? item.value : item.entered ? NaN : 0;
      }
      function paintRange() {
        const max = Number(range.max) || 1;
        range.style.setProperty('--lgc-fill', Math.min(100, (Number(range.value) / max) * 100) + '%');
        range.setAttribute('aria-valuetext', pounds(Number(range.value)) + ' a year');
      }
      function renderCustomRise() {
        const rise = readRise();
        const ids = ['custom-pay', 'custom-net', 'custom-extra', 'custom-keep'];
        if (!last || !Number.isFinite(rise)) {
          ids.forEach((id) => write(id, '\u2014'));
          write('custom-note', Number.isFinite(rise) ? 'Enter your pay above to see what this rise is worth.' : 'Enter a pay rise in numbers, up to \u00A31,000,000 a year.');
          return;
        }
        const w = withRise(last.input, last.r, rise);
        const pensionExtra = w.next.pension - last.r.pension;
        write('custom-pay', pounds(w.next.gross));
        write('custom-net', pence(w.next.net / 12));
        write('custom-extra', '+' + pence(w.extra / 12));
        write('custom-keep', w.keep === null ? '\u2014' : LG.percent(w.keep));
        write(
          'custom-note',
          rise > 0
            ? 'A ' + pounds(rise) + ' rise adds ' + pounds(w.extra) + ' a year to your take-home pay' + (pensionExtra >= 1 ? ' and ' + pounds(pensionExtra) + ' a year to your pension' : '') + '.'
            : 'Move the slider or type an amount to see what a pay rise is worth.',
        );
      }
      range.addEventListener('input', () => {
        amount.value = Number(range.value).toLocaleString('en-GB');
        paintRange();
        renderCustomRise();
      });
      amount.addEventListener('input', () => {
        const rise = readRise();
        if (Number.isFinite(rise)) range.value = String(Math.min(rise, Number(range.max)));
        paintRange();
        renderCustomRise();
      });
      paintRange();

      function renderNotes(input, r) {
        const notes = [];
        if (r.taxable > LG.ukTax.rates.taperStart && r.taxable < LG.ukTax.rates.additionalThreshold) {
          notes.push(
            'Between \u00A3100,000 and \u00A3125,140 you lose \u00A31 of your tax-free Personal Allowance for every \u00A32 you earn, so pay in that range is taxed at an effective ' +
              (input.region === 'scotland' ? '67.5%' : '60%') +
              '. Paying more into your pension by salary sacrifice or from pay before tax could bring your income under \u00A3100,000.',
          );
        }
        if (r.pension > 0) {
          notes.push(
            pounds(r.pension) +
              ' a year goes into your pension from your pay' +
              (r.ras ? ', including ' + pounds(r.pension - r.ras) + ' basic-rate tax relief your provider claims' : '') +
              ', not counting anything your employer adds.',
          );
        }
        if (r.rasClaim >= 1) notes.push('You could claim about ' + pounds(r.rasClaim) + ' more tax relief on your pension through Self Assessment or by contacting HMRC.');
        const hicbc = LG.taxYear.childBenefitCharge.start;
        if (r.taxable > hicbc) notes.push('If you or your partner get Child Benefit, the High Income Child Benefit Charge applies above \u00A3' + hicbc.toLocaleString('en-GB') + '. It isn\u2019t included here.');
        if (r.sacrifice) notes.push('Salary sacrifice can\u2019t take your pay below the National Minimum Wage, and it can lower things worked out from your salary, such as mortgage applications.');
        const list = get('notes');
        list.replaceChildren(
          ...notes.map((t) => {
            const li = document.createElement('li');
            li.textContent = t;
            return li;
          }),
        );
        list.hidden = notes.length === 0;
      }

      function renderMethod(input, r) {
        const pa = LG.ukTax.personalAllowance(r.taxable);
        const parts = [];
        parts.push('Your pay of ' + pounds(r.gross) + ' a year');
        if (r.sacrifice) parts.push(' falls to ' + pounds(r.pay) + ' after salary sacrifice');
        if (r.netPay) parts.push(', less ' + pounds(r.netPay) + ' pension taken before tax,');
        parts.push(' gives taxable pay of ' + pounds(r.taxable) + '. ');
        parts.push(
          'After a Personal Allowance of ' +
            pounds(pa) +
            ', income tax at ' +
            (input.region === 'scotland' ? 'Scottish' : 'England, Wales and Northern Ireland') +
            ' rates is ' +
            pounds(r.tax) +
            '. National Insurance is 8% of pay from \u00A312,570 to \u00A350,270 and 2% above that: ' +
            pounds(r.ni) +
            '.',
        );
        if (input.loan) {
          const p = LG.ukTax.studentLoans[input.loan];
          parts.push(' ' + p.name + ' repayments are 9% of pay over ' + pounds(p.threshold) + ': ' + pounds(r.loan) + '.');
        }
        if (input.postgrad) parts.push(' Postgraduate Loan repayments are 6% of pay over \u00A321,000: ' + pounds(r.postgrad) + '.');
        write('method-text', parts.join(''));
      }

      Object.keys(FIELDS).forEach((id) => {
        get(id).addEventListener('input', render);
        get(id).addEventListener('blur', () => {
          touched.add(id);
          render();
        });
      });
      // Radios, selects and the checkbox (text fields update on input).
      get('form').addEventListener('change', (event) => {
        if (!FIELDS[event.target.name]) render();
      });
      get('form').addEventListener('submit', (event) => {
        event.preventDefault();
        Object.keys(FIELDS).forEach((id) => touched.add(id));
        render();
        if (!get('error-summary').hidden) get('error-summary').focus();
      });
      // The shared Clear button resets the fields; forget which ones were visited.
      root.querySelector('[data-clear]').addEventListener('click', () => {
        touched.clear();
        render();
      });
      render();
    }
  });
  /* @v2:take-home-pay-end */

  /* ==================================================================
     Tax on buying a home: Stamp Duty, LBTT and LTT  [property-tax]
     One engine and one page set-up shared by three calculators, one for
     each nation's tax, with the rates in data/ (propertyTax). Built into
     the component with each of them (scripts/build-v2.js, USES).
     ================================================================== */
  /* @v2:property-tax-start */
  (function () {
    'use strict';
    const RATES = LG.taxYear.propertyTax;
    const pounds = (n) => LG.money(Math.round(n), 0);

    // Tax on each slice of the price: [{ from, to, rate, tax }]. add is a
    // surcharge on every slice.
    function slices(price, bands, add) {
      const out = [];
      let from = 0;
      for (const b of bands) {
        const top = b.upTo === null ? Infinity : b.upTo;
        if (price <= from) break;
        const to = Math.min(price, top);
        const rate = b.rate + add;
        out.push({ from, to, rate, tax: (to - from) * rate });
        from = top;
      }
      return out;
    }

    // buyer: 'home' (your only or main home), 'first' (first-time buyer) or
    // 'additional' (a second home or buy-to-let). nonResident: SDLT only.
    // Surcharges, including the non-resident one, start at surchargeFrom.
    // Returns the tax (whole pounds, rounded down as the tax authorities do),
    // the slices, any supplement charged on the whole price, and what applied.
    function calculate(nation, price, buyer, nonResident) {
      const r = RATES[nation];
      const surcharged = buyer === 'additional' && price >= r.surchargeFrom;
      const nonRes = nation === 'sdlt' && Boolean(nonResident) && price >= r.surchargeFrom;
      let bands = r.bands;
      let add = 0;
      let relief = false;
      let supplement = 0;
      if (nation === 'sdlt') {
        relief = buyer === 'first' && price <= r.firstTimeBuyer.maxPrice;
        if (relief) bands = r.firstTimeBuyer.bands;
        if (surcharged) add += r.additionalSurcharge;
        if (nonRes) add += r.nonResidentSurcharge;
      } else if (nation === 'lbtt') {
        relief = buyer === 'first';
        if (relief) bands = [{ upTo: r.firstTimeBuyerNilBand, rate: 0 }].concat(bands.filter((b) => b.upTo === null || b.upTo > r.firstTimeBuyerNilBand));
        if (surcharged) supplement = price * r.additionalDwellingSupplement;
      } else if (surcharged) {
        bands = r.higherBands;
      }
      const rows = slices(price, bands, add);
      const exact = rows.reduce((t, s) => t + s.tax, 0) + supplement;
      return { nation, price, buyer, nonResident: nonRes, rows, supplement, relief, surcharged, tax: Math.floor(exact + 1e-9) };
    }

    // The page for one nation's calculator. o: { key, prefix, nation, name,
    // short (the tax's name in sentences), buyers: { value: label } }.
    function start(o) {
      const FIELDS = { price: { min: 1, max: 100000000, msg: 'Enter the price, from \u00A31 to \u00A3100,000,000.' } };
      LG.start({
        name: o.name,
        panel: o.prefix + '-form',
        required: [o.prefix + '-price', o.prefix + '-results', o.prefix + '-headline', o.prefix + '-table-body', o.prefix + '-notes'],
        setup: setup,
      });

      function setup(root) {
        // The document, or the component's shadow root when built into <lg-calculator>.
        const scope = root.getRootNode();
        const get = (id) => scope.getElementById(o.prefix + '-' + id);
        const write = (id, text) => {
          const el = get(id);
          if (el) el.textContent = text;
        };
        const buyer = () => (root.querySelector('input[name="' + o.prefix + '-buyer"]:checked') || {}).value || 'home';
        const nonResident = () => Boolean(get('nonres') && get('nonres').checked);
        const touched = new Set();

        function readPrice() {
          const rule = FIELDS.price;
          const item = LG.parseNumber(get('price').value, 2);
          if (!item.entered) return { blank: true };
          const ok = item.valid && item.value >= rule.min && item.value <= rule.max;
          return { value: item.value, error: ok ? '' : rule.msg };
        }

        function showErrors(errors) {
          const shown = errors.filter((e) => touched.has(e.id));
          Object.keys(FIELDS).forEach((id) => {
            const e = shown.find((x) => x.id === id);
            LG.markInvalid(get(id), Boolean(e));
            const box = get(id + '-error');
            box.textContent = e ? e.message : '';
            box.hidden = !e;
          });
          const list = get('error-list');
          list.replaceChildren();
          shown.forEach((e) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#' + o.prefix + '-' + e.id;
            a.textContent = e.message;
            a.addEventListener('click', (event) => {
              event.preventDefault();
              get(e.id).focus();
            });
            li.appendChild(a);
            list.appendChild(li);
          });
          get('error-summary').hidden = shown.length === 0;
        }

        function resetResults(state, message) {
          get('results').dataset.state = state;
          write('headline', '\u2014');
          get('status').hidden = true;
          write('summary', message);
          ['rate', 'top', 'total', 'extra'].forEach((id) => write(id, '\u2014'));
          write('extra-label', o.extraLabel);
          Object.keys(o.buyers).forEach((b) => {
            write('compare-' + b, '\u2014');
            write('compare-' + b + '-note', '\u2014');
          });
          const body = get('table-body');
          body.innerHTML = '';
          const td = body.insertRow().insertCell();
          td.colSpan = 3;
          td.textContent = 'Enter the price to see the breakdown.';
          get('notes').replaceChildren();
          get('notes').hidden = true;
          write('method-text', 'Enter the price to see how the figures are worked out.');
        }

        function render() {
          const price = readPrice();
          const errors = price.error ? [{ id: 'price', message: price.error }] : [];
          showErrors(errors);
          if (errors.length) return resetResults('invalid', 'Check the highlighted fields to see the ' + o.short + ' to pay.');
          if (price.blank) return resetResults('empty', o.emptyMessage);
          const r = calculate(o.nation, price.value, buyer(), nonResident());
          get('results').dataset.state = 'ready';
          write('headline', pounds(r.tax));
          write('summary', 'On a price of ' + LG.money(r.price) + ', that\u2019s ' + LG.percent((r.tax / r.price) * 100, 2) + ' of the price.');
          const status = get('status');
          const badge = r.tax === 0 ? 'No ' + o.short + ' to pay' : r.relief ? 'First-time buyer relief' : r.surcharged ? o.higherName : '';
          status.textContent = badge + (r.nonResident ? (badge ? ', with the non-UK resident surcharge' : 'Includes the non-UK resident surcharge') : '');
          status.hidden = !status.textContent;
          write('rate', LG.percent((r.tax / r.price) * 100, 2));
          write('top', LG.percent(r.rows[r.rows.length - 1].rate * 100, 2));
          write('total', LG.money(r.price + r.tax));
          renderExtra(r);
          renderTable(r);
          renderCompare(r);
          renderNotes(r);
          renderMethod(r);
        }

        // The last figure: what relief saves, what the higher rates add, or the tax-free part.
        function renderExtra(r) {
          const home = calculate(o.nation, r.price, 'home', r.nonResident).tax;
          if (r.relief) {
            write('extra-label', 'First-time buyer relief saves');
            write('extra', pounds(home - r.tax));
          } else if (r.surcharged) {
            write('extra-label', 'Extra for an additional property');
            write('extra', pounds(r.tax - home));
          } else {
            write('extra-label', o.extraLabel);
            const nil = r.rows.length && r.rows[0].rate === 0 ? r.rows[0].to : 0;
            write('extra', pounds(nil));
          }
        }

        const range = (s) => (s.from === 0 ? 'Up to ' + pounds(s.to) : pounds(s.from + 1) + ' to ' + pounds(s.to));
        function renderTable(r) {
          const body = get('table-body');
          body.innerHTML = '';
          const row = (label, rate, tax, cls) => {
            const tr = body.insertRow();
            if (cls) tr.className = cls;
            const th = document.createElement('th');
            th.scope = 'row';
            th.textContent = label;
            tr.appendChild(th);
            tr.insertCell().textContent = rate;
            tr.insertCell().textContent = tax;
          };
          r.rows.forEach((s) => row(range(s), LG.percent(s.rate * 100, 2), LG.money(s.tax)));
          if (r.supplement) row('Additional Dwelling Supplement on ' + LG.money(r.price), LG.percent(RATES.lbtt.additionalDwellingSupplement * 100, 2), LG.money(r.supplement));
          row(o.short + ' to pay', '', pounds(r.tax), 'lgc-row-total');
        }

        // The same price for every kind of buyer this tax has.
        function renderCompare(r) {
          Object.keys(o.buyers).forEach((b) => {
            const tax = calculate(o.nation, r.price, b, r.nonResident).tax;
            const item = get('compare-' + b).parentNode;
            item.classList.toggle('lgc-compare-current', b === r.buyer);
            write('compare-' + b, pounds(tax));
            const diff = tax - r.tax;
            write('compare-' + b + '-note', b === r.buyer ? 'Your figures' : diff === 0 ? 'The same as yours' : pounds(Math.abs(diff)) + (diff > 0 ? ' more than yours' : ' less than yours'));
          });
        }

        function renderNotes(r) {
          const R = RATES[o.nation];
          const notes = [];
          if (o.nation === 'sdlt' && r.buyer === 'first' && !r.relief) {
            notes.push('First-time buyer relief only applies to homes costing up to ' + pounds(R.firstTimeBuyer.maxPrice) + ', so the standard rates apply.');
          }
          if (r.buyer === 'additional' && !r.surcharged) notes.push('The higher rates for additional properties don\u2019t apply below ' + pounds(R.surchargeFrom) + '.');
          if (r.surcharged) notes.push(o.refundNote);
          if (nonResident() && !r.nonResident) notes.push('The non-UK resident surcharge doesn\u2019t apply below ' + pounds(R.surchargeFrom) + '.');
          if (r.nonResident) {
            notes.push(
              'If you\u2019re in the UK for at least 183 days in any 365-day period, from a year before buying to a year after, you can claim the 2% back by amending your return within 2 years of buying.',
            );
          }
          const list = get('notes');
          list.replaceChildren(
            ...notes.map((t) => {
              const li = document.createElement('li');
              li.textContent = t;
              return li;
            }),
          );
          list.hidden = notes.length === 0;
        }

        function renderMethod(r) {
          const parts = r.rows.map((s) => LG.percent(s.rate * 100, 2) + ' on ' + (s.from === 0 ? 'the first ' + pounds(s.to) : 'the part from ' + pounds(s.from) + ' to ' + pounds(s.to)) + ' (' + LG.money(s.tax) + ')');
          let text = 'On a price of ' + LG.money(r.price) + ': ' + parts.join(', ') + '.';
          if (r.supplement) text += ' Plus the Additional Dwelling Supplement of ' + LG.percent(RATES.lbtt.additionalDwellingSupplement * 100, 2) + ' on the whole price (' + LG.money(r.supplement) + ').';
          text += ' Total ' + pounds(r.tax) + ', rounded down to the pound.';
          write('method-text', text);
        }

        get('price').addEventListener('input', render);
        get('price').addEventListener('blur', () => {
          touched.add('price');
          render();
        });
        // Radios and the checkbox.
        get('form').addEventListener('change', (event) => {
          if (!FIELDS[event.target.name]) render();
        });
        get('form').addEventListener('submit', (event) => {
          event.preventDefault();
          touched.add('price');
          render();
          if (!get('error-summary').hidden) get('error-summary').focus();
        });
        // The shared Clear button resets the fields; forget which ones were visited.
        root.querySelector('[data-clear]').addEventListener('click', () => {
          touched.clear();
          render();
        });
        render();
      }
    }
    LG.propertyTax = { calculate, start };
  })();
  /* @v2:property-tax-end */

  /* @v2:stamp-duty-start */
  module('stamp-duty', function () {
    LG.propertyTax.start({
      key: 'stamp-duty',
      prefix: 'lgsd',
      nation: 'sdlt',
      name: 'Stamp Duty',
      short: 'Stamp Duty',
      higherName: 'Higher rates for an additional property',
      extraLabel: 'Tax-free part of the price',
      emptyMessage: 'Enter the price of the home to see the Stamp Duty to pay.',
      refundNote: 'Replacing your main home? If you sell your previous main home within 3 years, you can claim back the extra 5%.',
      buyers: { home: 'Your only home', first: 'First-time buyer', additional: 'Additional property' },
    });
  });
  /* @v2:stamp-duty-end */

  /* @v2:lbtt-start */
  module('lbtt', function () {
    LG.propertyTax.start({
      key: 'lbtt',
      prefix: 'lglbtt',
      nation: 'lbtt',
      name: 'LBTT',
      short: 'LBTT',
      higherName: 'Additional Dwelling Supplement',
      extraLabel: 'Tax-free part of the price',
      emptyMessage: 'Enter the price of the home to see the LBTT to pay.',
      refundNote: 'Replacing your main home? If you sell your previous main home within 36 months, you can claim back the Additional Dwelling Supplement.',
      buyers: { home: 'Your only home', first: 'First-time buyer', additional: 'Additional property' },
    });
  });
  /* @v2:lbtt-end */

  /* @v2:land-transaction-tax-start */
  module('land-transaction-tax', function () {
    LG.propertyTax.start({
      key: 'land-transaction-tax',
      prefix: 'lgltt',
      nation: 'ltt',
      name: 'Land Transaction Tax',
      short: 'Land Transaction Tax',
      higherName: 'Higher residential rates',
      extraLabel: 'Tax-free part of the price',
      emptyMessage: 'Enter the price of the home to see the Land Transaction Tax to pay.',
      refundNote: 'Replacing your main home? If you sell your previous main home within 3 years, you can claim back the difference from the higher rates.',
      buyers: { home: 'Your main home', additional: 'Additional property' },
    });
  });
  /* @v2:land-transaction-tax-end */

  /* ==================================================================
     Redundancy pay calculator  [redundancy-pay]
     Statutory redundancy pay, with the weekly pay cap and bands in data/.
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:redundancy-pay-start */
  module('redundancy-pay', function () {
    'use strict';
    const R = LG.taxYear.redundancy;
    const PERIODS = { week: 1, month: 12 / 52, year: 1 / 52 };

    // age: at the date of redundancy; years: complete years of service;
    // weekly: pay before tax a week; region: 'gb' or 'ni'. Each year is
    // counted back from the redundancy, at the age reached during it.
    function calculate({ age, years, weekly, region }) {
      const cap = region === 'ni' ? R.weeklyPayCapNI : R.weeklyPayCap;
      const counted = Math.min(years, R.maxYears);
      const pay = Math.min(weekly, cap);
      const bands = R.bands.map((b) => ({ fromAge: b.fromAge, weeks: b.weeks, years: 0 }));
      for (let i = 1; i <= counted; i++) {
        const during = age - i;
        bands.find((b) => during >= b.fromAge).years++;
      }
      const weeks = bands.reduce((t, b) => t + b.years * b.weeks, 0);
      const eligible = years >= R.minYears;
      return { cap, counted, pay, capped: weekly > cap, bands, weeks: eligible ? weeks : 0, eligible, total: eligible ? weeks * pay : 0, max: R.maxYears * 1.5 * cap };
    }
    LG.redundancyPay = { calculate };

    const FIELDS = {
      age: { min: 16, max: 99, places: 0, msg: 'Enter your age in whole years, from 16 to 99.' },
      years: { min: 0, max: 84, places: 0, msg: 'Enter how many full years you\u2019ve worked there, or 0.' },
      pay: { min: 1, max: 10000000, places: 2, msg: 'Enter your pay before tax, from \u00A31.' },
    };

    LG.start({
      name: 'Redundancy Pay',
      panel: 'lgrp-form',
      required: ['lgrp-age', 'lgrp-years', 'lgrp-pay', 'lgrp-results', 'lgrp-headline', 'lgrp-table-body', 'lgrp-notes'],
      setup: setup,
    });

    function setup(root) {
      // The document, or the component's shadow root when built into <lg-calculator>.
      const scope = root.getRootNode();
      const get = (id) => scope.getElementById('lgrp-' + id);
      const write = (id, text) => {
        const el = get(id);
        if (el) el.textContent = text;
      };
      const choice = (name, fallback) => (root.querySelector('input[name="lgrp-' + name + '"]:checked') || {}).value || fallback;
      const pounds = (n) => LG.money(n, Math.abs(Math.round(n * 100)) % 100 === 0 ? 0 : 2);
      const weeksText = (n) => (n === 1 ? '1 week' : n === 0.5 ? '\u00BD week' : String(n).replace(/\.5$/, '\u00BD') + ' weeks');
      const weeksPay = (n) => (n === 1 ? '1 week\u2019s pay' : n === 0.5 ? 'Half a week\u2019s pay' : weeksText(n) + '\u2019 pay');
      const touched = new Set();

      function readField(id) {
        const rule = FIELDS[id];
        const item = LG.parseNumber(get(id).value, rule.places);
        if (!item.entered) return { blank: true };
        const ok = item.valid && item.value >= rule.min && item.value <= rule.max;
        return { value: item.value, error: ok ? '' : rule.msg };
      }

      function showErrors(errors) {
        const shown = errors.filter((e) => touched.has(e.id));
        Object.keys(FIELDS).forEach((id) => {
          const e = shown.find((x) => x.id === id);
          LG.markInvalid(get(id), Boolean(e));
          const box = get(id + '-error');
          box.textContent = e ? e.message : '';
          box.hidden = !e;
        });
        const list = get('error-list');
        list.replaceChildren();
        shown.forEach((e) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = '#lgrp-' + e.id;
          a.textContent = e.message;
          a.addEventListener('click', (event) => {
            event.preventDefault();
            get(e.id).focus();
          });
          li.appendChild(a);
          list.appendChild(li);
        });
        get('error-summary').hidden = shown.length === 0;
      }

      function resetResults(state, message) {
        get('results').dataset.state = state;
        write('headline', '\u2014');
        get('status').hidden = true;
        write('summary', message);
        ['weeks', 'weekly', 'counted', 'max'].forEach((id) => write(id, '\u2014'));
        const body = get('table-body');
        body.innerHTML = '';
        const td = body.insertRow().insertCell();
        td.colSpan = 4;
        td.textContent = 'Enter your details to see the breakdown.';
        get('notes').replaceChildren();
        get('notes').hidden = true;
        write('method-text', 'Enter your details to see how the figures are worked out.');
      }

      function render() {
        const values = {};
        const errors = [];
        let blank = false;
        Object.keys(FIELDS).forEach((id) => {
          const r = readField(id);
          if (r.blank) blank = true;
          else if (r.error) errors.push({ id, message: r.error });
          values[id] = r.value;
        });
        if (!errors.length && !blank && values.years > values.age - 15) {
          errors.push({ id: 'years', message: 'Your years with your employer can\u2019t be more than your age minus 15.' });
        }
        showErrors(errors);
        if (errors.length) return resetResults('invalid', 'Check the highlighted fields to see your redundancy pay.');
        if (blank) return resetResults('empty', 'Enter your age, years of service and pay to see your statutory redundancy pay.');
        const region = choice('region', 'gb');
        const weekly = values.pay * PERIODS[choice('period', 'year')];
        const r = calculate({ age: values.age, years: values.years, weekly, region });
        get('results').dataset.state = 'ready';
        write('headline', pounds(r.total));
        const status = get('status');
        status.hidden = false;
        status.textContent = !r.eligible ? 'Less than ' + R.minYears + ' years with your employer' : r.capped ? 'Weekly pay capped at ' + pounds(r.cap) : 'Your full weekly pay counts';
        write(
          'summary',
          r.eligible
            ? weeksPay(r.weeks) + ' at ' + pounds(r.pay) + ' a week, for ' + r.counted + ' year' + (r.counted === 1 ? '' : 's') + ' with your employer.'
            : 'You need to have worked for your employer for at least ' + R.minYears + ' years without a break to get statutory redundancy pay. Your contract may still give you some.',
        );
        write('weeks', r.eligible ? weeksText(r.weeks) : '0 weeks');
        write('weekly', pounds(r.pay));
        write('counted', r.counted + (r.counted === 1 ? ' year' : ' years'));
        write('max', pounds(r.max));
        renderTable(r);
        renderNotes(r, values, region);
        renderMethod(r, values, weekly);
      }

      const BAND_NAMES = { 41: 'Aged 41 or over', 22: 'Aged 22 to 40', 0: 'Under 22' };
      function renderTable(r) {
        const body = get('table-body');
        body.innerHTML = '';
        const row = (label, years, weeks, pay, cls) => {
          const tr = body.insertRow();
          if (cls) tr.className = cls;
          const th = document.createElement('th');
          th.scope = 'row';
          th.textContent = label;
          tr.appendChild(th);
          [years, weeks, pay].forEach((t) => (tr.insertCell().textContent = t));
        };
        r.bands.forEach((b) => {
          if (!b.years) return;
          const weeks = r.eligible ? b.years * b.weeks : 0;
          row(BAND_NAMES[b.fromAge] + ' (' + weeksText(b.weeks) + ' a year)', String(b.years), weeksText(weeks), pounds(weeks * r.pay));
        });
        row('Statutory redundancy pay', String(r.counted), r.eligible ? weeksText(r.weeks) : '0 weeks', pounds(r.total), 'lgc-row-total');
      }

      function renderNotes(r, values, region) {
        const notes = [];
        if (values.years > R.maxYears) notes.push('Only your last ' + R.maxYears + ' years count, so ' + (values.years - R.maxYears) + ' earlier year' + (values.years - R.maxYears === 1 ? '' : 's') + ' don\u2019t add anything.');
        if (r.capped) notes.push('Weekly pay is capped at ' + pounds(r.cap) + (region === 'ni' ? ' in Northern Ireland' : '') + ' for redundancies from 6 April 2026, so pay above that doesn\u2019t count.');
        if (r.eligible) notes.push('Statutory redundancy pay is tax-free, along with any other redundancy pay up to ' + pounds(R.taxFree) + ' in total. Notice pay, holiday pay and wages owed are taxed as normal.');
        notes.push('Your contract may give you more than the legal minimum. Check your contract or staff handbook, or ask your employer.');
        const list = get('notes');
        list.replaceChildren(
          ...notes.map((t) => {
            const li = document.createElement('li');
            li.textContent = t;
            return li;
          }),
        );
        list.hidden = false;
      }

      function renderMethod(r, values, weekly) {
        if (!r.eligible) {
          write('method-text', 'With ' + values.years + ' full year' + (values.years === 1 ? '' : 's') + ' with your employer, you\u2019re under the ' + R.minYears + ' years needed for statutory redundancy pay.');
          return;
        }
        const parts = r.bands.filter((b) => b.years).map((b) => b.years + ' year' + (b.years === 1 ? '' : 's') + ' ' + BAND_NAMES[b.fromAge].toLowerCase() + ' at ' + weeksText(b.weeks));
        write(
          'method-text',
          'Counting back from your redundancy at age ' + values.age + ': ' + parts.join(', ') + ', which makes ' + weeksText(r.weeks) + '. ' +
            'Your weekly pay before tax is ' + pounds(weekly) + (r.capped ? ', capped at ' + pounds(r.cap) : '') + ', so you get ' + weeksText(r.weeks) + ' \u00D7 ' + pounds(r.pay) + ' = ' + pounds(r.total) + '.',
        );
      }

      Object.keys(FIELDS).forEach((id) => {
        get(id).addEventListener('input', render);
        get(id).addEventListener('blur', () => {
          touched.add(id);
          render();
        });
      });
      // Radios (text fields update on input).
      get('form').addEventListener('change', (event) => {
        if (!FIELDS[event.target.name]) render();
      });
      get('form').addEventListener('submit', (event) => {
        event.preventDefault();
        Object.keys(FIELDS).forEach((id) => touched.add(id));
        render();
        if (!get('error-summary').hidden) get('error-summary').focus();
      });
      // The shared Clear button resets the fields; forget which ones were visited.
      root.querySelector('[data-clear]').addEventListener('click', () => {
        touched.clear();
        render();
      });
      render();
    }
  });
  /* @v2:redundancy-pay-end */

  /* ==================================================================
     Mortgage affordability calculator  [mortgage-affordability]
     How much lenders could offer, as a range of income multiples, with
     the figures in data/ (mortgageAffordability). Lenders' own models are
     private and vary, so it shows the range and the working, not one figure.
     Also built into the <lg-calculator> component (scripts/build-v2.js).
     ================================================================== */
  /* @v2:mortgage-affordability-start */
  module('mortgage-affordability', function () {
    'use strict';
    const A = LG.taxYear.mortgageAffordability;
    // The multiples shown: the bottom and top of "most lenders", then each band's top.
    const MULTIPLES = [A.bands[0].from].concat(A.bands.map((b) => b.to));
    const BANDS = ['most', 'most', 'many', 'specialist'];

    // Monthly payment on a loan. rate: % a year; years: the term.
    function payment(loan, rate, years, type) {
      const r = rate / 1200;
      const n = Math.round(years * 12);
      if (type === 'interest-only') return loan * r;
      return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
    }

    // The longest term that ends by repaidByAge, within the terms offered.
    const maxTerm = (age) => Math.min(A.terms.max, A.repaidByAge - age);

    // Take-home pay a month. Two applicants' pay is split equally. tax:
    // { region, pensionPct (taken before tax), student, deductions (a month) }.
    function takeHome(gross, people, tax) {
      const each = gross / people;
      const pension = (each * tax.pensionPct) / 100;
      const incomeTax = LG.ukTax.incomeTax(each - pension, tax.region);
      const ni = LG.ukTax.employeeNI(each);
      const perPerson = (each - pension - incomeTax - ni) / 12;
      return { net: perPerson * people - tax.student - tax.deductions, pension: (pension * people) / 12, incomeTax: (incomeTax * people) / 12, ni: (ni * people) / 12 };
    }

    // How comfortable what's left is: 'good', 'tight' or 'short'.
    function comfort(left, net, withLiving) {
      const t = withLiving ? A.cashFlow.withLivingCosts : A.cashFlow.withoutLivingCosts;
      if (net > 0 && left >= net * t.good) return 'good';
      if (net > 0 && left >= net * t.tight) return 'tight';
      return 'short';
    }

    // input: { people (1 or 2), income, variable (a year, combined), loans,
    // cards, cardsType ('balance' | 'payments'), other, existing, living (a
    // month; living null if not entered), price (null if not entered),
    // deposit, term, rate, type ('repayment' | 'interest-only'), tax }.
    function calculate(input) {
      const counted = input.income + input.variable * A.variableIncome;
      const gross = input.income + input.variable;
      const cardsMonthly = input.cardsType === 'payments' ? input.cards : input.cards * A.cardPayment;
      const debts = input.loans + cardsMonthly + input.existing;
      const commitments = debts + input.other;
      const assessed = Math.max(0, counted - commitments * 12);
      const pay = takeHome(gross, input.people, input.tax);
      const points = MULTIPLES.map((multiple) => {
        const loan = Math.floor((assessed * multiple) / 1000) * 1000;
        const price = loan + input.deposit;
        const ltv = price > 0 ? (loan / price) * 100 : 0;
        return { multiple, loan, price, ltv, band: A.ltvBands.find((b) => ltv <= b + 1e-9) || null, monthly: payment(loan, input.rate, input.term, input.type) };
      });
      // The loan for the cash flow: what the home needs, or else what most lenders could offer.
      const priced = input.price !== null;
      const loan = priced ? Math.max(0, input.price - input.deposit) : points[1].loan;
      const ltv = priced && input.price > 0 ? (loan / input.price) * 100 : null;
      const fitIndex = points.findIndex((p, i) => i > 0 && loan <= p.loan);
      const flow = (rise) => {
        const monthly = payment(loan, input.rate + rise, input.term, input.type);
        const left = pay.net - monthly - debts - input.other - (input.living || 0);
        return { rate: input.rate + rise, monthly, left, status: comfort(left, pay.net, input.living !== null) };
      };
      // The smallest rise (in 0.05 steps, up to rateRiseMax) where the colour changes.
      const tipping = {};
      const now = flow(0).status;
      for (let step = 0; step <= A.rateRiseMax * 20; step++) {
        const s = flow(step / 20).status;
        if (s !== now && s !== 'good' && !(s in tipping)) tipping[s] = step / 20;
      }
      const first = flow(0);
      return {
        counted,
        gross,
        cardsMonthly,
        debts,
        commitments,
        assessed,
        pay,
        points,
        priced,
        loan,
        ltv,
        ltvBand: ltv === null ? null : A.ltvBands.find((b) => ltv <= b + 1e-9) || null,
        fit: loan <= 0 ? 'none' : fitIndex < 0 ? 'beyond' : BANDS[fitIndex],
        monthly: first.monthly,
        left: first.left,
        status: first.status,
        flow,
        tipping,
        // What a year of commitments costs in borrowing, at the top of "most lenders" and "many lenders".
        reduction: [MULTIPLES[1], MULTIPLES[2]].map((m) => Math.round((Math.min(counted, commitments * 12) * m) / 1000) * 1000),
        share: pay.net > 0 ? (first.monthly / pay.net) * 100 : 0,
        dti: gross > 0 ? ((debts + first.monthly) / (gross / 12)) * 100 : 0,
      };
    }
    LG.mortgageAffordability = { calculate, payment, takeHome, maxTerm };

    const money = { min: 0, max: 100000000, msg: 'Enter an amount in pounds, or leave it blank.' };
    const FIELDS = {
      age: { min: 18, max: A.repaidByAge - A.terms.min, places: 0, msg: 'Enter an age from 18 to ' + (A.repaidByAge - A.terms.min) + '. Lenders usually want a mortgage repaid by ' + A.repaidByAge + ', though some lend to older people: a mortgage adviser can help.' },
      income: { min: 1, max: 100000000, msg: 'Enter your yearly pay before tax, from \u00A31.' },
      variable: money,
      loans: money,
      cards: money,
      other: money,
      living: money,
      existing: money,
      price: { min: 1, max: 100000000, msg: 'Enter the price in pounds, or leave it blank.' },
      deposit: money,
      rate: { min: 0, max: 20, msg: 'Enter an interest rate from 0% to 20%.' },
      pension: { min: 0, max: 100, msg: 'Enter a pension contribution from 0% to 100%.' },
      student: money,
      deductions: money,
    };
    const REQUIRED = ['age', 'income', 'rate'];
    // The Debt-to-Income calculator's bands (upper bound exclusive).
    const DTI_BANDS = [
      [20, 'low'],
      [36, 'manageable'],
      [50, 'high'],
      [Infinity, 'very high'],
    ];
    const STATUS = { good: 'Healthy surplus', tight: 'Tight margin', short: 'Not enough left' };

    LG.start({
      name: 'Mortgage Affordability',
      panel: 'lgma-form',
      required: ['lgma-age', 'lgma-income', 'lgma-term', 'lgma-existing-field', 'lgma-second-banner', 'lgma-results', 'lgma-headline', 'lgma-flow', 'lgma-rise', 'lgma-table-body', 'lgma-checks-body', 'lgma-notes'],
      setup: setup,
    });

    function setup(root) {
      // The document, or the component's shadow root when built into <lg-calculator>.
      const scope = root.getRootNode();
      const get = (id) => scope.getElementById('lgma-' + id);
      const write = (id, text) => {
        const el = get(id);
        if (el) el.textContent = text;
      };
      const choice = (name, fallback) => (root.querySelector('input[name="lgma-' + name + '"]:checked') || {}).value || fallback;
      const pounds = (n) => LG.money(Math.round(n), 0);
      const signed = (n) => (n < 0 ? '\u2212' : '') + pounds(Math.abs(n));
      const times = (m) => String(m) + ' times';
      const pct = (n) => Number(n.toFixed(2)) + '%';
      // "a, b and c"
      const list = (items) => (items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items.join(''));
      const touched = new Set();

      // What the form shows: labels for one or two people, the card field's
      // wording, the second-home banner and field, and the terms that end by 75.
      function arrange(age) {
        const joint = choice('applicants', 'one') === 'two';
        const additional = choice('purchase', 'first') === 'additional';
        write('income-label', joint ? 'Combined basic salary before tax' : 'Basic salary before tax');
        write('variable-label', joint ? 'Combined bonus, overtime and commission' : 'Bonus, overtime and commission');
        const payments = choice('cards-type', 'balance') === 'payments';
        write('cards-label', payments ? 'Credit card minimum payments' : 'Credit card balances');
        write('cards-affix', payments ? 'a month' : 'owed');
        get('second-banner').hidden = !additional;
        get('existing-field').hidden = !additional;
        const select = get('term');
        const max = Number.isFinite(age) ? maxTerm(age) : A.terms.max;
        let chosen = Number(select.value);
        Array.prototype.forEach.call(select.options, (o) => {
          o.disabled = Number(o.value) > max;
        });
        if (chosen > max) {
          const allowed = Array.prototype.filter.call(select.options, (o) => !o.disabled);
          if (allowed.length) {
            select.value = allowed[allowed.length - 1].value;
            chosen = Number(select.value);
          }
        }
        write(
          'term-note',
          Number.isFinite(age)
            ? 'At ' + age + ', the longest term that ends by age ' + A.repaidByAge + ' is ' + max + ' years. Lenders\u2019 age limits vary: some stop earlier, others lend later.'
            : 'Enter your age to see the terms that end by age ' + A.repaidByAge + '. Lenders\u2019 age limits vary.',
        );
        return { joint, additional, term: chosen };
      }

      function readField(id) {
        const rule = FIELDS[id];
        const item = LG.parseNumber(get(id).value.replace(/%\s*$/, ''), rule.places === undefined ? 2 : rule.places);
        if (!item.entered) return { blank: true, value: null };
        const ok = item.valid && item.value >= rule.min && item.value <= rule.max;
        return { value: item.value, error: ok ? '' : rule.msg };
      }

      function showErrors(errors) {
        const shown = errors.filter((e) => touched.has(e.id));
        Object.keys(FIELDS).forEach((id) => {
          const e = shown.find((x) => x.id === id);
          LG.markInvalid(get(id), Boolean(e));
          const box = get(id + '-error');
          if (!box) return;
          box.textContent = e ? e.message : '';
          box.hidden = !e;
        });
        const list = get('error-list');
        list.replaceChildren();
        shown.forEach((e) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = '#lgma-' + e.id;
          a.textContent = e.message;
          a.addEventListener('click', (event) => {
            event.preventDefault();
            get(e.id).focus();
          });
          li.appendChild(a);
          list.appendChild(li);
        });
        get('error-summary').hidden = shown.length === 0;
      }

      function emptyRow(id, cols, text) {
        const body = get(id);
        body.innerHTML = '';
        const td = body.insertRow().insertCell();
        td.colSpan = cols;
        td.textContent = text;
      }

      function resetResults(state, message) {
        get('results').dataset.state = state;
        write('headline', '\u2014');
        get('status').hidden = true;
        write('summary', message);
        ['most', 'many', 'specialist', 'counted', 'flow-net', 'flow-mortgage', 'flow-debts', 'flow-spending', 'flow-living', 'flow-left', 'rise-rate', 'rise-payment', 'rise-left'].forEach((id) => write(id, '\u2014'));
        get('flow').removeAttribute('data-status');
        get('flow-status').hidden = true;
        get('rise-status').hidden = true;
        write('rise-note', 'Slide to see how a higher rate changes what\u2019s left, up to ' + A.rateRiseMax + ' points higher. Lenders test this too.');
        write('takehome-text', 'Enter your pay to see how your take-home pay is worked out.');
        emptyRow('table-body', 5, 'Enter your income to see what you could borrow.');
        emptyRow('checks-body', 2, 'Enter your income to see the payments.');
        get('notes').replaceChildren();
        get('notes').hidden = true;
        write('method-text', 'Enter your details to see how the figures are worked out.');
        last = null;
      }

      let last = null; // the latest input and result, for the rate slider
      function render() {
        const ageRead = readField('age');
        const layout = arrange(ageRead.error || ageRead.blank ? NaN : ageRead.value);
        const ids = Object.keys(FIELDS).filter((id) => layout.additional || id !== 'existing');
        const values = {};
        const errors = [];
        let blank = false;
        ids.forEach((id) => {
          const r = readField(id);
          values[id] = r.value;
          if (r.error) errors.push({ id, message: r.error });
          else if (r.blank && REQUIRED.includes(id)) blank = true;
        });
        showErrors(errors);
        if (errors.length) return resetResults('invalid', 'Check the highlighted fields to see what you could borrow.');
        if (blank) return resetResults('empty', 'Enter your age and pay to see what lenders could offer you.');
        const zero = (v) => v || 0;
        const input = {
          people: layout.joint ? 2 : 1,
          income: values.income,
          variable: zero(values.variable),
          loans: zero(values.loans),
          cards: zero(values.cards),
          cardsType: choice('cards-type', 'balance'),
          other: zero(values.other),
          existing: zero(values.existing),
          living: values.living,
          price: values.price,
          deposit: zero(values.deposit),
          term: layout.term,
          rate: values.rate,
          type: choice('type', 'repayment'),
          tax: { region: choice('region', 'ruk'), pensionPct: values.pension === null ? 0 : values.pension, student: zero(values.student), deductions: zero(values.deductions) },
        };
        const r = calculate(input);
        last = { input, r };
        const p = r.points;
        get('results').dataset.state = 'ready';
        write('headline', r.assessed > 0 ? pounds(p[0].loan) + ' to ' + pounds(p[2].loan) : pounds(0));
        const status = get('status');
        status.textContent = badge(r);
        status.hidden = !status.textContent;
        write(
          'summary',
          r.assessed > 0
            ? 'Most lenders could offer ' + pounds(p[0].loan) + ' to ' + pounds(p[1].loan) + ', and many up to ' + pounds(p[2].loan) + ' for higher incomes or bigger deposits. A few specialist lenders go up to ' + pounds(p[3].loan) + '.'
            : 'Your commitments are more than the income lenders would count, so most lenders are unlikely to offer a mortgage until they come down.',
        );
        write('most', pounds(p[0].loan) + ' to ' + pounds(p[1].loan));
        write('many', pounds(p[2].loan));
        write('specialist', pounds(p[3].loan));
        write('counted', pounds(r.assessed) + ' a year');
        renderFlow(r, input);
        renderRise();
        renderTakeHome(r, input);
        renderTable(r);
        renderChecks(r, input);
        renderNotes(r, input);
        renderMethod(r, input);
      }

      // Whether the loan the home needs is within reach, or the LTV of what most lenders offer.
      function badge(r) {
        if (r.assessed <= 0) return '';
        if (!r.priced) return LG.percent(r.points[1].ltv, 0) + ' loan-to-value at ' + times(MULTIPLES[1]);
        const need = 'Borrowing ' + pounds(r.loan) + ': ';
        return need + { none: 'none needed', most: 'within most lenders\u2019 range', many: 'with many lenders', specialist: 'only with specialist lenders', beyond: 'more than lenders are likely to offer' }[r.fit];
      }

      function renderFlow(r, input) {
        const flow = get('flow');
        flow.dataset.status = r.status;
        write('flow-net', pounds(r.pay.net));
        write('flow-mortgage-label', 'Mortgage payment on ' + pounds(r.loan) + (input.type === 'interest-only' ? ' (interest only)' : ''));
        write('flow-mortgage', '\u2212' + pounds(r.monthly));
        write('flow-debts', '\u2212' + pounds(r.debts));
        write('flow-spending', '\u2212' + pounds(input.other));
        write('flow-living', input.living === null ? 'Not entered' : '\u2212' + pounds(input.living));
        write('flow-left-label', input.living === null ? 'Left for everyday costs and saving' : 'Left each month');
        write('flow-left', signed(r.left));
        const s = get('flow-status');
        s.hidden = false;
        s.dataset.status = r.status;
        const share = LG.percent(r.pay.net > 0 ? (Math.max(0, r.left) / r.pay.net) * 100 : 0, 0);
        s.textContent = STATUS[r.status] + ': ' + (r.left < 0 ? pounds(-r.left) + ' short each month' : (r.status === 'short' ? 'only ' : '') + share + ' of your take-home pay left' + (input.living === null ? ' for everyday costs' : ''));
        write('flow-intro', r.priced ? 'What would be left each month with the loan your home needs, after the mortgage, your debts and your spending.' : 'What would be left each month borrowing what most lenders could offer, after the mortgage, your debts and your spending. Add a property price to use the loan your home needs.');
      }

      // The rate slider: payment and what's left at the chosen rise, and where the colour changes.
      const rise = get('rise');
      function renderRise() {
        if (!last) return;
        const value = Number(rise.value) || 0;
        const f = last.r.flow(value);
        rise.style.setProperty('--lgc-fill', (value / A.rateRiseMax) * 100 + '%');
        rise.setAttribute('aria-valuetext', '+' + value + ' points: ' + pct(f.rate));
        write('rise-rate', pct(f.rate) + (value ? ' (+' + value + ')' : ''));
        write('rise-payment', pounds(f.monthly));
        write('rise-left', signed(f.left));
        const s = get('rise-status');
        s.hidden = false;
        s.dataset.status = f.status;
        s.textContent = STATUS[f.status];
        const t = last.r.tipping;
        const at = (x) => '+' + Number(x.toFixed(2)) + ' points (' + pct(last.input.rate + x) + ')';
        const parts = [];
        if ('tight' in t) parts.push('turns amber at ' + at(t.tight));
        if ('short' in t) parts.push('turns red at ' + at(t.short));
        write(
          'rise-note',
          last.r.status === 'short'
            ? 'You\u2019d already be short at today\u2019s rate.'
            : parts.length
              ? 'What\u2019s left ' + list(parts) + '.'
              : 'What\u2019s left stays ' + (last.r.status === 'good' ? 'green' : 'amber') + ' even ' + A.rateRiseMax + ' points higher.',
        );
      }
      rise.addEventListener('input', renderRise);

      function renderTakeHome(r, input) {
        const t = r.pay;
        const parts = ['From ' + pounds(r.gross / 12) + ' a month before tax' + (input.people === 2 ? ' (split equally between you)' : '')];
        if (t.pension > 0) parts.push(pounds(t.pension) + ' pension');
        parts.push(pounds(t.incomeTax) + ' income tax (' + (input.tax.region === 'scotland' ? 'Scottish' : 'England, Wales and Northern Ireland') + ' rates)');
        parts.push(pounds(t.ni) + ' National Insurance');
        if (input.tax.student) parts.push(pounds(input.tax.student) + ' student loan');
        if (input.tax.deductions) parts.push(pounds(input.tax.deductions) + ' other deductions');
        write('takehome-text', parts[0] + ', we take off ' + list(parts.slice(1)) + ', leaving ' + pounds(t.net) + ' a month. Change any of these below.');
      }

      // A table with column headings labels each cell with its heading, so
      // on a phone (.lgc-table-stack) each row can show as a small card.
      function row(body, cells, cls) {
        const tr = body.insertRow();
        const head = body.parentNode.tHead;
        if (cls) tr.className = cls;
        cells.forEach((c, i) => {
          const cell = i ? tr.insertCell() : document.createElement('th');
          if (!i) {
            cell.scope = 'row';
            tr.appendChild(cell);
          } else if (head) cell.setAttribute('data-label', head.rows[0].cells[i].textContent);
          if (c && typeof c === 'object') {
            cell.textContent = c.text;
            cell.id = c.id;
          } else cell.textContent = c;
        });
      }

      function renderTable(r) {
        const body = get('table-body');
        body.innerHTML = '';
        r.points.forEach((pt, i) => {
          const id = (name) => (i === 1 ? { id: 'lgma-main-' + name } : {});
          row(
            body,
            [
              times(pt.multiple),
              Object.assign({ text: pounds(pt.loan) }, id('loan')),
              Object.assign({ text: pounds(pt.price) }, id('price')),
              pt.price > 0 ? LG.percent(pt.ltv, 0) : '\u2014',
              pounds(pt.monthly),
            ],
            i === 1 ? 'lgc-row-total' : '',
          );
        });
      }

      function dtiBand(dti) {
        return DTI_BANDS.find((b) => Math.round(dti * 10) / 10 < b[0])[1];
      }
      function renderChecks(r, input) {
        const body = get('checks-body');
        body.innerHTML = '';
        if (r.priced) {
          row(body, ['Borrowing your home needs', pounds(r.loan) + ' (' + pounds(input.price) + ' less ' + pounds(input.deposit) + ' deposit)']);
          row(body, ['Loan-to-value', r.ltv === null ? '\u2014' : LG.percent(r.ltv, 0) + (r.ltvBand ? ' (' + r.ltvBand + '% band)' : ' (over 95%)')]);
        }
        row(body, ['Monthly payment' + (input.type === 'interest-only' ? ' (interest only)' : ''), pounds(r.monthly)]);
        row(body, ['Share of your take-home pay', r.pay.net > 0 ? LG.percent(r.share, 0) + ' of ' + pounds(r.pay.net) + ' a month' : '\u2014']);
        row(body, ['Debt-to-income with this mortgage', LG.percent(r.dti, 0) + ' (' + dtiBand(r.dti) + ')']);
        row(body, ['Commitments lenders count a month', pounds(r.commitments)]);
        if (r.commitments > 0) row(body, ['What your commitments cost in borrowing', 'about ' + pounds(r.reduction[0]) + ' to ' + pounds(r.reduction[1])]);
      }

      function renderNotes(r, input) {
        const notes = [];
        if (input.variable > 0) notes.push('Bonus, overtime and commission are counted at ' + LG.percent(A.variableIncome * 100, 0) + '. Many lenders count 60% to 70%, and some specialist lenders and building societies count all of it if it\u2019s guaranteed or you have a 2-year record, so you could borrow more.');
        if (input.cards > 0 && input.cardsType === 'balance') notes.push('Credit card balances are counted as a monthly payment of ' + LG.percent(A.cardPayment * 100, 0) + ' of the balance (' + pounds(r.cardsMonthly) + '), as many lenders do. Paying a card off before you apply can raise what you can borrow.');
        if (r.commitments > 0) notes.push('Lenders treat commitments differently. This takes a year of them off your income before multiplying, which is cautious: some lenders will offer more.');
        if (r.priced && r.fit === 'beyond') notes.push('The loan this home needs is more than lenders are likely to offer on your income. A bigger deposit, a lower price or clearing debts would help.');
        if (input.type === 'interest-only') notes.push('Interest-only mortgages usually need a deposit of at least ' + (100 - A.interestOnlyMaxLtv) + '% and a plan to repay the loan at the end, such as savings or selling another property. Many lenders also need a higher income.');
        if (choice('rate-type', 'fixed') === 'variable') notes.push('On a variable or tracker rate, your payment changes whenever the rate does. Use the slider to see what a rise would cost.');
        const ltv = r.priced ? r.ltv : r.points[1].ltv;
        const band = r.priced ? r.ltvBand : r.points[1].band;
        if (ltv !== null && !band) notes.push('Very few lenders go above 95% loan-to-value. A bigger deposit widens your choice and usually lowers the rate.');
        else if (band > 75) notes.push('Lower loan-to-value bands usually get lower rates: each step down (90%, 85%, 75%, 60%) can bring a better deal.');
        if (dtiBand(r.dti) === 'high' || dtiBand(r.dti) === 'very high') notes.push('With this mortgage, your debt repayments would be a high share of your income. Some lenders may offer less, and the payments could be hard to keep up if your circumstances change.');
        const list = get('notes');
        list.replaceChildren(
          ...notes.map((t) => {
            const li = document.createElement('li');
            li.textContent = t;
            return li;
          }),
        );
        list.hidden = notes.length === 0;
      }

      function renderMethod(r, input) {
        const parts = [];
        parts.push('Income counted: ' + pounds(r.counted) + ' a year');
        if (input.variable > 0) parts.push(' (basic pay in full, other pay at ' + LG.percent(A.variableIncome * 100, 0) + ')');
        if (r.commitments > 0) parts.push(', less a year of commitments (' + pounds(r.commitments * 12) + '), leaves ' + pounds(r.assessed));
        parts.push('. ');
        parts.push('At ' + list(MULTIPLES.map(String)) + ' times that, rounded down to the nearest \u00A31,000, lenders could offer ' + list(r.points.map((pt) => pounds(pt.loan))) + '. ');
        parts.push('Payments are worked out at ' + pct(input.rate) + ' over ' + input.term + ' years' + (input.type === 'interest-only' ? ', interest only' : ', repaying the loan') + '.');
        write('method-text', parts.join(''));
      }

      // The figures to try in the results are the form's own fields: typing in
      // either updates both.
      root.querySelectorAll('input[data-mirror]').forEach((copy) => {
        const field = scope.getElementById(copy.getAttribute('data-mirror'));
        copy.addEventListener('input', () => {
          field.value = copy.value;
          touched.add(field.name);
          render();
        });
        field.addEventListener('input', () => {
          if (scope.activeElement !== copy) copy.value = field.value;
        });
        // After the field is tidied (12,500 style), so is its copy.
        field.addEventListener('focusout', () => {
          copy.value = field.value;
        });
        copy.addEventListener('focusout', () => {
          copy.value = field.value = copy.value;
        });
      });

      Object.keys(FIELDS).forEach((id) => {
        get(id).addEventListener('input', render);
        get(id).addEventListener('blur', () => {
          touched.add(id);
          render();
        });
      });
      // Radios and the term (text fields update on input).
      root.addEventListener('change', (event) => {
        if (!FIELDS[event.target.name] && !event.target.hasAttribute('data-mirror') && event.target !== rise) render();
      });
      get('form').addEventListener('submit', (event) => {
        event.preventDefault();
        Object.keys(FIELDS).forEach((id) => touched.add(id));
        render();
        if (!get('error-summary').hidden) get('error-summary').focus();
      });
      // The shared Clear button resets the fields; forget which ones were visited.
      root.querySelector('[data-clear]').addEventListener('click', () => {
        touched.clear();
        render();
      });
      render();
    }
  });
  /* @v2:mortgage-affordability-end */
})(window, document);
