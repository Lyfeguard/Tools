// The part of a stylesheet one calculator uses, so a page loads only its own
// styles. A selector is kept when every class and id in it is used by the
// calculator: written in its markup or its code, or built in its code from a
// quoted prefix ('lgdti-band-' + name). Rules without classes or ids
// (element and :root rules) are always kept. The tests check that each
// calculator looks exactly as it does with the whole stylesheet.
'use strict';

// The stylesheet as a list of rules: { prelude, body } for a style rule,
// { prelude, rules } for a grouping at-rule (@media, @container, @supports),
// { text } for anything kept whole (@keyframes, @font-face, @import).
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  function block() {
    // From just after "{" to the matching "}".
    let depth = 1;
    const start = i;
    while (i < css.length && depth) {
      const c = css[i++];
      if (c === '"' || c === "'") {
        while (i < css.length && css[i] !== c) i += css[i] === '\\' ? 2 : 1;
        i++;
      } else if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    return css.slice(start, i - 1);
  }
  function list(end) {
    const rules = [];
    while (i < end) {
      const open = css.indexOf('{', i);
      const semi = css.indexOf(';', i);
      if (open < 0 || open >= end) break;
      if (semi > -1 && semi < open && css.slice(i, semi).trim().startsWith('@')) {
        rules.push({ text: css.slice(i, semi + 1).trim() });
        i = semi + 1;
        continue;
      }
      const prelude = css.slice(i, open).trim();
      i = open + 1;
      const body = block();
      if (/^@(media|container|supports|layer)\b/.test(prelude)) {
        rules.push({ prelude, rules: parse(body) });
      } else if (prelude.startsWith('@')) {
        rules.push({ text: prelude + '{' + body + '}' });
      } else {
        rules.push({ prelude, body: body.trim() });
      }
    }
    return rules;
  }
  return list(css.length);
}

// Split "a, b:is(c, d)" at its top-level commas.
function selectors(prelude) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && !depth) {
      out.push(prelude.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(prelude.slice(start).trim());
  return out.filter(Boolean);
}

// Classes and ids in a selector, leaving out attribute selectors' values.
function tokens(selector) {
  const plain = selector.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"|'[^']*'/g, '');
  return (plain.match(/[.#]-?[_a-zA-Z][\w-]*/g) || []).map((t) => t.slice(1));
}

// Can the selector match anything in the calculator? Classes inside :not()
// only exclude, so they don't count; :is(), :where() and :has() need one
// of their alternatives; everything else must be used.
function matches(selector, used) {
  let rest = '';
  for (let i = 0; i < selector.length; ) {
    const m = /^:(not|is|where|has|matches)\(/.exec(selector.slice(i));
    if (!m) {
      rest += selector[i++];
      continue;
    }
    let depth = 1;
    let j = i + m[0].length;
    const start = j;
    while (j < selector.length && depth) {
      if (selector[j] === '(') depth++;
      else if (selector[j] === ')') depth--;
      j++;
    }
    const inner = selector.slice(start, j - 1);
    if (m[1] !== 'not' && !selectors(inner).some((s) => matches(s, used))) return false;
    rest += ' ';
    i = j;
  }
  return tokens(rest).every(used);
}

// A test for "does this calculator use this class or id?", from the text of
// its markup and code.
function usage(corpus) {
  const words = new Set(corpus.match(/[\w-]+/g) || []);
  const prefixes = [...new Set((corpus.match(/['"`][\w-]*[-_]['"`]/g) || []).map((s) => s.slice(1, -1)).filter((p) => p.length > 3))];
  return (token) => words.has(token) || prefixes.some((p) => token.startsWith(p));
}

function subset(rules, used) {
  const out = [];
  for (const r of rules) {
    if (r.text) out.push(r.text);
    else if (r.rules) {
      const inner = subset(r.rules, used);
      if (inner) out.push(r.prelude + '{' + inner + '}');
    } else {
      const kept = selectors(r.prelude).filter((s) => matches(s, used));
      if (kept.length) out.push(kept.join(',') + '{' + r.body + '}');
    }
  }
  return out.join('\n');
}

module.exports = { parse, subset, usage, selectors, tokens, matches };
