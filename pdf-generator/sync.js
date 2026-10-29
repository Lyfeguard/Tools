#!/usr/bin/env node
// Keeps a branded PDF of every published guide in step with the live article.
//
//   node sync.js plan               list what needs (re)building; nothing is changed
//   node sync.js run                build, upload and link the PDFs that need it
//
// Options:
//   --dry-run            build the PDFs into out/ but don't upload or change the CMS
//   --force              rebuild every PDF, even if the content hasn't changed
//   --slug <slug>        only this item
//   --sweep              also delete superseded PDFs when nothing was rebuilt
//   --fixtures <dir>     read items from <dir>/items.json, faqs.json and authors.json
//                        instead of the API (implies --dry-run); for local previews
//
// Environment: WEBFLOW_TOKEN (CMS and Assets read/write) and PDF_LINK_MODE
// ("staged", the default, or "live"; see README.md).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config.json');
const { client } = require('./lib/webflow');
const { source, fingerprint, fileName, classify, assetParts, sweepable } = require('./lib/content');

const OUT = path.join(__dirname, 'out');
const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => args.includes('--' + name);
const option = (name) => {
  const i = args.indexOf('--' + name);
  return i > -1 ? args[i + 1] : undefined;
};
const fixtures = option('fixtures');
const dryRun = flag('dry-run') || Boolean(fixtures);
const onlySlug = option('slug');
const mode = (process.env.PDF_LINK_MODE || 'staged').trim().toLowerCase();

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
function summary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
const byId = (list) => new Map(list.map((x) => [x.id, x]));

async function load(api) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(fixtures, f), 'utf8'));
  const collections = [];
  for (const [key, cfg] of Object.entries(config.collections)) {
    if (!cfg.enabled) continue;
    if (fixtures) {
      const items = read('items.json');
      collections.push({ key, cfg, live: items, staged: byId(items) });
    } else {
      // Live (published) content only: drafts and unpublished edits never reach a PDF.
      const live = await api.listItems(cfg.id, { live: true });
      const staged = byId(await api.listItems(cfg.id));
      collections.push({ key, cfg, live, staged });
    }
  }
  const faqs = byId(fixtures ? read('faqs.json') : await api.listItems(config.faqCollection, { live: true }));
  const authors = byId(fixtures ? read('authors.json') : await api.listItems(config.authorCollection, { live: true }));
  return { collections, faqs, authors };
}

function plan({ collections, faqs, authors }) {
  const todo = [];
  const counts = { upToDate: 0, manual: 0 };
  for (const { key, cfg, live, staged } of collections) {
    for (const item of live) {
      const f = item.fieldData;
      if (item.isArchived || item.isDraft || (onlySlug && f.slug !== onlySlug)) continue;
      const stagedItem = staged.get(item.id);
      const current = (stagedItem && stagedItem.fieldData[config.pdfField]) || f[config.pdfField] || '';
      const state = classify(current, f.slug);
      if (state.kind === 'manual') {
        counts.manual++;
        console.log(`keep    ${key}/${f.slug} (bespoke PDF)`);
        continue;
      }
      const itemFaqs = (f.faqs || []).map((id) => faqs.get(id)).filter(Boolean);
      const author = authors.get(f['author-2']) || null;
      const hash = fingerprint(source(item, itemFaqs, author));
      if (!flag('force') && state.kind === 'generated' && state.hash === hash) {
        counts.upToDate++;
        continue;
      }
      todo.push({ key, cfg, item, stagedItem, faqs: itemFaqs, author, hash, reason: state.kind === 'none' ? 'new' : 'changed' });
      console.log(`build   ${key}/${f.slug} (${state.kind === 'none' ? 'no PDF yet' : 'content changed'})`);
    }
  }
  console.log(`${todo.length} to build, ${counts.upToDate} up to date, ${counts.manual} bespoke`);
  return { todo, counts };
}

async function linkPdf(api, entry, url) {
  const { cfg, item, stagedItem } = entry;
  const fieldData = { [config.pdfField]: url };
  const pending = stagedItem && Date.parse(stagedItem.lastUpdated) > Date.parse(stagedItem.lastPublished || 0) + 1000;
  if (mode === 'live' && !pending) {
    await api.updateItems(cfg.id, [{ id: item.id, fieldData }], { live: true });
    const staged = byId(await api.listItems(cfg.id)).get(item.id);
    if (staged && staged.fieldData[config.pdfField] !== url) {
      await api.updateItems(cfg.id, [{ id: item.id, fieldData }]);
      return 'live (staged copy also updated)';
    }
    return 'live';
  }
  await api.updateItems(cfg.id, [{ id: item.id, fieldData }]);
  return pending ? 'staged (item has unpublished edits)' : 'staged, goes live when published';
}

async function sweep(api, data, replaced) {
  const referenced = new Set();
  const slugs = new Set();
  for (const { live, staged } of data.collections) {
    for (const item of live) {
      slugs.add(item.fieldData.slug);
      const a = assetParts(item.fieldData[config.pdfField]);
      if (a) referenced.add(a.id);
    }
    for (const item of staged.values()) {
      const url = replaced.get(item.id) || item.fieldData[config.pdfField];
      const a = assetParts(url);
      if (a) referenced.add(a.id);
    }
  }
  const assets = await api.listAssets(config.site);
  const old = sweepable(assets, { slugs, referenced });
  for (const a of old) {
    await api.deleteAsset(a.id);
    console.log(`delete  ${assetParts(a.hostedUrl || a.url).name} (superseded)`);
  }
  return old.length;
}

async function main() {
  if (!['plan', 'run'].includes(command)) {
    console.error('Usage: node sync.js plan|run [--dry-run] [--force] [--slug <slug>] [--sweep] [--fixtures <dir>]');
    process.exit(2);
  }
  if (!fixtures && !process.env.WEBFLOW_TOKEN) {
    console.log('::warning::WEBFLOW_TOKEN is not set, so nothing was checked. Add it as a repository secret.');
    output('count', 0);
    return;
  }
  if (!['staged', 'live'].includes(mode)) throw new Error(`PDF_LINK_MODE must be "staged" or "live", not "${mode}"`);

  const api = fixtures ? null : client(process.env.WEBFLOW_TOKEN);
  const data = await load(api);
  const { todo, counts } = plan(data);
  output('count', todo.length);
  if (command === 'plan') return;

  const rows = [];
  const replaced = new Map();
  let failed = 0;
  if (todo.length) {
    const { chromium } = require('playwright');
    const { renderPdf } = require('./lib/render');
    const browser = await chromium.launch();
    try {
      for (const entry of todo) {
        const slug = entry.item.fieldData.slug;
        const name = fileName(slug, entry.hash);
        try {
          const pdf = await renderPdf(browser, { ...entry, site: config }, path.join(OUT, name));
          if (dryRun) {
            rows.push(`| ${slug} | built ${name} (dry run, not uploaded) |`);
            console.log(`built   ${name} (dry run)`);
            continue;
          }
          const md5 = crypto.createHash('md5').update(pdf).digest('hex');
          const asset = await api.uploadAsset(config.site, name, pdf, md5);
          const where = await linkPdf(api, entry, asset.url);
          replaced.set(entry.item.id, asset.url);
          rows.push(`| ${slug} | ${entry.reason}: ${name}, linked ${where} |`);
          console.log(`linked  ${slug} -> ${name} (${where})`);
        } catch (err) {
          failed++;
          rows.push(`| ${slug} | failed: ${err.message.slice(0, 120)} |`);
          console.log(`::error::${slug}: ${err.message}`);
        }
      }
    } finally {
      await browser.close();
    }
  }

  let deleted = 0;
  if (!dryRun && (replaced.size || flag('sweep'))) deleted = await sweep(api, data, replaced);

  summary([
    `### Guide PDFs${dryRun ? ' (dry run)' : ''}`,
    `${todo.length} built, ${counts.upToDate} up to date, ${counts.manual} bespoke kept, ${deleted} superseded files deleted. Link mode: ${mode}.`,
    ...(rows.length ? ['', '| Item | Result |', '| --- | --- |', ...rows] : []),
  ]);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  // An annotation, so the reason shows on the run's summary page as well as in the log.
  const why = [err && err.message, err && err.cause && err.cause.message].filter(Boolean).join(': ') || String(err);
  console.log(`::error::${why.replace(/\r?\n/g, ' ')}`);
  console.error(err);
  process.exit(1);
});
