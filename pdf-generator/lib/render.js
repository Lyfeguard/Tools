// Builds the branded HTML for one item and prints it to PDF with Chromium.
// The CMS rich text is tidied inside the page itself (tidy() below), using the
// browser's own DOM, so there's no HTML-parsing dependency.
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { reviewedLabel, fieldsOf } = require('./content');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'template/pdf.css'), 'utf8')
  .replace(/FONTS/g, pathToFileURL(path.join(ROOT, 'assets/fonts')).href);
const LOGO = pathToFileURL(path.join(ROOT, 'assets/logo/lyfeguard-white.svg')).href;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function utm(url, slug) {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'lyfeguard-pdf');
  u.searchParams.set('utm_medium', 'download');
  u.searchParams.set('utm_campaign', slug);
  return u.href;
}

// The FAQ questions and answers, from every FAQ item linked to the guide.
function faqBlocks(faqs) {
  const out = [];
  for (const faq of faqs) {
    const f = faq.fieldData;
    for (let n = 1; n <= 30; n++) {
      const q = f[`${n}-question`];
      if (!q) continue;
      const rich = f[`${n}-answer-rt`];
      const answer = rich || `<p>${esc(f[`${n}-answer`] || '')}</p>`;
      out.push(`<div class="faq"><h3>${esc(q)}</h3><div class="answer">${answer}</div></div>`);
    }
  }
  return out.join('');
}

function buildHtml({ item, faqs, author, cfg, site }) {
  const f = item.fieldData;
  const url = `${site.siteUrl}/${cfg.path}/${f.slug}`;
  const shortUrl = url.replace(/^https:\/\//, '');
  const reviewed = reviewedLabel(item);
  const category = cfg.categories[f.category] || cfg.kind + 's';
  const image = f['main-image'] && f['main-image'].url;
  const faqHtml = faqBlocks(faqs);
  const a = author && author.fieldData;
  const byline = a
    ? `<div><b>${esc(a.name)}</b>${esc([a['job-title'], a.organisation || 'Lyfeguard'].filter(Boolean).join(', '))}</div>`
    : '';
  const ctaButton = f['cta-button-text'] || cfg.ctaFallback;
  const fields = fieldsOf(cfg);
  const ctaText = f[fields.ctaText];
  const sources = fields.sources && f[fields.sources];

  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(f.name)}</title>
<style>${CSS}</style></head><body>
<section class="cover">
  <div class="band">
    <div class="top"><img src="${LOGO}" alt="Lyfeguard"><span>${esc(cfg.kind)} &middot; lyfeguard.com</span></div>
    <p class="eyebrow">${esc(category)}</p>
    <h1>${esc(f.name)}</h1>
    <p class="standfirst">${esc(f['post-summary'])}</p>
  </div>
  ${image ? `<div class="hero" style="background-image:url('${esc(image)}')"></div>` : ''}
  <div class="coverbody">
    <div class="byline">${byline}<div><b>Last reviewed</b>${esc(reviewed)}</div>${f['read-time'] ? `<div><b>Reading time</b>${esc(f['read-time'])} minutes</div>` : ''}</div>
    <div class="toc"><h2>In this ${esc(cfg.kind.toLowerCase())}</h2><ol id="toc"></ol></div>
    <div class="coverfoot">This is a downloadable copy of <a href="${esc(url)}">${esc(shortUrl)}</a>, last reviewed ${esc(reviewed)}. For the latest version, visit the page online.<br>
    General guidance only, not financial or legal advice. Figures are from the sources named in the text.</div>
  </div>
</section>
<main class="article">${f['post-body'] || ''}</main>
${sources ? `<section class="sources"><h2>Sources</h2>${sources}</section>` : ''}
${faqHtml ? `<section class="faqs" id="faqs">${faqHtml.replace('<div class="faq">', '<div class="faq"><h2>Frequently asked questions</h2>')}</section>` : ''}
<section class="cta">
  <p class="eyebrow">Lyfeguard</p>
  <h2>${esc(f['cta-heading'] || 'Keep your important information in one place')}</h2>
  ${ctaText ? `<p>${esc(ctaText)}</p>` : ''}
  ${cfg.ctaUrl ? `<a class="btn" href="${esc(utm(cfg.ctaUrl, f.slug))}">${esc(ctaButton)}</a>` : ''}
  <span class="alt">Read the latest version online: <a href="${esc(url)}">${esc(shortUrl)}</a></span>
</section>
<p class="legal">&copy; Lyfeguard Limited ${new Date().getFullYear()}. This ${esc(cfg.kind.toLowerCase())} is for general information and does not constitute financial, tax or legal advice. Check your own circumstances, or speak to a regulated adviser or solicitor, before acting.</p>
</body></html>`;
  return { html, reviewed };
}

// Runs in the page. Turns Webflow rich text into print-ready HTML.
function tidy(siteUrl) {
  const absolute = (href) => (href && href.startsWith('/') ? siteUrl + href : href);
  const scopes = [...document.querySelectorAll('.article, .faq .answer, .sources')];
  for (const scope of scopes) {
    const inFaq = scope.classList.contains('answer');
    for (const embed of [...scope.querySelectorAll('div[data-rt-embed-type]')]) {
      const anchor = embed.querySelector('span[id]');
      const table = embed.querySelector('table');
      if (anchor && !table) {
        // Hidden heading anchor: give its id to the heading that follows.
        const next = embed.nextElementSibling;
        if (next && /^H[2-4]$/.test(next.tagName) && !next.id) next.id = anchor.id;
        embed.remove();
      } else if (inFaq) {
        embed.remove(); // FAQ tables and charts repeat the article
      } else if (table) {
        const wrap = document.createElement('div');
        wrap.className = 'table';
        wrap.appendChild(table);
        embed.replaceWith(wrap);
      } else {
        embed.querySelectorAll('script, style, iframe, form, input, button, noscript').forEach((n) => n.remove());
        if (!embed.textContent.trim() && !embed.querySelector('img, svg')) embed.remove();
      }
    }
    scope.querySelectorAll('script, style, iframe, form, noscript').forEach((n) => n.remove());
    scope.querySelectorAll('[style], [class]').forEach((n) => {
      n.removeAttribute('style');
      if (n.className !== 'table') n.removeAttribute('class');
    });
    scope.querySelectorAll('a[href]').forEach((a) => a.setAttribute('href', absolute(a.getAttribute('href'))));
  }
  // Contents list from the article's headings.
  const toc = document.getElementById('toc');
  let i = 0;
  for (const h of document.querySelectorAll('.article h2')) {
    if (!h.id) h.id = 'section-' + ++i;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent.trim();
    li.appendChild(a);
    toc.appendChild(li);
  }
  if (document.getElementById('faqs')) {
    toc.insertAdjacentHTML('beforeend', '<li><a href="#faqs">Frequently asked questions</a></li>');
  }
}

const FOOTER = (title, reviewed) => `<div style="font-family:Helvetica,Arial,sans-serif;font-size:7px;color:#48636a;width:100%;padding:0 17mm;display:flex;justify-content:space-between">
<span>${esc(title)} &nbsp;&middot;&nbsp; Last reviewed ${esc(reviewed)} &nbsp;&middot;&nbsp; General guidance, not financial or legal advice</span>
<span>lyfeguard.com &nbsp;&middot;&nbsp; <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

// Opens the item's page, tidied and ready to print. The caller closes it.
async function openPage(browser, data, htmlFile) {
  const { html, reviewed } = buildHtml(data);
  fs.mkdirSync(path.dirname(htmlFile), { recursive: true });
  fs.writeFileSync(htmlFile, html);
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(tidy, data.site.siteUrl);
  await page.evaluate(() => document.fonts.ready);
  return { page, reviewed };
}

// Writes <outFile> (and the HTML next to it, for checking) and returns the PDF bytes.
async function renderPdf(browser, data, outFile) {
  const { page, reviewed } = await openPage(browser, data, outFile.replace(/\.pdf$/, '.html'));
  try {
    const pdf = await page.pdf({
      path: outFile,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: FOOTER(data.item.fieldData.name, reviewed),
      tagged: true,
      outline: true,
    });
    return pdf;
  } finally {
    await page.close();
  }
}

module.exports = { buildHtml, tidy, openPage, renderPdf };
