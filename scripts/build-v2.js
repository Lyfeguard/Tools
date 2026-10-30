#!/usr/bin/env node
// Build the <lg-calculator> web component (dist/v2/):
//   <key>.min.js          one calculator: the component, the shared code and
//                         that calculator's module, with only its own styles
//   <key>.min.css         the same styles for the page, so the markup looks
//                         right before the script runs and without JavaScript
//   lg-calculator.min.js  every calculator in one file (pages with several)
// Nothing is written twice: the tax core and each calculator's module are
// copied from src/lg-calc.js (between @v2: marker comments) and the styles
// from the shared components section of src/lg-calc.css. The markup stays in
// the page (markup/<key>.html in the CMS), so it's indexed as it always was.
// Run through npm run build (scripts/build.sh), which minifies the scripts.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { parse, subset, usage } = require('./css-subset');
const { inline } = require('./data');
const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Calculators in the component. Each key's module sits between
// /* @v2:<key>-start */ and /* @v2:<key>-end */ in src/lg-calc.js.
const CALCULATORS = ['net-worth', 'inheritance-tax', 'compound-interest', 'savings-goal', 'emergency-fund', 'loan-repayment', 'pro-rata-salary', 'salary-by-age', 'mortgage', 'debt-to-income', 'retirement-income', 'take-home-pay', 'stamp-duty', 'lbtt', 'land-transaction-tax'];
// Code some calculators share, between its own @v2: markers, built in before their modules.
const USES = { 'stamp-duty': ['property-tax'], lbtt: ['property-tax'], 'land-transaction-tax': ['property-tax'] };
// The blocks a set of calculators needs, each once, shared code first.
const blocks = (keys) => [...new Set(keys.flatMap((key) => [...(USES[key] || []), key]))];
const block = (js, name) => between(js, '/* @v2:' + name + '-start */', '/* @v2:' + name + '-end */', 'src/lg-calc.js');

function between(text, start, end, file) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + 1);
  if (from < 0 || to < 0) throw new Error(file + ': can\'t find "' + start + '" ... "' + end + '"');
  return text.slice(from, to);
}

// Non-ASCII characters as \uXXXX, so the output stays ASCII-only.
const ascii = (s) => s.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
const literal = (value) => ascii(JSON.stringify(value));
// In CSS the escape is a backslash, the hex code and a space (\2192 ).
const cssAscii = (s) => s.replace(/[^\x00-\x7f]/g, (c) => '\\' + c.charCodeAt(0).toString(16).toUpperCase() + ' ');

// Classes and ids a calculator can use: in its markup, its module, the
// shared component code, and the CMS template's wrappers and rich text.
const SHARED = ['src/v2/shared.js', 'src/v2/download.js', 'src/v2/track.js', 'src/v2/handoff.js', 'src/v2/element.js'];
// lg-faq-table: tables in the page's rich text (Extended Content and FAQs).
const TEMPLATE = 'lg-calc-wrap lg-calc-markup w-richtext w-embed lg-heading-wrap calculator lg-faq-table';
function usedBy(keys) {
  const js = read('src/lg-calc.js');
  const corpus = [TEMPLATE, ...SHARED.map(read), between(js, '/* @v2:core-start', '/* @v2:core-end */', 'src/lg-calc.js')];
  for (const key of keys) corpus.push(read('markup/' + key + '.html'));
  for (const name of blocks(keys)) corpus.push(block(js, name));
  return usage(corpus.join('\n'));
}
function only(css, keys) {
  return keys.length === CALCULATORS.length ? css : subset(parse(css), usedBy(keys));
}

function minify(css) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-v2-'));
  const src = path.join(tmp, 'in.css');
  const out = path.join(tmp, 'out.css');
  fs.writeFileSync(src, css);
  execFileSync('npx', ['--yes', '-p', 'csso-cli@4.0.2', 'csso', src, '--no-restructure', '-o', out], { stdio: 'inherit' });
  // csso writes transparent backgrounds as "0 0"; keep the explicit keyword.
  const min = fs.readFileSync(out, 'utf8').replace(/background:0 0([;}])/g, 'background:transparent$1');
  fs.rmSync(tmp, { recursive: true, force: true });
  return min.trim();
}

// The calculator's styles for the page: the tokens, its rules and the rules
// for the page around it (<lg-calculator> and the CMS template).
function pageStyles(keys) {
  return minify(only(read('src/lg-calc.css'), keys));
}

function styles(keys) {
  const css = read('src/lg-calc.css');
  // The design tokens move from :root to the component's host element.
  const tokens = between(css, ':root {', '}', 'src/lg-calc.css').slice(':root {'.length);
  // Every calculator's styles: everything after the tokens, up to the rules
  // for the page around the calculators (<lg-calculator> and the CMS template).
  const calculators = between(css, ':root {', '/* ------------------------------------------------------------------\n   v2: <lg-calculator>', 'src/lg-calc.css');
  const rest = calculators.slice(calculators.indexOf('}') + 1);
  const host = [
    '/* The component starts from browser defaults: nothing inherits in from the page. */',
    ':host {',
    '  all: initial !important;',
    '  display: block !important;',
    '  width: 100%;',
    tokens.trim(),
    '}',
    ':host([hidden]) {',
    '  display: none !important;',
    '}',
    '/* What the site\'s base styles give the calculators on the page, so each looks as it does today. */',
    'button, input, select, textarea {',
    '  font: inherit;',
    '  color: inherit;',
    '  margin: 0;',
    '}',
    'input {',
    '  line-height: normal;',
    '}',
    '.lg-calc-classic {',
    '  font-family: var(--lg-font-body);',
    '  font-size: 16px;',
    '  line-height: 1.6em; /* a fixed 25.6px, inherited as is, as on the site */',
    '}',
    '*, *::before, *::after {',
    '  box-sizing: border-box;',
    '}',
    'p {',
    '  margin-top: 0;',
    '  margin-bottom: 0;',
    '  line-height: 1.6em;',
    '}',
    'label {',
    '  margin-bottom: 5px;',
    '}',
    'summary {',
    '  display: block;',
    '}',
    'a {',
    '  font-family: var(--lg-font-heading);',
    '  font-weight: 500;',
    '}',
    '',
  ].join('\n');
  return minify(host + only(rest, keys) + read('src/v2/download.css'));
}

function script(keys) {
  const js = inline(read('src/lg-calc.js'));
  const version = /LG\.version = '([^']+)'/.exec(read('src/v2/prelude.js'))[1];
  const modules = blocks(keys).map((name) => block(js, name));
  return [
    '/*!',
    ' * Lyfeguard calculators | ' + (keys.length === 1 ? keys[0] : 'lg-calculator') + '.js | v' + version,
    ' * The <lg-calculator key="..."> web component: each calculator in its own',
    ' * shadow root, so the site\'s CSS can\'t change it. Built by scripts/build-v2.js.',
    ' */',
    '(function (window, document) {',
    "  'use strict';",
    '  var STYLES = ' + literal(styles(keys)) + ';',
    read('src/v2/prelude.js'),
    between(js, '/* @v2:core-start', '/* @v2:core-end */', 'src/lg-calc.js'),
    read('src/v2/shared.js'),
    ...modules,
    read('src/v2/download.js'),
    read('src/v2/track.js'),
    read('src/v2/handoff.js'),
    read('src/v2/element.js'),
    '})(window, document);',
    '',
  ].join('\n');
}

// Scripts go to the folder given (for minifying), stylesheets to dist/v2.
const out = process.argv[2] || path.join(ROOT, 'dist/v2');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'dist/v2'), { recursive: true });
fs.writeFileSync(path.join(out, 'lg-calculator.js'), ascii(script(CALCULATORS)));
for (const key of CALCULATORS) {
  fs.writeFileSync(path.join(out, key + '.js'), ascii(script([key])));
  fs.writeFileSync(path.join(ROOT, 'dist/v2', key + '.min.css'), cssAscii(pageStyles([key])) + '\n');
}
console.log('Wrote lg-calculator.js and ' + CALCULATORS.length + ' calculators in ' + path.relative(process.cwd(), out));
