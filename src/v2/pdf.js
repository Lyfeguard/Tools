/*!
 * Lyfeguard calculators | lg-pdf.js | VERSION
 * A calculator's PDF summary, made in the browser from what it shows: the
 * figures never leave the page. Loaded only when someone asks for a PDF.
 */
(function (window, document) {
  'use strict';
  var LG = (window.LyfeCalculators = window.LyfeCalculators || {});
  // The logo as PDF drawing operators, in its SVG's units (1004 x 220).
  // Made from pdf-generator/assets/logo/lyfeguard-white.svg by scripts/build-extras.js.
  var LOGO = '/* @logo */';
  var SITE = 'https://www.lyfeguard.com';
  var SIGN_UP = 'https://app.lyfeguard.com/register';

  /* ------------------------------------------------------------------
     What the calculator shows, read from its shadow root.
     ------------------------------------------------------------------ */
  var SKIP = 'button, svg, script, style, template, input, select, textarea, summary, [role="img"], [aria-hidden="true"], [class*="sr-only"], .lgc-sticky, .lgc-actions, .lgc-pdf, [data-announce]';
  var BLOCK = 'div, p, ul, ol, li, dl, table, h1, h2, h3, h4, h5, h6, section, details, fieldset, form';
  var NO_RESULT = /^(?:|\u2014|\u2013|\u00A3\u2013|\u00A3\u2014)$/;

  function clean(text) {
    return text.replace(/[\s\u00A0\u202F]+/g, ' ').trim();
  }
  function shown(el) {
    if (el.hidden) return false;
    var style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  // The text someone can see in an element.
  function textOf(el) {
    var out = '';
    el.childNodes.forEach(function (node) {
      if (node.nodeType === 3) out += node.data;
      else if (node.nodeType === 1 && !node.matches(SKIP) && shown(node)) {
        var block = !/^inline/.test(getComputedStyle(node).display);
        out += (block ? ' ' : '') + textOf(node) + (block ? ' ' : '');
      }
    });
    return clean(out);
  }
  function visibleChildren(el) {
    return [].filter.call(el.children, function (c) {
      return !c.matches(SKIP) && shown(c) && textOf(c);
    });
  }
  function leaf(el) {
    return ![].some.call(el.querySelectorAll(BLOCK), shown);
  }
  // One piece of text: no two elements inside with text of their own.
  function atomic(el) {
    var own = function (e) {
      return [].some.call(e.childNodes, function (n) { return n.nodeType === 3 && n.data.trim(); });
    };
    return [el].concat([].slice.call(el.querySelectorAll('*'))).filter(function (e) { return !e.matches(SKIP) && own(e); }).length <= 1;
  }
  function hasControl(el) {
    return !!el.querySelector('input:not([type="hidden"]), select, textarea');
  }
  // A label and a value side by side: <span>Total interest</span><strong>...</strong>.
  function pairOf(el) {
    if (el.tagName === 'P' || [].some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.data.trim(); })) return null;
    var parts = visibleChildren(el);
    if (parts.length < 2 || !parts.every(function (p) { return atomic(p) && !/^(P|H\d)$/.test(p.tagName); })) return null;
    var label = parts[0];
    var sign = '';
    // A ledger line: "+ | Gross value of assets | \u00A3500,000".
    if (/^[^\w\u00A3]{1,2}$/.test(textOf(label)) && parts.length > 2) {
      sign = textOf(label) + ' ';
      parts = parts.slice(1);
      label = parts.filter(function (p) { return !p.matches('strong, b, output, dd, .lg-value'); })[0] || parts[0];
    }
    var value = parts.filter(function (p) { return p !== label && p.matches('strong, b, output, dd, .lg-value'); })[0] || parts[parts.length - 1];
    if (value === label) return null;
    var text = textOf(value);
    if (!/\d/.test(text + textOf(label))) return null;
    var extras = [];
    parts.forEach(function (p) {
      if (p === label || p === value) return;
      if (p.tagName === 'SMALL' && p.previousElementSibling === value) text += ' ' + textOf(p);
      else if (!NO_RESULT.test(textOf(p))) extras.push(textOf(p));
    });
    if (NO_RESULT.test(text)) return null;
    return [sign + textOf(label), [text].concat(extras).join(' \u00B7 ')];
  }
  function tableOf(el) {
    var rows = [].map.call(el.querySelectorAll('tr'), function (tr) {
      return [].filter.call(tr.children, shown).map(textOf);
    });
    var headed = el.querySelector('thead') || (el.rows[0] && [].every.call(el.rows[0].cells, function (c) { return c.tagName === 'TH'; }));
    var caption = el.querySelector('caption');
    return { table: { head: headed ? rows.shift() : null, rows: rows }, title: caption ? textOf(caption) : '' };
  }

  // The results, as headings, rows, tables and paragraphs.
  function walk(el, out, used) {
    [].forEach.call(el.children, function (c) {
      if (used.indexOf(c) > -1 || c.matches(SKIP) || !shown(c)) return;
      if (hasControl(c) || used.some(function (u) { return u && c.contains(u); })) return walk(c, out, used);
      var tag = c.tagName;
      var text = textOf(c);
      if (!text) return;
      if (/^H[1-6]$/.test(tag)) return out.push({ heading: text, level: tag < 'H3' ? 2 : 3 });
      if (c.matches('label, legend') || (c.matches('[class*="eyebrow"], [class*="kicker"]') && leaf(c))) return;
      // Section numbers ("06 / The big picture") with whatever sits beside them.
      if (leaf(c) && /^\d{2}\s*[\/\u2013\u2014-]\s/.test(text)) return;
      if (c.matches('[class*="legend"], [class*="key"]') && leaf(c) && !/\d/.test(text)) return;
      if (tag === 'TABLE') {
        var t = tableOf(c);
        if (t.title) out.push({ heading: t.title, level: 3 });
        return out.push({ table: t.table });
      }
      if (tag === 'DL') {
        return [].forEach.call(c.querySelectorAll('dt'), function (dt) {
          var dd = dt.nextElementSibling;
          if (dd && shown(dt) && !NO_RESULT.test(textOf(dd))) row(out, textOf(dt), textOf(dd));
        });
      }
      if (tag === 'DETAILS') {
        var summary = c.querySelector('summary');
        if (summary) {
          // Its first piece of text: not "Method, assumptions..." after it or a "+" symbol.
          var walker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
          var first = '';
          while (!/\w/.test(first) && walker.nextNode()) first = clean(walker.currentNode.data);
          out.push({ heading: first.replace(/^How was this calculated\?$/, 'How this was calculated'), level: 2 });
        }
        return walk(c, out, used);
      }
      if (tag === 'UL' || tag === 'OL') {
        return [].forEach.call(c.children, function (li) {
          if (!shown(li) || !textOf(li)) return;
          var p = pairOf(li);
          if (p) row(out, p[0], p[1]);
          else out.push({ bullet: textOf(li) });
        });
      }
      var pair = pairOf(c);
      if (pair) return row(out, pair[0], pair[1]);
      if (leaf(c)) {
        if (!NO_RESULT.test(text)) out.push({ text: text, small: c.matches('[class*="disclaimer"], [class*="footnote"], [class*="hint"], [class*="note"], small') });
        return;
      }
      walk(c, out, used);
    });
  }
  function row(out, label, value) {
    var last = out[out.length - 1];
    if (!last || !last.rows) out.push((last = { rows: [] }));
    last.rows.push([label, value]);
  }

  // What was entered: every filled-in field, under the heading it sits below.
  function inputsOf(root, results) {
    var groups = [];
    var heading = 'Your details';
    var radios = {};
    function add(label, value) {
      var group = groups[groups.length - 1];
      if (!group || group.heading !== heading) groups.push((group = { heading: heading, rows: [] }));
      group.rows.push([label, value]);
    }
    function inResults(el) {
      return results.some(function (r) { return r.contains(el); });
    }
    function visible(el) {
      for (var n = el; n && n !== root; n = n.parentElement) if (!shown(n)) return false;
      return true;
    }
    function labelOf(control) {
      var label = (control.id && root.querySelector('label[for="' + control.id + '"]')) || control.closest('label');
      if (label) return textOf(label);
      return control.getAttribute('aria-label') || '';
    }
    // The units beside a field: the "\u00A3" before it, the "%" or "years" after it.
    function withUnits(control, value) {
      var before = '';
      var after = '';
      [].forEach.call(control.parentElement.children, function (s) {
        if (s === control || !/^(SPAN|SMALL|B|I)$/.test(s.tagName)) return;
        var t = clean(s.textContent);
        if (!t || t.length > 16) return;
        if (s.compareDocumentPosition(control) & 4) before = t;
        else after = t;
      });
      return (before ? before + (/^\W$/.test(before) ? '' : ' ') : '') + value + (after ? (after.charAt(0) === '%' ? '' : ' ') + after : '');
    }
    [].forEach.call(root.querySelectorAll('h2, h3, input, select, textarea'), function (el) {
      if (inResults(el) || !visible(el)) return;
      if (/^H/.test(el.tagName)) return (heading = textOf(el) || heading);
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden' || type === 'button' || type === 'submit') return;
      if (type === 'radio') {
        if (!el.checked || radios[el.name]) return;
        radios[el.name] = true;
        var set = el.closest('fieldset');
        var legend = set && set.querySelector('legend');
        var name = legend ? clean(legend.textContent) : '';
        if (!name || /\.$/.test(name) || name === heading) name = 'Your choice';
        var option = el.closest('label') || root.querySelector('label[for="' + el.id + '"]');
        var parts = option ? [].map.call(option.childNodes, function (n) { return clean(n.nodeType === 1 ? (n.matches(SKIP) ? '' : n.textContent) : n.data); }).filter(Boolean) : [el.value];
        return add(name, parts.join(' \u00B7 '));
      }
      if (type === 'checkbox') return add(labelOf(el), el.checked ? 'Yes' : 'No');
      var value = el.tagName === 'SELECT' ? (el.selectedOptions[0] ? clean(el.selectedOptions[0].textContent) : '') : clean(el.value);
      if (value) add(labelOf(el), el.tagName === 'SELECT' ? value : withUnits(el, value));
    });
    return groups;
  }

  function pageUrl() {
    var canonical = document.querySelector('link[rel="canonical"]');
    var url = canonical ? canonical.href : location.href;
    return /^https?:/.test(url) ? url.split(/[?#]/)[0] : SITE + '/tools';
  }

  // Everything the PDF says, from one <lg-calculator>.
  LG.summary = function (host) {
    var scope = host.shadowRoot;
    var root = scope.querySelector('.lg-calc');
    var parts = LG.resultParts(scope);
    var bar = parts.bar;
    var start = parts.results;
    var value = parts.value;
    var used = [];
    var headline = null;
    if (value) {
      var box = value;
      while (box.parentElement && box.parentElement !== root && box.parentElement.children.length === 1) box = box.parentElement;
      var labelEl = bar.hasAttribute('data-source-label') ? scope.getElementById(bar.getAttribute('data-source-label')) : box.previousElementSibling;
      var note = box.nextElementSibling;
      if (note && !(note.tagName === 'P' && shown(note) && leaf(note))) note = null;
      var barLabel = bar.querySelector('.lgc-sticky-label');
      headline = { label: (labelEl && textOf(labelEl)) || (barLabel ? clean(barLabel.textContent) : ''), value: textOf(value), note: note ? textOf(note) : '' };
      used.push(box, labelEl, note);
    }
    // The results: their panel and everything after it.
    var results = [];
    if (start) {
      results.push(start);
      for (var n = start; n && n !== root; n = n.parentElement) for (var s = n.nextElementSibling; s; s = s.nextElementSibling) results.push(s);
    }
    var blocks = [];
    walk({ children: results }, blocks, used);
    var h1 = document.querySelector('h1');
    var title = h1 ? clean(h1.textContent) : 'Calculator';
    return {
      key: host.getAttribute('key') || root.getAttribute('data-calc'),
      title: title,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      url: pageUrl(),
      headline: headline,
      inputs: inputsOf(root, results),
      blocks: blocks,
    };
  };

  /* ------------------------------------------------------------------
     TrueType fonts, embedded whole (Manrope is about 36 KB a weight).
     ------------------------------------------------------------------ */
  function Font(buffer, name) {
    var v = new DataView(buffer);
    var tables = {};
    for (var i = 0, n = v.getUint16(4); i < n; i++) {
      var o = 12 + i * 16;
      tables[String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))] = v.getUint32(o + 8);
    }
    var head = tables.head;
    var hhea = tables.hhea;
    var os2 = tables['OS/2'];
    var upem = v.getUint16(head + 18);
    var k = 1000 / upem;
    var metrics = v.getUint16(hhea + 34);
    var hmtx = tables.hmtx;
    this.name = name;
    this.bytes = new Uint8Array(buffer);
    this.bbox = [36, 38, 40, 42].map(function (o) { return Math.round(v.getInt16(head + o) * k); });
    this.ascent = Math.round(v.getInt16(hhea + 4) * k);
    this.descent = Math.round(v.getInt16(hhea + 6) * k);
    this.cap = os2 && v.getUint16(os2) >= 2 ? Math.round(v.getInt16(os2 + 88) * k) : Math.round(this.ascent * 0.7);
    this.used = {};
    this.advance = function (gid) {
      return Math.round(v.getUint16(hmtx + 4 * Math.min(gid, metrics - 1)) * k);
    };
    // Unicode to glyph: cmap format 12 (full Unicode) or 4 (the BMP).
    var cmap = tables.cmap;
    var best = null;
    for (var r = 0, count = v.getUint16(cmap + 2); r < count; r++) {
      var rec = cmap + 4 + r * 8;
      var sub = cmap + v.getUint32(rec + 4);
      var format = v.getUint16(sub);
      var platform = v.getUint16(rec);
      if ((format === 12 || format === 4) && (platform === 3 || platform === 0) && (!best || format > best.format)) best = { format: format, at: sub };
    }
    var cache = {};
    this.glyph = function (code) {
      if (code in cache) return cache[code];
      var gid = 0;
      var at = best.at;
      if (best.format === 12) {
        for (var g = 0, groups = v.getUint32(at + 12); g < groups; g++) {
          var p = at + 16 + g * 12;
          if (code >= v.getUint32(p) && code <= v.getUint32(p + 4)) {
            gid = v.getUint32(p + 8) + code - v.getUint32(p);
            break;
          }
        }
      } else if (code < 0x10000) {
        var segs = v.getUint16(at + 6) / 2;
        var ends = at + 14;
        var starts = ends + segs * 2 + 2;
        var deltas = starts + segs * 2;
        var ranges = deltas + segs * 2;
        for (var s = 0; s < segs; s++) {
          if (v.getUint16(ends + s * 2) < code) continue;
          var first = v.getUint16(starts + s * 2);
          if (first > code) break;
          var delta = v.getInt16(deltas + s * 2);
          var range = v.getUint16(ranges + s * 2);
          if (!range) gid = (code + delta) & 0xffff;
          else {
            gid = v.getUint16(ranges + s * 2 + range + (code - first) * 2);
            if (gid) gid = (gid + delta) & 0xffff;
          }
          break;
        }
      }
      return (cache[code] = gid);
    };
  }
  var SUBSTITUTE = { 0xa0: 32, 0x202f: 32, 0x2009: 32, 0x2212: 45, 0x2011: 45 };
  function glyphs(font, text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.codePointAt(i);
      if (code > 0xffff) i++;
      var gid = font.glyph(code);
      if (!gid && SUBSTITUTE[code]) gid = font.glyph((code = SUBSTITUTE[code]));
      font.used[gid] = code;
      out.push(gid);
    }
    return out;
  }
  function width(font, size, text, tracking) {
    var w = 0;
    var list = glyphs(font, text);
    list.forEach(function (g) {
      w += font.advance(g);
    });
    return (w * size) / 1000 + (tracking || 0) * list.length;
  }
  // Lines of text no wider than max.
  function wrap(font, size, text, max) {
    var lines = [];
    var line = '';
    String(text).split(' ').forEach(function (word) {
      var next = line ? line + ' ' + word : word;
      if (line && width(font, size, next) > max) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  /* ------------------------------------------------------------------
     Pages: drawing in points from the top-left corner of an A4 page.
     ------------------------------------------------------------------ */
  var W = 595.28;
  var H = 841.89;
  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) { return +(c / 255).toFixed(3); }).join(' ');
  }
  function num(n) {
    return +n.toFixed(2);
  }
  function Page() {
    this.ops = [];
    this.links = [];
  }
  Page.prototype.rect = function (x, y, w, h, color, radius) {
    var r = radius || 0;
    var t = H - y;
    var b = H - y - h;
    var c = r * 0.4477; // the bezier handle for a quarter circle, from the corner
    this.ops.push(rgb(color) + ' rg');
    if (!r) this.ops.push([x, b, w, h].map(num).join(' ') + ' re f');
    else {
      var R = x + w;
      this.ops.push([
        [x + r, b, 'm'], [R - r, b, 'l'], [R - c, b, R, b + c, R, b + r, 'c'], [R, t - r, 'l'], [R, t - c, R - c, t, R - r, t, 'c'],
        [x + r, t, 'l'], [x + c, t, x, t - c, x, t - r, 'c'], [x, b + r, 'l'], [x, b + c, x + c, b, x + r, b, 'c'],
      ].map(function (op) { return op.map(function (v) { return typeof v === 'number' ? num(v) : v; }).join(' '); }).join(' ') + ' h f');
    }
  };
  Page.prototype.line = function (x1, y1, x2, y2, color, w) {
    this.ops.push(rgb(color) + ' RG ' + num(w) + ' w ' + [x1, H - y1, 'm', x2, H - y2, 'l'].map(function (v) { return typeof v === 'number' ? num(v) : v; }).join(' ') + ' S');
  };
  // Text with its baseline at y.
  Page.prototype.text = function (font, size, x, y, text, color, tracking) {
    var hex = glyphs(font, text).map(function (g) { return ('000' + g.toString(16)).slice(-4); }).join('');
    this.ops.push('BT /' + font.id + ' ' + num(size) + ' Tf ' + num(tracking || 0) + ' Tc ' + rgb(color) + ' rg ' + num(x) + ' ' + num(H - y) + ' Td <' + hex + '> Tj ET');
  };
  Page.prototype.link = function (x, y, w, h, url) {
    this.links.push([num(x), num(H - y - h), num(x + w), num(H - y), url]);
  };
  Page.prototype.logo = function (x, y, h) {
    var s = h / 220;
    this.ops.push('q ' + num(s) + ' 0 0 ' + num(-s) + ' ' + num(x) + ' ' + num(H - y) + ' cm ' + LOGO + ' Q');
  };

  /* ------------------------------------------------------------------
     The file. Streams are compressed where the browser can (all current ones).
     ------------------------------------------------------------------ */
  function compress(bytes) {
    if (typeof CompressionStream !== 'function') return Promise.resolve({ bytes: bytes, filter: '' });
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Response(stream).arrayBuffer().then(function (b) {
      return { bytes: new Uint8Array(b), filter: ' /Filter /FlateDecode' };
    });
  }
  function ascii(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function utf16(text) {
    var hex = 'FEFF';
    for (var i = 0; i < text.length; i++) hex += ('000' + text.charCodeAt(i).toString(16)).slice(-4);
    return '<' + hex + '>';
  }
  function hex4(n) {
    return ('000' + n.toString(16)).slice(-4);
  }
  function toUnicode(font) {
    var gids = Object.keys(font.used).map(Number).sort(function (a, b) { return a - b; });
    var out = ['/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange'];
    for (var i = 0; i < gids.length; i += 100) {
      var chunk = gids.slice(i, i + 100);
      out.push(chunk.length + ' beginbfchar');
      chunk.forEach(function (g) {
        var code = font.used[g];
        var u = code > 0xffff ? hex4(0xd800 + ((code - 0x10000) >> 10)) + hex4(0xdc00 + ((code - 0x10000) & 0x3ff)) : hex4(code);
        out.push('<' + hex4(g) + '> <' + u + '>');
      });
      out.push('endbfchar');
    }
    out.push('endcmap CMapName currentdict /CMap defineresource pop end end');
    return out.join('\n');
  }
  function pdfString(s) {
    return '(' + s.replace(/[\\()]/g, '\\$&') + ')';
  }

  function save(pages, fonts, title) {
    var objects = [];
    function reserve() {
      objects.push(null);
      return objects.length;
    }
    var catalog = reserve();
    var tree = reserve();
    var info = reserve();
    var jobs = [];
    function stream(id, dict, bytes) {
      jobs.push(compress(bytes).then(function (c) {
        objects[id - 1] = [ascii('<<' + dict + ' /Length ' + c.bytes.length + c.filter + ' >>\nstream\n'), c.bytes, ascii('\nendstream')];
      }));
    }
    var resources = [];
    fonts.forEach(function (font) {
      if (!Object.keys(font.used).length) return;
      var type0 = reserve();
      var cid = reserve();
      var descriptor = reserve();
      var file = reserve();
      var cmap = reserve();
      resources.push('/' + font.id + ' ' + type0 + ' 0 R');
      var widths = Object.keys(font.used).map(Number).sort(function (a, b) { return a - b; }).map(function (g) { return g + ' [' + font.advance(g) + ']'; }).join(' ');
      objects[type0 - 1] = '<< /Type /Font /Subtype /Type0 /BaseFont /' + font.name + ' /Encoding /Identity-H /DescendantFonts [' + cid + ' 0 R] /ToUnicode ' + cmap + ' 0 R >>';
      objects[cid - 1] = '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /' + font.name + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + descriptor + ' 0 R /CIDToGIDMap /Identity /W [' + widths + '] >>';
      objects[descriptor - 1] = '<< /Type /FontDescriptor /FontName /' + font.name + ' /Flags 32 /FontBBox [' + font.bbox.join(' ') + '] /ItalicAngle 0 /Ascent ' + font.ascent + ' /Descent ' + font.descent + ' /CapHeight ' + font.cap + ' /StemV 80 /FontFile2 ' + file + ' 0 R >>';
      stream(file, ' /Length1 ' + font.bytes.length, font.bytes);
      stream(cmap, '', ascii(toUnicode(font)));
    });
    var kids = pages.map(function (page) {
      var id = reserve();
      var content = reserve();
      var annots = page.links.map(function (l) {
        var a = reserve();
        objects[a - 1] = '<< /Type /Annot /Subtype /Link /Rect [' + l.slice(0, 4).join(' ') + '] /Border [0 0 0] /A << /S /URI /URI ' + pdfString(encodeURI(decodeURI(l[4]))) + ' >> >>';
        return a + ' 0 R';
      });
      objects[id - 1] = '<< /Type /Page /Parent ' + tree + ' 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << ' + resources.join(' ') + ' >> >> /Contents ' + content + ' 0 R' + (annots.length ? ' /Annots [' + annots.join(' ') + ']' : '') + ' >>';
      stream(content, '', ascii(page.ops.join('\n')));
      return id + ' 0 R';
    });
    objects[catalog - 1] = '<< /Type /Catalog /Pages ' + tree + ' 0 R /Lang (en-GB) /ViewerPreferences << /DisplayDocTitle true >> >>';
    objects[tree - 1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
    var d = new Date();
    var stamp = 'D:' + d.getUTCFullYear() + [d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map(function (n) { return ('0' + n).slice(-2); }).join('') + 'Z';
    objects[info - 1] = '<< /Title ' + utf16(title) + ' /Author (Lyfeguard) /Creator (lyfeguard.com) /Producer (Lyfeguard calculators) /CreationDate (' + stamp + ') >>';
    return Promise.all(jobs).then(function () {
      var parts = [ascii('%PDF-1.7\n%'), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), ascii('\n')];
      var offset = 15;
      var xref = ['0000000000 65535 f '];
      objects.forEach(function (o, i) {
        var chunks = [ascii(i + 1 + ' 0 obj\n')].concat(typeof o === 'string' ? [ascii(o)] : o, [ascii('\nendobj\n')]);
        xref.push(('000000000' + offset).slice(-10) + ' 00000 n ');
        chunks.forEach(function (c) {
          offset += c.length;
          parts.push(c);
        });
      });
      parts.push(ascii('xref\n0 ' + (objects.length + 1) + '\n' + xref.join('\n') + '\ntrailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + offset + '\n%%EOF\n'));
      return new Blob(parts, { type: 'application/pdf' });
    });
  }

  /* ------------------------------------------------------------------
     The layout, in the guides' style (pdf-generator/template/pdf.css).
     ------------------------------------------------------------------ */
  var C = { navy: '#051A22', ink: '#08282E', green: '#0B6351', muted: '#48636A', line: '#D3E1DF', tint: '#EAF2F0', teal: '#3FD8B5', soft: '#B9CFCF', stand: '#D6E3E3', zebra: '#F6FAF9', white: '#FFFFFF', cta: '#C8D8D8' };
  var M = 48; // side margins
  var TOP = 52;
  var BOTTOM = H - 60;

  function utm(url, key) {
    return url + (url.indexOf('?') > -1 ? '&' : '?') + 'utm_source=lyfeguard-pdf&utm_medium=download&utm_campaign=' + encodeURIComponent(key + '-calculator');
  }

  function layout(doc, fonts) {
    var R = fonts[0];
    var B = fonts[1];
    var X = fonts[2];
    var pages = [];
    var page;
    var y;
    var inner = W - 2 * M;
    function newPage() {
      page = new Page();
      pages.push(page);
      y = TOP;
    }
    function room(h) {
      if (y + h > BOTTOM) newPage();
    }
    // Paragraph lines at a line height; returns the height used.
    function lines(font, size, list, x, color, lead, align, w) {
      list.forEach(function (l, i) {
        var lx = align === 'right' ? x + w - width(font, size, l) : x;
        page.text(font, size, lx, y + size + i * lead, l, color);
      });
      return list.length * lead;
    }

    // The band.
    newPage();
    var title = wrap(X, 26, doc.title, inner - 20);
    var stand = wrap(R, 11, 'Your figures and results from ' + doc.date + '. The figures stay yours: this summary was made on your device.', inner - 40);
    var bandH = 40 + 22 + 34 + 14 + title.length * 30 + 10 + stand.length * 17 + 34;
    page.rect(0, 0, W, bandH, C.navy);
    page.logo(M, 40, 22);
    var tag = 'Calculator \u00B7 lyfeguard.com';
    page.text(R, 8, W - M - width(R, 8, tag, 0.16), 55, tag, C.soft, 0.16);
    y = 40 + 22 + 34;
    page.text(B, 8.5, M, y + 8.5, 'CALCULATOR SUMMARY', C.teal, 0.68);
    y += 14;
    y += lines(X, 26, title, M, C.white, 30);
    y += 10;
    lines(R, 11, stand, M, C.stand, 17);
    y = bandH + 28;

    // The headline result.
    var h = doc.headline;
    if (h && h.value) {
      var hl = wrap(B, 10, h.label || 'Your result', inner - 40);
      var hv = wrap(X, 26, h.value, inner - 40);
      var hn = h.note ? wrap(R, 9.5, h.note, inner - 40) : [];
      var boxH = 18 + hl.length * 14 + 6 + hv.length * 31 + (hn.length ? 6 + hn.length * 14 : 0) + 16;
      room(boxH);
      page.rect(M, y, inner, boxH, C.tint);
      page.rect(M, y, 3, boxH, C.green);
      var top = y;
      y += 18;
      y += lines(B, 10, hl, M + 20, C.muted, 14);
      y += 6;
      y += lines(X, 26, hv, M + 20, C.ink, 31) - 4;
      if (hn.length) {
        y += 10;
        lines(R, 9.5, hn, M + 20, C.muted, 14);
      }
      y = top + boxH + 10;
    }

    function heading(text, level) {
      var size = level === 2 ? 14 : 10.5;
      var font = level === 2 ? X : B;
      var list = wrap(font, size, text, inner);
      var need = (level === 2 ? 22 : 12) + list.length * size * 1.3 + 30; // keep with what follows
      room(need);
      y += level === 2 ? 18 : 10;
      if (level === 2) {
        page.rect(M, y, Math.min(inner, Math.max.apply(null, list.map(function (l) { return width(font, size, l); }))), 2, C.teal);
        y += 8;
      }
      y += lines(font, size, list, M, C.ink, size * 1.3) + 4;
    }
    function rows(list) {
      list.forEach(function (r) {
        var lw = inner * 0.56;
        var vw = inner - lw - 12;
        var l = wrap(R, 9.5, r[0], lw);
        var v = wrap(B, 9.5, r[1], vw);
        var rh = Math.max(l.length, v.length) * 14 + 12;
        room(rh);
        var top = y;
        y += 6;
        lines(R, 9.5, l, M, C.ink, 14);
        lines(B, 9.5, v, M + lw + 12, C.ink, 14, 'right', vw);
        y = top + rh;
        page.line(M, y, M + inner, y, C.line, 0.6);
      });
      y += 6;
    }
    function table(t) {
      var cols = Math.max.apply(null, [t.head ? t.head.length : 0].concat(t.rows.map(function (r) { return r.length; })));
      var first = cols > 1 ? Math.max(inner * 0.3, inner / cols) : inner;
      var rest = cols > 1 ? (inner - first) / (cols - 1) : 0;
      var size = cols > 4 ? 7.5 : 8.5;
      function cells(r, font) {
        return r.map(function (c, i) { return wrap(font, size, c, (i ? rest : first) - 12); });
      }
      function drawRow(r, font, bg, color) {
        var wrapped = cells(r, font);
        var rh = Math.max.apply(null, wrapped.map(function (c) { return c.length; })) * size * 1.4 + 12;
        if (y + rh > BOTTOM) {
          newPage();
          if (t.head && r !== t.head) drawRow(t.head, B, C.navy, C.white);
        }
        if (bg) page.rect(M, y, inner, rh, bg);
        var top = y;
        wrapped.forEach(function (c, i) {
          y = top + 6;
          var x = i ? M + first + (i - 1) * rest : M;
          var numeric = i && /^[-\u2212+\u00A3$\d.,%()\s]+[a-z ]*$/i.test(r[i]);
          lines(i ? font : B, size, c, x + 6, color, size * 1.4, numeric ? 'right' : 'left', (i ? rest : first) - 12);
        });
        y = top + rh;
        if (!bg || bg === C.zebra) page.line(M, y, M + inner, y, C.line, 0.6);
      }
      room(60);
      if (t.head) drawRow(t.head, B, C.navy, C.white);
      t.rows.forEach(function (r, i) {
        drawRow(r, R, i % 2 ? C.zebra : null, C.ink);
      });
      y += 10;
    }
    function text(t, small, bullet) {
      var size = small ? 8.5 : 9.5;
      var lead = size * 1.55;
      var indent = bullet ? 12 : 0;
      var list = wrap(R, size, t, inner - indent);
      list.forEach(function (l, i) {
        room(lead);
        if (bullet && !i) page.text(B, size, M, y + size, '\u2022', C.green);
        page.text(R, size, M + indent, y + size, l, small ? C.muted : C.ink);
        y += lead;
      });
      y += bullet ? 3 : 7;
    }

    if (doc.inputs.length) {
      heading('Your details', 2);
      doc.inputs.forEach(function (g) {
        if (doc.inputs.length > 1) heading(g.heading, 3);
        rows(g.rows);
      });
    }
    var first = true;
    doc.blocks.forEach(function (b) {
      if (first && !b.heading) heading('Your results', 2);
      first = false;
      if (b.heading) heading(b.heading, b.level);
      else if (b.rows) rows(b.rows);
      else if (b.table) table(b.table);
      else if (b.bullet) text(b.bullet, false, true);
      else text(b.text, b.small);
    });

    // The call to action, as in the guides.
    var ctaTitle = wrap(X, 17, 'Keep your important information in one place', inner - 60);
    var ctaH = 30 + 12 + ctaTitle.length * 22 + 14 + 30 + 26 + 24;
    room(ctaH + 70);
    y += 16;
    page.rect(M, y, inner, ctaH, C.navy, 6);
    var cy = y + 30;
    page.text(B, 8.5, M + 30, cy, 'LYFEGUARD', C.teal, 0.68);
    y = cy + 8;
    y += lines(X, 17, ctaTitle, M + 30, C.white, 22) + 14;
    var button = 'Create free account';
    var bw = width(B, 10, button) + 40;
    page.rect(M + 30, y, bw, 30, C.teal, 4);
    page.text(B, 10, M + 50, y + 19, button, C.navy);
    page.link(M + 30, y, bw, 30, utm(SIGN_UP, doc.key));
    y += 30 + 20;
    var again = 'Update your figures any time at ';
    var short = doc.url.replace(/^https?:\/\/(www\.)?/, '');
    page.text(R, 8.5, M + 30, y, again, C.soft);
    var ax = M + 30 + width(R, 8.5, again);
    page.text(B, 8.5, ax, y, short, C.teal);
    page.link(ax, y - 9, width(B, 8.5, short), 12, utm(doc.url, doc.key));
    y = cy - 30 + ctaH + 14;
    text('These are estimates based on the details you entered on ' + doc.date + ' and the assumptions shown. They are a guide, not financial advice. Tax rules and allowances can change.', true);

    // Footers, now the page count is known.
    pages.forEach(function (p, i) {
      p.line(M, H - 40, W - M, H - 40, C.line, 0.6);
      p.text(R, 7.5, M, H - 26, 'Lyfeguard calculator summary \u00B7 ' + doc.date, C.muted);
      var n = 'Page ' + (i + 1) + ' of ' + pages.length;
      p.text(R, 7.5, W - M - width(R, 7.5, n), H - 26, n, C.muted);
    });
    return pages;
  }

  var FONTS = ['Manrope-Regular', 'Manrope-Bold', 'Manrope-ExtraBold'];
  var loading = null;
  function loadFonts(base) {
    if (!loading) {
      loading = Promise.all(FONTS.map(function (name) {
        return fetch(base + name + '.ttf').then(function (r) {
          if (!r.ok) throw new Error(name + ': ' + r.status);
          return r.arrayBuffer();
        });
      }));
      loading.catch(function () {
        loading = null; // try again next time
      });
    }
    return loading.then(function (buffers) {
      return buffers.map(function (b, i) {
        var font = new Font(b, FONTS[i]);
        font.id = 'F' + (i + 1);
        return font;
      });
    });
  }

  // The PDF for a summary: { url, filename } once it's made.
  LG.pdf = function (doc, fontBase) {
    return loadFonts(fontBase).then(function (fonts) {
      return save(layout(doc, fonts), fonts, doc.title + ' \u2013 your summary');
    }).then(function (blob) {
      var day = new Date().toISOString().slice(0, 10);
      return { url: URL.createObjectURL(blob), filename: 'lyfeguard-' + doc.key + '-summary-' + day + '.pdf', blob: blob };
    });
  };
})(window, document);
