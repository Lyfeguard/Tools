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
//   node scripts/webflow-markup.js sync [--release v2.0.1] [--only key,key] [--dry-run]
//        write the markup field and Component key (and with --release, the
//        Release field the template head loads that version from) to every
//        item that differs, as staged changes (they go live with the next
//        publish). --only limits it to some calculators (try a release on
//        one first). Needs WEBFLOW_TOKEN (CMS read and write); run by the
//        "Release to Webflow" workflow.
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

// What differs between an item in the CMS and the repo.
function differs(item, key, release) {
  const current = item ? item.fieldData[CMS.field] || '' : null;
  return {
    markup: current === null || normal(current) !== normal(field(key)),
    key: !item || item.fieldData['component-key'] !== key,
    release: !!release && (!item || item.fieldData.release !== release),
  };
}

async function sync({ dryRun = false, release = null, only = null } = {}) {
  if (release && !/^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(release)) throw new Error('Not a release tag: ' + release);
  if (only) only.forEach((key) => {
    if (!CMS.items[key]) throw new Error('No calculator ' + key);
  });
  const token = process.env.WEBFLOW_TOKEN;
  if (!token) throw new Error('WEBFLOW_TOKEN is not set');
  const api = async (method, url, body) => {
    const res = await fetch('https://api.webflow.com/v2' + url, {
      method,
      headers: { authorization: 'Bearer ' + token, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(method + ' ' + url + ' -> ' + res.status + ': ' + (await res.text()).slice(0, 300));
    return res.json();
  };
  const items = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api('GET', '/collections/' + CMS.collection + '/items?limit=100&offset=' + offset);
    items.push(...page.items);
    if (page.items.length < 100) break;
  }
  const updates = [];
  const lines = [];
  for (const [key, { id }] of Object.entries(CMS.items)) {
    if (only && !only.includes(key)) continue;
    const item = items.find((i) => i.id === id);
    if (!item) throw new Error(key + ': no CMS item ' + id);
    const d = differs(item, key, release);
    const what = [d.markup && 'markup', d.key && 'Component key', d.release && 'Release ' + release].filter(Boolean);
    lines.push((what.length ? (dryRun ? 'would update ' : 'updated      ') + what.join(', ') + ': ' : 'up to date   ') + key);
    // Draft or ready stays as it is: isDraft isn't sent.
    const fieldData = { [CMS.field]: field(key), 'component-key': key };
    if (release) fieldData.release = release;
    if (what.length) updates.push({ id, fieldData });
  }
  if (updates.length && !dryRun) await api('PATCH', '/collections/' + CMS.collection + '/items', { items: updates });
  console.log(lines.join('\n'));
  console.log(updates.length ? (dryRun ? 'Dry run: nothing written.' : 'Staged: goes live with the next publish.') : 'Every item is up to date.');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + lines.join('\n') + '\n```\n');
}

const option = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
};
const [command, arg] = process.argv.slice(2);
if (require.main !== module) {
  // Required by the tests.
} else if (command === 'sync') {
  const only = option('--only');
  sync({ dryRun: process.argv.includes('--dry-run'), release: option('--release'), only: only ? only.split(',').map((k) => k.trim()).filter(Boolean) : null }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
} else if (command === 'field' && CMS.items[arg]) {
  process.stdout.write(JSON.stringify(field(arg)) + '\n');
} else if (command === 'check' && arg) {
  const text = fs.readFileSync(arg, 'utf8');
  const data = JSON.parse(text.slice(text.indexOf('{')));
  const items = (data.result || data).items;
  let stale = 0;
  for (const [key, { id }] of Object.entries(CMS.items)) {
    const item = items.find((i) => i.id === id);
    const current = item ? item.fieldData[CMS.field] || '' : null;
    // The template head loads dist/v2/<Component key>.min.js and .min.css.
    const d = differs(item, key);
    const ok = current !== null && !d.markup;
    const keyed = !d.key;
    if (!ok || !keyed) stale++;
    console.log((ok ? (keyed ? 'up to date  ' : 'key not set ') : current === null ? 'not found   ' : 'out of date ') + key);
  }
  process.exitCode = stale ? 1 : 0;
} else {
  console.error('Usage: node scripts/webflow-markup.js field <key> | check <list_collection_items.json> | sync [--release vX.Y.Z] [--only key,key] [--dry-run]');
  process.exitCode = 2;
}
module.exports = { field, normal, differs, sync };
