// The CMS sync (scripts/webflow-markup.js sync), against a fake Webflow API:
// it writes only what differs, sets the Release field the template head
// loads the calculators from, and never changes an item's draft status.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { field, sync } = require('../scripts/webflow-markup');
const CMS = require('../webflow/cms-items.json');

let calls;
let cms;
beforeEach(() => {
  calls = [];
  // Everything up to date at v2.0.0, except the mortgage markup.
  cms = Object.entries(CMS.items).map(([key, { id }]) => ({ id, fieldData: { embed: key === 'mortgage' ? '<p>old</p>' : field(key), 'component-key': key, release: 'v2.0.0' } }));
  process.env.WEBFLOW_TOKEN = 'test';
  global.fetch = async (url, opts) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, url, body });
    return { ok: true, json: async () => (opts.method === 'GET' ? { items: cms } : {}) };
  };
  console.log = () => {};
});
const patched = () => calls.filter((c) => c.method === 'PATCH').flatMap((c) => c.body.items);
const idOf = (key) => CMS.items[key].id;

test('without a release: only the item whose markup differs', async () => {
  await sync();
  assert.deepEqual(patched().map((i) => i.id), [idOf('mortgage')]);
  assert.equal('release' in patched()[0].fieldData, false);
});

test('a release: every item gets its tag, staged, draft status untouched', async () => {
  await sync({ release: 'v2.0.1' });
  const items = patched();
  assert.equal(items.length, Object.keys(CMS.items).length);
  for (const item of items) {
    assert.equal(item.fieldData.release, 'v2.0.1');
    assert.equal('isDraft' in item, false);
  }
  assert.ok(calls.every((c) => !/\/live|\/publish/.test(c.url)), 'staged only, never published');
});

test('--only: a release on one calculator first', async () => {
  await sync({ release: 'v2.0.1', only: ['take-home-pay'] });
  assert.deepEqual(patched().map((i) => i.id), [idOf('take-home-pay')]);
});

test('a dry run writes nothing; bad tags and keys are refused', async () => {
  await sync({ release: 'v2.0.1', dryRun: true });
  assert.deepEqual(patched(), []);
  await assert.rejects(sync({ release: '2.0.1' }), /Not a release tag/);
  await assert.rejects(sync({ release: 'v2.0.1', only: ['nope'] }), /No calculator nope/);
});
