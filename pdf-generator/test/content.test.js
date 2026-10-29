// Fingerprints, and which files the sync may replace or delete.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, fingerprint, fileName, classify, sweepable, reviewedLabel } = require('../lib/content');
const items = require('./fixtures/sample/items.json');
const faqs = require('./fixtures/sample/faqs.json');
const authors = require('./fixtures/sample/authors.json');

const SITE = 'https://cdn.prod.website-files.com/69d54ef24a10ef9131d434dc/';
const ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const item = items[0];

test('the fingerprint is stable and changes with the content', () => {
  const a = fingerprint(source(item, faqs, authors[0]));
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(fingerprint(source(item, faqs, authors[0])), a);
  const edited = structuredClone(item);
  edited.fieldData['post-body'] += '<p>New paragraph.</p>';
  assert.notEqual(fingerprint(source(edited, faqs, authors[0])), a);
  const faqEdit = structuredClone(faqs);
  faqEdit[0].fieldData['1-answer'] = 'Changed';
  assert.notEqual(fingerprint(source(item, faqEdit, authors[0])), a);
});

test('fields the PDF does not show leave the fingerprint alone', () => {
  const a = fingerprint(source(item, faqs, authors[0]));
  const other = structuredClone(item);
  other.fieldData['seo-title'] = 'A different SEO title';
  other.fieldData['pdf-download'] = SITE + ID + '_lyfeguard-sample-guide-12345678.pdf';
  other.lastUpdated = '2026-10-01T00:00:00.000Z';
  assert.equal(fingerprint(source(other, faqs, authors[0])), a);
});

test('classify: what the PDF field holds', () => {
  assert.deepEqual(classify('', 'sample-guide'), { kind: 'none' });
  assert.deepEqual(classify(SITE + ID + '_lyfeguard-sample-guide-0a1b2c3d.pdf', 'sample-guide'),
    { kind: 'generated', hash: '0a1b2c3d', assetId: ID });
  // The pilot's file name, without a fingerprint: replaced on the first run.
  assert.deepEqual(classify(SITE + ID + '_lyfeguard-sample-guide.pdf', 'sample-guide'),
    { kind: 'generated', hash: null, assetId: ID });
  // Bespoke files are never touched.
  assert.equal(classify(SITE + ID + '_lyfeguard-uk-life-admin-checklist.pdf', 'what-is-life-admin').kind, 'manual');
  assert.equal(classify(SITE + ID + '_lyfeguard-other-guide-0a1b2c3d.pdf', 'sample-guide').kind, 'manual');
  assert.equal(classify('https://example.com/file.pdf', 'sample-guide').kind, 'manual');
});

test('sweep: only old, unlinked files this tool wrote for a known guide', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const old = '2026-10-28T12:00:00Z';
  const asset = (id, name, createdOn = old) => ({ id, hostedUrl: SITE + id + '_' + name, createdOn });
  const ids = (n) => String(n).repeat(24).slice(0, 24);
  const assets = [
    asset(ids(1), 'lyfeguard-sample-guide-11111111.pdf'), // superseded: delete
    asset(ids(2), 'lyfeguard-sample-guide-22222222.pdf'), // still linked: keep
    asset(ids(3), 'lyfeguard-sample-guide-33333333.pdf', '2026-10-29T11:30:00Z'), // too new: keep
    asset(ids(4), 'lyfeguard-uk-life-admin-checklist.pdf'), // bespoke: keep
    asset(ids(5), 'lyfeguard-unknown-guide-44444444.pdf'), // not a known slug: keep
    asset(ids(6), 'lyfeguard-sample-guide.pdf'), // pilot file, unlinked: delete
    asset(ids(7), 'hero-image.jpg'), // anything else: keep
  ];
  const out = sweepable(assets, { slugs: new Set(['sample-guide', 'what-is-life-admin']), referenced: new Set([ids(2)]), now });
  assert.deepEqual(out.map((a) => a.id), [ids(1), ids(6)]);
});

test('file names and the review date', () => {
  assert.equal(fileName('sample-guide', '0a1b2c3d'), 'lyfeguard-sample-guide-0a1b2c3d.pdf');
  assert.equal(reviewedLabel(item), 'January 2026');
  const undated = structuredClone(item);
  undated.fieldData['post-body'] = '<p>No date here.</p>';
  assert.equal(reviewedLabel(undated), 'January 2026'); // from lastPublished
});
