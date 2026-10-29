#!/usr/bin/env node
// The Calculator markup ("embed") field for each Tools CMS item, built from
// markup/<key>.html, so no one pastes markup by hand. Items are listed in
// webflow/cms-items.json. The field is written through the Webflow CMS API
// (staged), then published with the site.
//
//   node scripts/webflow-markup.js field <key>     the field value, as JSON
//   node scripts/webflow-markup.js check <file>    compare with a saved
//        list_collection_items response; lists the items that are out of date
//        or whose Component key field isn't their calculator's key
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'webflow/cms-items.json'), 'utf8'));

// A Rich Text field holds custom code as one embed block.
function field(key) {
  const markup = fs.readFileSync(path.join(ROOT, 'markup', key + '.html'), 'utf8').trim();
  return "<div data-rt-embed-type='true'>" + markup + '</div>';
}

// Webflow stores the HTML with void elements closed (<input ... />), spaces
// in style attributes, before ">" and around text in tags; none of
// them changes the page.
const normal = (html) =>
  html
    .replace(/\s*\/>/g, '>')
    .replace(/\s+>/g, '>')
    .replace(/style="([^"]*)"/g, (m, css) => 'style="' + css.replace(/\s*([:;])\s*/g, '$1').replace(/;$/, '') + '"')
    .replace(/\s+/g, ' ')
    .replace(/> | </g, (m) => m.trim())
    .trim();

const [command, arg] = process.argv.slice(2);
if (command === 'field' && CMS.items[arg]) {
  process.stdout.write(JSON.stringify(field(arg)) + '\n');
} else if (command === 'check' && arg) {
  const text = fs.readFileSync(arg, 'utf8');
  const data = JSON.parse(text.slice(text.indexOf('{')));
  const items = (data.result || data).items;
  let stale = 0;
  for (const [key, { id }] of Object.entries(CMS.items)) {
    const item = items.find((i) => i.id === id);
    const current = item ? item.fieldData[CMS.field] || '' : null;
    const ok = current !== null && normal(current) === normal(field(key));
    // The template head loads dist/v2/<Component key>.min.js and .min.css.
    const keyed = item && item.fieldData['component-key'] === key;
    if (!ok || !keyed) stale++;
    console.log((ok ? (keyed ? 'up to date  ' : 'key not set ') : current === null ? 'not found   ' : 'out of date ') + key);
  }
  process.exitCode = stale ? 1 : 0;
} else {
  console.error('Usage: node scripts/webflow-markup.js field <key> | check <list_collection_items.json>');
  process.exitCode = 2;
}
