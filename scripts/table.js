#!/usr/bin/env node
// Turns a CSV (as saved from a spreadsheet) into the rich-text embed for a
// table (docs/content-blocks.md), ready to paste into Webflow. The first row
// is the column headings and the first column the row headings.
//   node scripts/table.js prices.csv --caption "Stamp duty in England" [--note "Rates from 1 April 2025."] [--text]
// --text: a table of words, every column left-aligned (lg-table-text).
'use strict';
const fs = require('fs');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Rows of cells. Handles quoted cells with commas, quotes ("") and line breaks.
function parse(csv) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') cell += text[++i];
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) rows.push(row.concat(cell));
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some(Boolean));
}

function table(csv, { caption, note, text } = {}) {
  const rows = parse(csv);
  if (rows.length < 2) throw new Error('The CSV needs a heading row and at least one row of figures.');
  if (!caption) throw new Error('Give the table a caption (--caption): it says what the table shows.');
  const width = rows[0].length;
  const bad = rows.findIndex((r) => r.length !== width);
  if (bad > 0) throw new Error(`Row ${bad + 1} has ${rows[bad].length} cells, but the heading row has ${width}.`);
  const out = [`<div class="lg-table${text ? ' lg-table-text' : ''}">`, '  <table>', `    <caption>${esc(caption)}</caption>`, '    <thead>'];
  out.push('      <tr>' + rows[0].map((h) => `<th scope="col">${esc(h)}</th>`).join('') + '</tr>', '    </thead>', '    <tbody>');
  for (const r of rows.slice(1)) out.push('      <tr>' + r.map((v, i) => (i ? `<td>${esc(v)}</td>` : `<th scope="row">${esc(v)}</th>`)).join('') + '</tr>');
  out.push('    </tbody>', '  </table>');
  if (note) out.push(`  <p>${esc(note)}</p>`);
  out.push('</div>');
  return out.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf('--' + name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const caption = opt('caption');
  const note = opt('note');
  const text = args.includes('--text');
  const file = args.filter((a) => a !== '--text')[0];
  if (!file) {
    console.error('Usage: node scripts/table.js <file.csv> --caption "What the table shows" [--note "Where the figures come from"] [--text]');
    process.exit(1);
  }
  try {
    console.log(table(fs.readFileSync(file, 'utf8'), { caption, note, text }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { parse, table };
