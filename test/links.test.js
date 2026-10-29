// The "Use these figures" links in the markup are the ones in markup/links.js
// (written by scripts/links.js), and each pair has figures to send.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { stale } = require('../scripts/links');
const LINKS = require('../markup/links');
const { ROOT } = require('./page');

test('the markup has the links in markup/links.js', () => {
  assert.deepEqual(stale().map((m) => m.key), [], 'out of date: run node scripts/links.js');
});

test('every link has figures to send (src/v2/handoff.js)', () => {
  const handoff = fs.readFileSync(path.join(ROOT, 'src/v2/handoff.js'), 'utf8');
  const send = handoff.slice(handoff.indexOf('var SEND = {'), handoff.indexOf('LG.handoffs = SEND;'));
  for (const [from, links] of Object.entries(LINKS)) {
    const block = send.slice(send.indexOf("'" + from + "': {") > -1 ? send.indexOf("'" + from + "': {") : send.indexOf(from + ': {'));
    for (const { to } of links) assert.ok(new RegExp("'" + to + "': function").test(block.slice(0, block.indexOf('\n    },') + 1)), from + ' > ' + to);
  }
});
