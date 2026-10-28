/*!
 * Lyfeguard calculators | lg-calc.js | v1.2.0
 * One file for every /tools calculator. Each module starts only when its
 * markup is on the page, so the same file is safe to load on every calculator.
 * Load with: <script src=".../lg-calc.js" defer></script>
 */
(function (window, document) {
  'use strict';

  var LG = (window.LyfeTools = window.LyfeTools || {});
  LG.version = '1.2.0';

  /* ------------------------------------------------------------------
     Core: start-up helpers
     ------------------------------------------------------------------ */
  function report(key, error) {
    if (window.console && console.error) console.error('[Lyfeguard calculators] ' + key + ':', error);
  }

  // Run fn once the DOM is parsed. Works with defer, async or inline loading.
  LG.ready = function (fn) {
    function run() {
      try {
        fn();
      } catch (error) {
        report('init', error);
      }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  };

  // Each calculator is isolated: an error in one never stops the others.
  function module(key, factory) {
    try {
      factory();
    } catch (error) {
      report(key, error);
    }
  }

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
     Core: UK Income Tax and employee National Insurance, 2026/27
     England, Wales and Northern Ireland. Update here once a year; the
     pro rata salary and salary-by-age calculators both read from it.
     ------------------------------------------------------------------ */
  var TAX = {
    taxYear: '2026/27',
    personalAllowance: 12570,
    taperStart: 100000,
    basicBand: 37700,
    additionalThreshold: 125140,
    niPrimary: 12570,
    niUpper: 50270,
  };
  function incomeTax(taxableIncome) {
    var pa = TAX.personalAllowance;
    if (taxableIncome > TAX.taperStart) {
      pa = Math.max(0, pa - Math.floor((taxableIncome - TAX.taperStart) / 2));
    }
    var t = Math.max(0, taxableIncome - pa);
    var basic = Math.min(t, TAX.basicBand);
    var higher = Math.min(Math.max(t - TAX.basicBand, 0), TAX.additionalThreshold - TAX.basicBand);
    var additional = Math.max(t - TAX.additionalThreshold, 0);
    return basic * 0.2 + higher * 0.4 + additional * 0.45;
  }
  function employeeNI(gross) {
    var main = Math.min(Math.max(gross - TAX.niPrimary, 0), TAX.niUpper - TAX.niPrimary);
    var upper = Math.max(gross - TAX.niUpper, 0);
    return main * 0.08 + upper * 0.02;
  }
  LG.ukTax = { rates: TAX, incomeTax: incomeTax, employeeNI: employeeNI };

  /* ------------------------------------------------------------------
     Core: shared helpers for the panel-style calculators
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

  // Show or clear a calculator's error message (an element with role="alert").
  LG.showError = function (el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
    el.style.display = message ? 'block' : 'none';
  };

  /* ==================================================================
     Net worth calculator  [net-worth]
     ================================================================== */
  module('net-worth', function () {
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
    const get = (id) => document.getElementById(id);
    const set = (id, value) => {
      const node = get(id);
      if (node) node.textContent = value;
    };
    const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 });
    const fmtWhole = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const dateLabel = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const pence = (n) => Math.round(n * 100);
    const pounds = (cents) => cents / 100;
    const money = (cents) => (cents % 100 === 0 ? fmtWhole.format(pounds(cents)) : fmtGBP.format(pounds(cents)));
    const ratioText = (n) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n) + '%';
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
      const raw = String(input.value ?? '').trim();
      if (raw === '') return { valid: true, cents: 0, entered: false };
      const clean = raw.replace(/\u00A3/g, '').replace(/\s/g, '');
      if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d{0,2})?$/.test(clean) || clean === '') return { valid: false, cents: 0, entered: true };
      const numeric = clean.replace(/,/g, '');
      const validFormat = /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(numeric);
      const amount = validFormat ? Number(numeric) : NaN;
      const valid = Number.isFinite(amount) && amount >= 0 && amount <= 1e12;
      return { valid, cents: valid ? pence(amount) : 0, entered: true };
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
        scope: (document.querySelector('input[name="lgnw-scope"]:checked') || {}).value || 'personal',
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

    function init() {
      const root = get('lgnw-assets-panel');
      if (!root || root.dataset.lgnwReady === 'true') return;
      const missing = ALL.filter((item) => !get('lgnw-' + item.id));
      if (missing.length) {
        console.warn(
          '[Lyfeguard Net Worth] Missing input fields:',
          missing.map((item) => item.id),
        );
        return;
      }
      root.dataset.lgnwReady = 'true';
      set('lgnw-snapshot-date', 'Calculated ' + dateLabel());
      ALL.forEach((item) => {
        const input = get('lgnw-' + item.id);
        input.addEventListener('input', update);
        input.addEventListener('change', update);
      });
      document.querySelectorAll('input[name="lgnw-scope"]').forEach((input) => input.addEventListener('change', update));
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
    LG.ready(init);
  });

  /* ==================================================================
     Inheritance tax calculator  [inheritance-tax]
     ================================================================== */
  module('inheritance-tax', function () {
    'use strict';

    const PREFIX = 'lgiht-';
    const get = (id) => document.getElementById(PREFIX + id);
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
    const NRB = 32500000;
    const RNRB = 17500000;
    const TWO_MILLION = 200000000;
    const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const GBP_PENCE = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pounds = (pence) => pence / 100;
    const money = (pence) => (pence % 100 === 0 ? GBP : GBP_PENCE).format(pounds(pence));
    const ratio = (n) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n) + '%';
    let lastModel = null;

    function parseAmount(id, percent = false) {
      const input = get(id);
      if (!input) return { valid: false, entered: false, value: 0 };
      const raw = String(input.value ?? '').trim();
      if (!raw) return { valid: true, entered: false, value: 0 };
      const cleaned = raw.replace(/[\u00A3,\s%]/g, '');
      if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(cleaned)) return { valid: false, entered: true, value: 0 };
      const number = Number(cleaned);
      if (!Number.isFinite(number) || number < 0 || number > (percent ? 100 : MAX)) return { valid: false, entered: true, value: 0 };
      return { valid: true, entered: true, value: percent ? number : Math.round(number * 100) };
    }

    function announce(message) {
      const status = document.getElementById('lgiht-status');
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
        const errorNode = document.getElementById(errorId);
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
      const pension2027Row = document.getElementById('lgiht-pension-2027-field');
      if (pension2027Row) pension2027Row.hidden = period !== '2027';
      const spouseRow = document.getElementById('lgiht-spouse-scope-row');
      const spouseValue = parseAmount('spouse');
      if (spouseRow) spouseRow.hidden = !(spouseValue.valid && spouseValue.value > 0);
      const reliefRow = document.getElementById('lgiht-relief-confirmation-row');
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
      const APR_BPR_100_CAP = 250000000; // pence
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
        const st = document.getElementById('lgiht-status');
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

    function init() {
      const root = get('assets-card');
      if (!root || root.dataset.ready === 'true') return;
      const required = ALL_INPUTS.concat(['period', 'home-desc', 'transfer', 'spouse-scope', 'relief-confirmation']);
      const missing = required.filter((id) => !get(id));
      if (missing.length) {
        console.warn('[Lyfeguard IHT] Missing input IDs:', missing.join(', '));
        return;
      }
      root.dataset.ready = 'true';
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
    LG.ready(init);
  });

  /* ==================================================================
     Compound interest calculator  [compound-interest]
     ================================================================== */
  module('compound-interest', function () {
    'use strict';
    const ids = ['lgci-initial', 'lgci-contribution', 'lgci-frequency', 'lgci-rate', 'lgci-years'];
    LG.start({ name: 'Compound Interest', panel: 'lgci-input-panel', required: ids, setup: setup });
    function setup(root, el) {
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

  /* ==================================================================
     Savings goal calculator  [savings-goal]
     ================================================================== */
  module('savings-goal', function () {
    (function (root, factory) {
      'use strict';
      const api = factory();
      if (typeof module === 'object' && module.exports) module.exports = api;
      root.LyfeTools = root.LyfeTools || {};
      root.LyfeTools.savingsGoal = api;
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
      function boot() {
        const $ = (id) => document.getElementById('sg-' + id);
        const form = $('form');
        const engine = window.LyfeTools && window.LyfeTools.savingsGoal;
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
        if (!form || form.dataset.ready || !engine || required.some((id) => !$(id))) return;
        form.dataset.ready = 'true';
        const fieldIds = ['goal', 'initial', 'years', 'months', 'monthly', 'rate'];
        const touched = new Set();
        const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
        const compact = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1 });
        const money = (value) => currency.format(value);
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
            if (raw.startsWith('.')) raw = '0' + raw;
            if (!raw && blankIsZero) return 0;
            const pattern = kind === 'money' ? /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/ : kind === 'whole' ? /^\d+$/ : /^\d+(?:\.\d{1,4})?$/;
            const value = pattern.test(raw) ? Number(raw.replace(/,/g, '')) : NaN;
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
      LG.ready(boot);
    })();
  });

  /* ==================================================================
     Emergency fund calculator  [emergency-fund]
     ================================================================== */
  module('emergency-fund', function () {
    LG.ready(function () {
      var $ = function (id) {
        return document.getElementById(id);
      };
      var monthlyEl = $('ef-monthly');
      var savedEl = $('ef-saved');
      if (!monthlyEl || !savedEl || !$('ef-target')) return;
      if (monthlyEl.dataset.lgReady === 'true') return;
      monthlyEl.dataset.lgReady = 'true';

      var gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
      var money = function (n) {
        return gbp.format(Math.round(n));
      };
      var num = function (v) {
        var n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
        return isFinite(n) && n > 0 ? n : 0;
      };
      var months = function (n) {
        return n === 1 ? '1 month' : n + ' months';
      };
      var parts = document.querySelectorAll('.ef-part');

      function selectedMonths() {
        var r = document.querySelector('input[name="ef-months"]:checked');
        return r ? parseInt(r.value, 10) : 3;
      }

      function sumParts() {
        var total = 0,
          any = false;
        parts.forEach(function (p) {
          if (p.value.trim() !== '') {
            any = true;
            total += num(p.value);
          }
        });
        if (any) monthlyEl.value = total ? total.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '';
      }

      function render() {
        var monthly = num(monthlyEl.value);
        var saved = num(savedEl.value);
        var m = selectedMonths();

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

      document.querySelectorAll('.ef-money').forEach(function (el) {
        el.addEventListener('input', function () {
          if (el.classList.contains('ef-part')) sumParts();
          render();
        });
        el.addEventListener('blur', function () {
          if (el.value.trim() === '') return;
          var n = num(el.value);
          el.value = n ? n.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '';
        });
      });

      document.querySelectorAll('input[name="ef-months"]').forEach(function (r) {
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
    });
  });

  /* ==================================================================
     Loan repayment calculator  [loan-repayment]
     ================================================================== */
  module('loan-repayment', function () {
    'use strict';
    const fieldIds = ['lglc-amount', 'lglc-rate', 'lglc-term'];
    LG.start({
      name: 'Loan Calculator',
      panel: 'lglc-input-panel',
      required: [...fieldIds, 'lglc-monthly', 'lglc-principal', 'lglc-interest', 'lglc-total'],
      setup: setup,
    });
    function setup(root, get) {
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

  /* ==================================================================
     Pro rata salary calculator  [pro-rata-salary]
     ================================================================== */
  module('pro-rata-salary', function () {
    // 2026/27 rates: England, Wales and Northern Ireland
    var R = {
      personalAllowance: LG.ukTax.rates.personalAllowance,
      taperStart: LG.ukTax.rates.taperStart,
      basicBand: LG.ukTax.rates.basicBand,
      additionalThreshold: LG.ukTax.rates.additionalThreshold,
      niPrimary: LG.ukTax.rates.niPrimary,
      niUpper: LG.ukTax.rates.niUpper,
      higherRateStart: LG.ukTax.rates.personalAllowance + LG.ukTax.rates.basicBand,
      hicbcStart: 60000,
      hicbcEnd: 80000,
      aeTrigger: 10000,
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

    LG.ready(function () {
      var $ = function (id) {
        return document.getElementById(id);
      };
      if (!$('pr-salary') || !$('pr-result')) return;
      if ($('pr-result').dataset.lgReady === 'true') return;
      $('pr-result').dataset.lgReady = 'true';

      var gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
      var money = function (n) {
        return gbp.format(Math.round(n));
      };
      var num = function (v) {
        var n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
        return isFinite(n) && n > 0 ? n : 0;
      };
      var dec = function (n) {
        var r = Math.round(n * 10) / 10;
        return r % 1 === 0 ? String(r) : r.toFixed(1);
      };
      var pctVal = function (id, fallback) {
        var v = $(id).value.trim();
        if (v === '') return fallback;
        var n = parseFloat(v.replace(/[^0-9.]/g, ''));
        return isFinite(n) ? Math.min(Math.max(n, 0), 100) : fallback;
      };
      var defaults = { hours: { full: '37.5', yours: '22.5' }, days: { full: '5', yours: '3' } };

      function mode() {
        var r = document.querySelector('input[name="pr-mode"]:checked');
        return r ? r.value : 'hours';
      }

      function setInvalid(id, bad) {
        var c = $(id).closest('.lg-control');
        if (c) c.setAttribute('data-invalid', bad ? 'true' : 'false');
        $(id).setAttribute('aria-invalid', bad ? 'true' : 'false');
      }

      function render() {
        var m = mode();
        var input = {
          salary: num($('pr-salary').value),
          fullTime: num($('pr-full').value),
          yours: num($('pr-yours').value),
          eePct: pctVal('pr-ee', 5),
          erPct: pctVal('pr-er', 3),
          holiday: num($('pr-holiday').value) || 28,
        };
        var max = m === 'hours' ? 168 : 7;
        var tooMany = input.yours > input.fullTime && input.fullTime > 0;
        var fullTooBig = input.fullTime > max;
        setInvalid('pr-yours', tooMany);
        setInvalid('pr-full', fullTooBig);
        $('pr-error').hidden = !(tooMany || fullTooBig);
        $('pr-error').textContent = fullTooBig
          ? 'A full-time week can\u2019t be more than ' + max + ' ' + m + '.'
          : 'Your ' + m + ' can\u2019t be more than the full-time week. Use the full-time salary if you work full time.';

        if (!input.salary || !input.fullTime || !input.yours || tooMany || fullTooBig) {
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
        document.querySelectorAll('.pr-unit').forEach(function (el) {
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

      document.querySelectorAll('.pr-input').forEach(function (el) {
        el.addEventListener('input', render);
      });
      $('pr-salary').addEventListener('blur', function () {
        if ($('pr-salary').value.trim() === '') return;
        var n = num($('pr-salary').value);
        $('pr-salary').value = n ? n.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '';
      });
      document.querySelectorAll('input[name="pr-mode"]').forEach(function (r) {
        r.addEventListener('change', function () {
          applyMode(true);
          render();
        });
      });

      applyMode(false);
      render();
    });
  });

  /* ==================================================================
     Average salary by age  [salary-by-age]
     ================================================================== */
  module('salary-by-age', function () {
    // ONS Annual Survey of Hours and Earnings (ASHE) 2025 provisional, Table 6.7a, UK.
    // Gross annual pay, full-time employees on adult rates in the same job for more than a year.
    // Order: median, mean, p10, p20, p25, p30, p40, p60, p70, p75, p80, p90
    var DATA = {
      ages: ['18-21', '22-29', '30-39', '40-49', '50-59', '60+'],
      all: {
        all: [39039, 48512, 23990, 27495, 29262, 30935, 34779, 44203, 50115, 54009, 59083, 76903],
        '18-21': [23596, 24394, 14617, 17961, 19105, 20177, 21865, 24821, 26561, 27571, 28675, 32939],
        '22-29': [32347, 35760, 22758, 25372, 26429, 27510, 29970, 35159, 38558, 40850, 43521, 52197],
        '30-39': [40668, 48421, 25041, 29000, 30717, 32610, 36483, 45284, 50797, 54620, 59109, 75041],
        '40-49': [44244, 54591, 25338, 29726, 31858, 34095, 38871, 49672, 56343, 60919, 66625, 88658],
        '50-59': [41866, 53349, 24757, 28588, 30283, 32417, 36970, 47677, 53868, 58409, 64282, 85226],
        '60+': [36467, 46794, 23318, 26342, 27944, 29407, 32600, 40996, 46951, 50572, 55652, 74677],
      },
      male: {
        all: [41832, 52817, 25350, 29266, 31049, 33010, 37193, 47303, 53882, 58343, 64208, 84107],
        '18-21': [24107, 25848, 15731, 18662, 19825, 20800, 22784, 25681, 27419, 28553, 29836, 34006],
        '22-29': [33400, 37527, 23619, 26124, 27223, 28576, 30900, 36308, 40232, 42665, 45690, 54658],
        '30-39': [42899, 51919, 26345, 30411, 32350, 34267, 38518, 47993, 54298, 58361, 63323, 80241],
        '40-49': [47313, 59287, 27150, 32119, 34500, 36988, 41960, 53101, 60764, 65836, 72132, 95455],
        '50-59': [45608, 59793, 26599, 30994, 33358, 35636, 40126, 51263, 59024, 64399, 71527, 95045],
        '60+': [39348, 50390, 24808, 28344, 30000, 31500, 35072, 44167, 50277, 54499, 60000, 80609],
      },
      female: {
        all: [35670, 42636, 22463, 25733, 27157, 28738, 31867, 40013, 45605, 48795, 52580, 65994],
        '18-21': [22464, 22104, 13209, 16709, 17968, 19083, 20878, 23937, 25072, 25857, 26831, 30000],
        '22-29': [31261, 33812, 21658, 24626, 25599, 26552, 28834, 33981, 37042, 38850, 41280, 48839],
        '30-39': [37745, 43600, 23452, 27200, 28990, 30470, 34034, 42100, 46749, 49727, 53390, 66064],
        '40-49': [39737, 48203, 23538, 27097, 29094, 30849, 35076, 45373, 50968, 54464, 59373, 76321],
        '50-59': [37024, 44456, 23099, 26106, 27575, 29117, 32534, 42324, 48231, 51335, 55480, 70335],
        '60+': [31583, 40184, 21312, 24034, 25176, 26309, 28753, 35473, 40320, 43971, 47396, 60970],
      },
    };

    var PCTS = [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90];
    var CHART = { min: 10000, max: 100000 };
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

    LG.ready(function () {
      var $ = function (id) {
        return document.getElementById(id);
      };
      if (!$('sa-salary') || !$('sa-result')) return;
      if ($('sa-result').dataset.lgReady === 'true') return;
      $('sa-result').dataset.lgReady = 'true';

      var gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
      var money = function (n) {
        return gbp.format(Math.round(n));
      };
      var short = function (n) {
        var k = n / 1000;
        return '\u00A3' + (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
      };
      var num = function (v) {
        var n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
        return isFinite(n) && n > 0 ? n : 0;
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
        var r = document.querySelector('input[name="' + name + '"]:checked');
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
          var row = document.querySelector('.sa-row[data-age="' + a + '"]');
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
          var tr = document.querySelector('.sa-table tr[data-age="' + a + '"]');
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
        var salary = num($('sa-salary').value);
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
        var target = document.querySelector('input[name="' + other + '"][value="' + v + '"]');
        if (target) target.checked = true;
        if (source === 'sa-who2') {
          var main = document.querySelector('input[name="sa-who"][value="' + v + '"]');
          if (main) main.checked = true;
        }
      }

      $('sa-salary').addEventListener('input', render);
      $('sa-salary').addEventListener('blur', function () {
        var el = $('sa-salary');
        if (el.value.trim() === '') return;
        var n = num(el.value);
        el.value = n ? n.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '';
      });
      document.querySelectorAll('input[name="sa-age"]').forEach(function (r) {
        r.addEventListener('change', render);
      });
      ['sa-who', 'sa-who2'].forEach(function (name) {
        document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
          r.addEventListener('change', function () {
            sync(name);
            render();
          });
        });
      });

      render();
    });
  });

  /* ==================================================================
     Mortgage calculator  [mortgage]
     ================================================================== */
  module('mortgage', function () {
    'use strict';
    const fieldIds = ['lgmc-price', 'lgmc-deposit', 'lgmc-rate', 'lgmc-term'];
    LG.start({
      name: 'Mortgage Calculator',
      panel: 'lgmc-input-panel',
      required: [...fieldIds, 'lgmc-monthly', 'lgmc-loan', 'lgmc-ltv', 'lgmc-interest', 'lgmc-total'],
      setup: setup,
    });
    function setup(root, get) {
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
        const selected = document.querySelector('input[name="mortgage-type"]:checked');
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
      document.querySelectorAll('input[name="mortgage-type"]').forEach((el) => el.addEventListener('change', update));
      update();
    }
  });

  /* ==================================================================
     Debt-to-income calculator  [debt-to-income]
     ================================================================== */
  module('debt-to-income', function () {
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
      const get = (id) => document.getElementById('lgdti-' + id);
      const money = LG.money;
      const pct = (n) => n.toFixed(1) + '%';
      const write = (id, value) => {
        const el = get(id);
        if (el) el.textContent = value;
      };
      const period = () => {
        const selected = document.querySelector('input[name="lgdti-period"]:checked');
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
})(window, document);
