// Pure helpers: what goes into a PDF, its fingerprint, and which files the
// sync may replace or delete. No network or browser here, so it's easy to test.
'use strict';

const crypto = require('crypto');

// Bump when the template changes in a way every PDF should pick up.
const TEMPLATE_VERSION = '1';

// The CMS fields each collection uses, by role. A collection's "fields" in
// config.json overrides these (Guides' own names) where its fields differ.
const FIELDS = { pdf: 'pdf-download', faqs: 'faqs', ctaText: 'cta-description', sources: '' };
const fieldsOf = (cfg) => ({ ...FIELDS, ...((cfg && cfg.fields) || {}) });

// The parts of an item (and its FAQs and author) that appear in the PDF.
function source(item, faqs, author, fields = FIELDS) {
  const f = item.fieldData;
  const src = {
    template: TEMPLATE_VERSION,
    name: f.name,
    slug: f.slug,
    summary: f['post-summary'] || '',
    body: f['post-body'] || '',
    readTime: f['read-time'] || '',
    image: (f['main-image'] && f['main-image'].url) || '',
    category: f.category || '',
    cta: [f['cta-heading'] || '', f[fields.ctaText] || '', f['cta-button-text'] || ''],
    author: author ? [author.fieldData.name, author.fieldData['job-title'] || '', author.fieldData.organisation || ''] : null,
    faqs: faqs.map((q) => q.fieldData),
  };
  // Only when there are any, so the Guides' fingerprints stay as they were.
  if (fields.sources && f[fields.sources]) src.sources = f[fields.sources];
  return src;
}

// Eight hex characters: short enough for a file name, long enough to spot any change.
function fingerprint(src) {
  return crypto.createHash('sha256').update(JSON.stringify(src)).digest('hex').slice(0, 8);
}

const fileName = (slug, hash) => `lyfeguard-${slug}-${hash}.pdf`;

// Webflow serves assets as <site>/<24-hex asset id>_<file name>.
function assetParts(url) {
  const m = /\/([0-9a-f]{24})_([^/?#]+)$/.exec(url || '');
  return m ? { id: m[1], name: decodeURIComponent(m[2]) } : null;
}

// What the item's PDF field currently holds:
//   none       empty, so build one
//   generated  made by this tool (lyfeguard-<slug>-<hash>.pdf, or the pilot's lyfeguard-<slug>.pdf)
//   manual     anything else (a bespoke PDF such as the fillable checklist): never touched
function classify(url, slug) {
  if (!url) return { kind: 'none' };
  const a = assetParts(url);
  if (a) {
    const m = new RegExp(`^lyfeguard-${escapeRe(slug)}(?:-([0-9a-f]{8}))?\\.pdf$`).exec(a.name);
    if (m) return { kind: 'generated', hash: m[1] || null, assetId: a.id };
  }
  return { kind: 'manual' };
}

// Generated files that nothing links to any more, and are old enough not to be
// mid-sync, can be deleted. Only names this tool writes for a known slug qualify.
function sweepable(assets, { slugs, referenced, now = Date.now(), minAgeMs = 2 * 3600e3 }) {
  return assets.filter((a) => {
    const parts = assetParts(a.hostedUrl || a.url || '');
    if (!parts || referenced.has(parts.id)) return false;
    const m = /^lyfeguard-(.+?)(?:-([0-9a-f]{8}))?\.pdf$/.exec(parts.name);
    if (!m || !slugs.has(m[1])) return false;
    const created = Date.parse(a.createdOn || a.lastUpdated || '');
    return Number.isFinite(created) && now - created > minAgeMs;
  });
}

// "Last reviewed October 2026" in the body wins; otherwise the publish month.
function reviewedLabel(item) {
  const text = (item.fieldData['post-body'] || '').replace(/<[^>]+>/g, ' ');
  const m = /Last reviewed (\w+ \d{4})/.exec(text);
  if (m) return m[1];
  const d = new Date(item.lastPublished || item.lastUpdated || Date.now());
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { TEMPLATE_VERSION, FIELDS, fieldsOf, source, fingerprint, fileName, assetParts, classify, sweepable, reviewedLabel };
