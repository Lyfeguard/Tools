#!/usr/bin/env node
// Build dist/v2/lg-calculator.min.js: the <lg-calculator> web component.
// Nothing is written twice: the tax core and each calculator's module are
// copied from src/lg-calc.js (between @v2: marker comments) and the styles
// from the shared components section of src/lg-calc.css. The markup stays in
// the page (markup/<key>.html in the CMS), so it's indexed as it always was.
// Run through npm run build (scripts/build.sh), which minifies it.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Calculators in the component. Each key's module sits between
// /* @v2:<key>-start */ and /* @v2:<key>-end */ in src/lg-calc.js.
const CALCULATORS = ['take-home-pay'];

function between(text, start, end, file) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + 1);
  if (from < 0 || to < 0) throw new Error(file + ': can\'t find "' + start + '" ... "' + end + '"');
  return text.slice(from, to);
}

// Non-ASCII characters as \uXXXX, so the output stays ASCII-only.
const ascii = (s) => s.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
const literal = (value) => ascii(JSON.stringify(value));

function styles() {
  const css = read('src/lg-calc.css');
  // The design tokens move from :root to the component's host element.
  const tokens = between(css, ':root {', '}', 'src/lg-calc.css').slice(':root {'.length);
  const components = between(css, '/* ------------------------------------------------------------------\n   Shared components (.lg-calc)', '/* ------------------------------------------------------------------\n   CMS template: Rich Text wrapper resets', 'src/lg-calc.css');
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
    '/* Form controls take the calculator\'s font, as Webflow\'s base styles do on the page. */',
    'button, input, select, textarea {',
    '  font: inherit;',
    '  color: inherit;',
    '  margin: 0;',
    '}',
    '',
  ].join('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-v2-'));
  const src = path.join(tmp, 'in.css');
  const out = path.join(tmp, 'out.css');
  fs.writeFileSync(src, host + components);
  execFileSync('npx', ['--yes', '-p', 'csso-cli@4.0.2', 'csso', src, '--no-restructure', '-o', out], { stdio: 'inherit' });
  // csso writes transparent backgrounds as "0 0"; keep the explicit keyword.
  const min = fs.readFileSync(out, 'utf8').replace(/background:0 0([;}])/g, 'background:transparent$1');
  fs.rmSync(tmp, { recursive: true, force: true });
  return min.trim();
}

function script() {
  const js = read('src/lg-calc.js');
  const version = /LG\.version = '([^']+)'/.exec(read('src/v2/prelude.js'))[1];
  const modules = CALCULATORS.map((key) => between(js, '/* @v2:' + key + '-start */', '/* @v2:' + key + '-end */', 'src/lg-calc.js'));
  return [
    '/*!',
    ' * Lyfeguard calculators | lg-calculator.js | v' + version,
    ' * The <lg-calculator key="..."> web component: each calculator in its own',
    ' * shadow root, so the site\'s CSS can\'t change it. Built by scripts/build-v2.js.',
    ' */',
    '(function (window, document) {',
    "  'use strict';",
    '  var STYLES = ' + literal(styles()) + ';',
    read('src/v2/prelude.js'),
    between(js, '/* @v2:core-start', '/* @v2:core-end */', 'src/lg-calc.js'),
    read('src/v2/shared.js'),
    ...modules,
    read('src/v2/element.js'),
    '})(window, document);',
    '',
  ].join('\n');
}

const out = process.argv[2] || path.join(ROOT, 'dist/v2/lg-calculator.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ascii(script()));
console.log('Wrote ' + path.relative(process.cwd(), out));
