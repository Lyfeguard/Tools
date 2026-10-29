#!/usr/bin/env node
// Puts the data files into the calculators' code: each /* @data:<name> */ null
// in src/lg-calc.js becomes the contents of data/<name>.json. Used by the
// builds of v1 (scripts/build.sh) and v2 (scripts/build-v2.js).
//   node scripts/data.js <in.js> <out.js>
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function inline(js) {
  return js.replace(/\/\* @data:([\w.-]+) \*\/ null/g, (m, name) => {
    const file = path.join(ROOT, 'data', name + '.json');
    if (!fs.existsSync(file)) throw new Error('No data file for @data:' + name + ' (data/' + name + '.json)');
    // Notes for people ($about, $source) stay in the file.
    return JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')), (key, value) => (key.startsWith('$') ? undefined : value));
  });
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  fs.writeFileSync(output, inline(fs.readFileSync(input, 'utf8')));
}
module.exports = { inline };
