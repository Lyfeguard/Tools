# Changelog

Every release, newest first. [docs/releasing.md](docs/releasing.md) describes how releases work.

## v2.5.0 – Unreleased
Mortgage Affordability rebuilt around cash flow, the Guides' and Insights' answer boxes fixed and redesigned, and plainer wording on Redundancy Pay. **In Webflow:** nothing to change; publish after the release. Review the Mortgage Affordability item's written content against the calculator (see the pull request).
- **Answer boxes** (`lg-answer`, the Guides' Quick Answer and the Insights' Executive Summary): text is always Ocean inside them, whatever the site's own classes set (they made it white). The site's rich-text list styles (dashed rule, indent, gap) and padding stay out. A new look: rounded card, mint edge, a dotted label and mint bullet points. Tables and notes get the same protection.
- **Mortgage Affordability:**
  - Age first (the older applicant's for two): the term list only offers terms that end by 75, with a note that lenders' age limits vary.
  - Two applicants enter combined basic pay and combined bonus pay.
  - Credit cards: choose the balance or minimum payments before entering the amount.
  - Expected property price (optional): the loan the home needs, its loan-to-value, and whether it's within most, many or only specialist lenders' range.
  - Everyday living costs (optional), for the cash flow.
  - Results: a monthly cash flow (take-home pay, mortgage, debts, spending, what's left), coloured green, amber or red; figures to try (price, deposit, loans and rate) inside the results, kept in step with the form; a rate-rise slider up to +5 points that shows where the colour changes; and the take-home pay assumptions, adjustable (where you pay tax, pension, student loan and other deductions).
  - (?) explanations on the harder questions, a shared component the other calculators will get later.
  - "Moving home", a banner for second homes (bigger deposits and tighter checks), and the interest rate and type of rate side by side at the same height.
- **Shared styles:** every choice group (legend and switch) now lines up with the fields beside it: 8px under the legend, and switches 52px tall like inputs. New colour tokens for good, tight and short results.
- **Redundancy Pay:** plainer labels and messages ("Your age", "Years with your employer", "Weeks of pay").
- `docs/calculators.md`: the shared (?) component, how the two mortgage calculators divide the work, and what's planned (Buy-to-Let, (?) on every calculator).
- Page weight: the shared code and content-block styles bring the heaviest page (Net Worth) to about 25 KB gzipped, so the test budget is now 26 KB (was 25 KB), and the docs give 16 to 25 KB.

## v2.4.0 – 2026-10-30
Mortgage Affordability calculator. **In Webflow:** the Tools item (Mortgage Affordability Calculator) is already created; the release workflow writes its markup, Component Key and Release, and adds a "Use these figures" link to the Take-Home Pay page. Then fill in the new item's content, Icon and Social Image, and publish.
- `mortgage-affordability`: how much lenders could offer, as a range rather than one figure: most lenders (4 to 4.5 times income), many lenders for higher incomes or bigger deposits (up to 6 times) and a few specialist lenders (up to 7 times). No lender names or rates.
- Questions people can answer: one or two applicants, basic pay and bonus, overtime and commission (counted at 50%, with a note that many lenders count 60% to 70% and some all of it), loan and car finance repayments, credit cards (3% of the balance, or the minimum payments), other committed spending (as lenders define it), and for a second home the existing mortgage. Commitments come off a year's income before multiplying, and the page says this is cautious.
- Results: the borrowing, price with the deposit, loan-to-value and monthly payment at each level; the payment as a share of take-home pay; debt-to-income with the mortgage (the Debt-to-Income calculator's bands); what commitments cost in borrowing; payments if rates rise 1, 2 or 3 points. Notes cover interest-only, variable rates, loan-to-value bands and second homes. Buy-to-let is out of scope, and says so.
- "Use these figures": from Take-Home Pay (the salary), and to Mortgage (price, deposit, rate, term and type) and Stamp Duty (price and kind of buyer).
- `data/2026-27.json` (`mortgageAffordability`): the multiples, the bonus and credit card rules, the loan-to-value bands and the rate rises. `docs/data.md` says to review them every few months. Redundancy's `$source` now cites nidirect for Northern Ireland's £783 cap.
- Field labels are block-level even while their field is hidden (the second applicant and existing mortgage fields), as the site gives labels. No visible change on any calculator.
- Tests (401): hand-worked answers, snapshots for seven scenarios, the hand-offs and the data.

## v2.3.0 – 2026-10-30
Redundancy Pay calculator. **In Webflow:** the Tools item (Redundancy Pay Calculator) is already created; the release workflow writes its markup, Component Key and Release. Then fill in its content, Icon and Social Image, and publish.
- `redundancy-pay`: statutory redundancy pay from age, complete years of service and pay (yearly, monthly or weekly), for Great Britain or Northern Ireland. Shows the weeks' pay, the weekly pay counted (capped), the years counted (up to 20), each age band's share, and notes on the cap, the 20-year limit, the £30,000 tax-free allowance and contractual pay. Under 2 years' service gets nothing, and says so.
- `data/2026-27.json` (`redundancy`): the weekly pay caps from 6 April 2026 (£751 in Great Britain, £783 in Northern Ireland, to be confirmed on nidirect), the 2- and 20-year limits and the age bands.
- The Tools item's slug is `redundancy-pay-calculator`.
- Insight PDFs: the Executive Summary field was recreated as rich text, and Webflow named it `executive-summarys`. The PDF generator now reads that slug, so the summary appears in Insight PDFs.
- Tests (373): hand-worked answers (including the maximum in each nation), snapshots for six scenarios, and the data.

## v2.2.1 – 2026-10-30
The Insights' Executive Summary. **In Webflow:** nothing to do for this release beyond publishing; set up the fields and template elements as in [`docs/content-blocks.md`](docs/content-blocks.md#quick-answer-and-executive-summary).
- `lg-answer lg-summary`: the short-answer box labelled "Executive summary", with its points as a list, for an Executive Summary field in the Insights template. Lists inside any `lg-answer` are styled.
- `docs/content-blocks.md`: every class at a glance (what it is, where it goes, whether it's an embed or a template element), and how to set up the Guides' Quick Answer and the Insights' Executive Summary.
- Guide and Insight PDFs: the Quick Answer (`quick-answer`, labelled "Short answer") and the Executive Summary (`executive-summary`) print in a box before the article. Plain or rich text both work. Only items with one filled in are rebuilt; the rest keep their PDFs.
- Tests (348, and 11 in `pdf-generator/`): the summary's label and list; the PDF box, its label and its place, and that an empty field changes nothing.

## v2.2.0 (and v1.9.2) – 2026-10-30
Content blocks for rich text everywhere: tables, short answers and notes, styled the same on Guides, Insights and the Tools pages. **In Webflow, once:** add [`webflow/content-head.html`](webflow/content-head.html) to the Guides and Insights templates' head code. Nothing changes on the Tools pages.
- New `src/lg-content.css`, built into `dist/lg-content.min.css` (under 1 KB gzipped, from `@2`) for the Guides and Insights templates, and into every calculator's page stylesheet. Three blocks, each a rich-text embed: `lg-table` (`lg-faq-table` still works; `lg-table-text` for tables of words), `lg-answer` (the short answer under a question heading, with a "Short answer" label drawn by CSS so the page's text is only the answer) and `lg-note`.
- [`docs/content-blocks.md`](docs/content-blocks.md): the HTML to paste for each block, how to add one in Webflow, and how to write for featured snippets.
- `node scripts/table.js file.csv --caption "..."` turns a spreadsheet's CSV into a table embed, with every heading set up and every cell escaped.
- The release workflow refreshes jsDelivr's `@2` copy of `lg-content.min.css` too.
- v1.9.2: the table rules move from `src/lg-calc.css` to `src/lg-content.css`.
- Tests (348): the blocks' look on a Guides page and on calculator pages, over the site's rich-text styles; the CSV conversion.

## v2.1.2 (and v1.9.1) – 2026-10-30
Tables in the Tools pages' rich text are styled again. **In Webflow:** nothing to do by hand; publish after the release.
- `<div class="lg-faq-table">` tables in Extended Content and FAQs lost their styles when each page started loading only its own calculator's CSS, because no calculator uses the class. `scripts/build-v2.js` now keeps them in every page's stylesheet.
- A refreshed look from the design tokens: rounded border, tinted header row, banded rows, figures right-aligned in tabular numbers, the caption above and a smaller note below. Wide tables scroll sideways on phones, and the spacing tightens below 480px. The rules start with `div.` so the rich text's own styles can't override them.
- Tests: every page's stylesheet carries the table styles.

## v2.1.1 – 2026-10-30
Stamp Duty: the non-UK resident surcharge, checked against GOV.UK. **In Webflow:** nothing to do by hand; the release workflow stages the new Stamp Duty markup. Then publish.
- The 2% non-resident surcharge starts at £40,000, like the surcharge for additional properties. Below that, a note says it doesn't apply.
- The hint under "I'm not a UK resident" covers joint buyers: anyone buying with you who isn't UK resident makes the purchase non-resident, but a married couple or civil partners count as UK resident if either of them is.
- A note on claiming the 2% back after 183 days in the UK in a 365-day period, from a year before buying to a year after.
- `data/2026-27.json`: `$checked` records the rates confirmed on GOV.UK, Revenue Scotland and the Welsh Revenue Authority, and what's still to confirm.
- Tests (343): GOV.UK's worked example (a non-resident buying for £700,000 pays £39,000), and the surcharge's £40,000 start.

## v2.1.0 (and v1.9.0) – 2026-10-30
Three new calculators for the tax on buying a home, one per nation, sharing one engine. **In Webflow:** the three Tools items (Stamp Duty, LBTT, Land Transaction Tax) are already created; the release workflow writes their markup, Component Key and Release. Then publish.
- `stamp-duty` (England and Northern Ireland: Stamp Duty Land Tax), `lbtt` (Scotland: Land and Buildings Transaction Tax) and `land-transaction-tax` (Wales). Each works out the tax on a price for someone buying their only or main home, a first-time buyer (not in Wales, which has no relief) or someone buying an additional property, and Stamp Duty also for non-UK residents. Each shows the tax on each band, what other kinds of buyer pay at the same price, and how it was worked out. Each page calculates only its own nation's tax, so the pages don't compete in search.
- Rates in `data/2026-27.json` (`propertyTax`): bands, first-time buyer relief, the 5% surcharge and 2% non-resident surcharge (SDLT), the 8% Additional Dwelling Supplement (LBTT) and the higher residential rates (LTT), with surcharges from £40,000. The total is rounded down to the pound, as the tax authorities do.
- Calculators can share code: `scripts/build-v2.js` builds `USES` blocks (here `property-tax`) in before their modules.
- "Use these figures" links between the three, carrying the price and the kind of buyer.
- v1.9.0: the reference build includes the three calculators, and `.lgc-compare-2` for a two-item comparison.
- Tests (343): figures worked out by hand for every nation and kind of buyer, snapshots, the links and hand-offs, the PDFs and the data file.
- Documentation: the README is now a short overview, and the detail is in focused guides in `docs/`: architecture, development, writing a calculator, releasing, Webflow, data, analytics, and PDFs and downloads. The PDF generator's README covers Guides and Insights side by side.
- Removed outdated files: `webflow/tools-cms-setup.md` (the original v1 set-up), `webflow/tools-items.csv` (the v1 import), `pdf-generator/webflow/download-block.html` (superseded by the download embeds), and `webflow/site-custom-code.md` (now in `docs/webflow.md` and `docs/analytics.md`).
- `webflow/template-head.html` holds only the two lines the template uses. The structured data it used to carry was never live, and it named fields that don't exist.
- Guide PDFs: the cover's category follows the new shared categories for Guides and the Glossary (`pdf-generator/config.json`). `TEMPLATE_VERSION` is now 2, so every guide PDF is rebuilt once with the new names.

## v2.0.1 – 2026-10-29
Fixes from the first day live, and no more version numbers to change in Webflow. **Once:** the Tools template head moves to `@{{Release}}` (`webflow/template-head.html`), and the site-wide footer and the Guides and Insights download embeds to `@2`. After that, publishing a GitHub release is enough: the new **Release to Webflow** workflow stages each Tools item's new Release field (and the markup), and refreshes jsDelivr's `@2` copies.
- Releases: `.github/workflows/release.yml` replaces Sync calculator markup. It runs when a release is published (not pre-releases), and by hand to roll back, to try a release on some calculators first (`only`), or as a dry run. `node scripts/webflow-markup.js sync` takes `--release` and `--only`. New Tools field Release (managed by code), staged as v2.0.0.
- The "Download PDF summary" button's text was invisible on Savings Goal, Emergency Fund, Pro Rata Salary and Salary by Age (their result cards make every span white), and Net Worth and Inheritance Tax restyled the button with their own. It now looks the same on every calculator, whatever its styles (`src/v2/download.css`).
- "Use these figures" links carry the figures however they're opened: a middle-click, "Open in new tab", the keyboard or a long press, not only a plain click.
- Net worth to Inheritance Tax: the figures did arrive, but the estimate waits for the questions about the home and who inherits, so it looked as if nothing had. The note now says to answer them.
- Tests (273): the button's look on every calculator, opening a link without a click, and the release sync (only what differs, staged, draft status untouched, --only, bad tags refused).

## v2.0.0 (and v1.8.6) – 2026-10-29
v2 complete. Every calculator in its own shadow root, loading only its own files, with PDF summaries, analytics, versioned data and calculators that work together. **Update the Tools template head and the site-wide code** (`webflow/template-head.html`, `webflow/site-custom-code.md`, all at `@v2.0.0`), **then run Sync calculator markup** to stage the new markup (the links) for six items; it goes live with the next publish.
- Calculators that work together: "Use these figures" links from take-home pay, mortgage, pro rata salary, salary by age, emergency fund and net worth to the calculators that take the figures on (`markup/links.js`, written into the markup by `scripts/links.js`). Plain internal links in the page; the figures travel after the `#` as one is clicked, are filled in on arrival (with a note saying so) and taken out of the address. Only plain numbers, only into the calculator's own fields. New analytics event `calculator_handoff`.
- New **Sync calculator markup** workflow (`.github/workflows/sync-markup.yml`, `node scripts/webflow-markup.js sync`): writes the Calculator markup field and Component Key from `markup/` through the CMS API with the existing `WEBFLOW_TOKEN`, as staged changes, only where they differ (with a dry run). No more pasting markup by hand.
- Worked examples stay in each Tools item's Extended Content, edited in Webflow; the README sets out what's edited where, and the April checklist now includes re-checking them.
- SEO: each calculator page has a social sharing image (Open Graph, 1200 x 630) in its Tools item's new Social Image field, made in the guide PDFs' style by `scripts/social-images.js` (editable in Webflow). The calculator PDFs and the guide PDF generator now link to `https://lyfeguard.com`, the canonical address (they used `www`).
- In Webflow (staged with this release): the breadcrumb's Tools link goes to /tools (a custom attribute sent it, and the current page, to /guides), and the code-managed fields are grouped as "Managed by code (don't edit)".
- v1.8.6 (CSS): styles for the links and the hand-off note. The v1 build escapes non-ASCII characters in CSS the CSS way.
- Tests (267): every hand-off link fills the right fields (and the result matches typing the same figures), unsafe or unknown values are ignored, household net worth hands nothing over, and the markup has its links.

## v2.0.0-beta.1 (and v1.8.6) – 2026-10-29
Each page loads only its own calculator, analytics are built in, and the yearly figures live in data files. **Update the Tools template head to `webflow/template-head.html`** (the page's own `dist/v2/{{Component key}}.min.css` and `.min.js`, no v1). Every item's Component key is staged in the CMS, and goes live with the next publish. **Then the site-wide code** (`webflow/site-custom-code.md`): Google's standard GTM snippet in the head, and `dist/lg-track.min.js` in place of the footer scripts.
- Load only what's needed: `dist/v2/<key>.min.js` (the component, the shared code and one calculator, with only its own styles) and `dist/v2/<key>.min.css` (the same styles for the page, before the script runs and without JavaScript). A calculator page now loads 10 to 21 KB gzipped, against about 120 KB (v1 plus every v2 calculator). `scripts/css-subset.js` keeps the rules whose classes the calculator uses. `dist/v2/lg-calculator.min.js` still holds them all, for a page with several.
- Analytics: the footer click tracking moves into the repo as `dist/lg-track.min.js`, the same on every click outside calculators (tested against the old code), and now sees clicks inside them (`element_location: calculator`). Fixes: a button with `data-track-event` and no link was logged as a link to "/null", and links to a spot on the same page counted as visits. Each calculator pushes `calculator_start`, `calculator_result`, `calculator_see_results`, `calculator_download`, `calculator_pdf_request`, `calculator_clear` and `calculator_error`, as `lyf_event`, never with the figures entered.
- Data as versioned files: `data/2026-27.json` (Income Tax including Scotland, NI rates and thresholds, student loans, auto-enrolment, the Child Benefit charge, IHT bands, the lump sum allowance and the full State Pension) and `data/ons-ashe-2026.json` (the salary tables). The build puts them into v1 and v2 (`scripts/data.js`); no result changes. Each April is a new data file.
- v1.8.6: built with the data files; no change to anything it shows.
- `scripts/webflow-markup.js check` also reports items whose Component key isn't their calculator's key.
- Tests (253): without JavaScript, each calculator's own stylesheet gives exactly v1's look; a page requests only its own two files, under 25 KB gzipped; the click tracking matches the old footer code; the calculator events; and the data files.

## v2.0.0-alpha.5 – 2026-10-29
Gated PDFs for Insights, and every download asked for on its own. **Update the template heads' scripts to v2.0.0-alpha.5** (Tools, and the Guides embed if it uses `dist/lg-dl.min.js`).
- Each download is remembered on its own (`lg-dl-ok:<type>:<slug>`): someone who has given their email for one guide, insight or calculator is asked again for the next, so HubSpot records every download.
- Insights: the same gated download (`webflow/insights-download-embed.html`, `data-type="insight"`, with the Insights HubSpot form `6702e583-...`), and the PDF generator now builds Insight PDFs too. It writes them to the Insights' own fields (PDF Link, FAQs, CTA Subheading) and adds their Sources. Field names are set per collection in `pdf-generator/config.json`; the Guides' PDFs are unchanged (same fingerprints, so nothing is rebuilt). The Insight PDFs' "Book a demo" links to the meetings page.
- Tests (234 here, 9 in `pdf-generator/`): adds per-download memory and the Insights block, and an Insight PDF render.

## v2.0.0-alpha.4 – 2026-10-29
PDF summaries, gated by email, with the same dialog as the Guides. **Update the template head's v2 script to v2.0.0-alpha.4.** There are no markup or CMS changes, and v1 (1.8.5) stays as it is.
- Every calculator gets a "Download PDF summary" button at the end of its results. It shows once someone has used the calculator and there's a result, so the page is indexed as before. Pressing it opens the email dialog (HubSpot form `9d095c21-...`). After the form is sent, or straight away for someone who has given their email before, it downloads a branded A4 PDF with the details entered, the headline result, the results, any tables and "How this was calculated", plus the call to action with UTM tags.
- The PDF is made in the browser (`dist/v2/lg-pdf.min.js`, 15 KB gzipped, plus the Manrope fonts, all loaded on the first click), so the figures never leave the page. HubSpot's hidden fields get only the calculator's name and the page's address.
- New `dist/lg-dl.min.js`: the Guides' download dialog as one shared file. It holds the HubSpot embed loaded on open, the fallback link, the "already gave their email" memory and the `pdf_download` dataLayer event, now with `resource_type`. Fix: success events from other HubSpot forms on the page (a newsletter sign-up, say) no longer reveal the download. The Guides template can swap its pasted HTML, CSS and JS for `webflow/guides-download-embed.html`.
- Tests (233): every calculator's PDF is made and read back, and the dialog, hidden fields, tracking and Guides block are checked. CI installs `poppler-utils` for this.

## v2.0.0-alpha.3 (and v1.8.5) – 2026-10-29
Every calculator moves to v2. **Update the template head to v1.8.5 and v2.0.0-alpha.3, then the markup for all twelve items is synced** (each wrapped in `<lg-calculator>`, still in the page HTML).
- All twelve calculators are built into `<lg-calculator>`. The component's styles are the whole calculator stylesheet, plus a small base layer reproducing what the site's base styles give the calculators today (body font, 25.6px line height, paragraph and label spacing, link font, border-box sizing), so each looks as it does on the site.
- Changes you'll see: some site styles that leaked in by mistake are kept out. Chart legends and notes show at their designed 13–14px (the site made them 17px), the error summary title is red (it was white on a light card), the "How was this calculated?" text is the designed 14px, and the sticky result bar's label is its designed size.
- v1.8.5: each module looks up its elements through its own root (the document in v1, the shadow root in v2); the savings goal engine is read from the calculators' own namespace; `LG.showError` moves into the shared core. No change to what any v1 calculator shows.
- Tests (218): for every calculator, the same figures as v1, the same look as v1 on the site apart from the listed leak fixes, no change from the site's CSS or hostile rules, and the same text and headings for search engines with and without JavaScript.

## v2.0.0-alpha.2 (and v1.8.4) – 2026-10-29
SEO first: calculators on v2 are indexed exactly as on v1. **Update the template head to v1.8.4 and v2.0.0-alpha.2 before the Take-Home Pay markup is synced**: older versions hide markup wrapped in `<lg-calculator>`.
- The markup stays in the page HTML (the CMS field), wrapped in `<lg-calculator key="...">`. The script moves it into the shadow root and runs it there, instead of drawing it from a copy inside the script (alpha.1, where crawlers that don't run JavaScript saw an empty element). Without JavaScript, or if the script doesn't load, the calculator shows and runs as v1.
- The CMS field is written from `markup/` through the Webflow CMS API (`scripts/webflow-markup.js`, items in `webflow/cms-items.json`): no pasting by hand. `check` lists items that differ from the repo.
- `markup/take-home-pay.html` is wrapped in `<lg-calculator key="take-home-pay">`.
- An empty `<lg-calculator>` (the pilot's template embed) shows nothing and takes no space, so it can be removed when convenient.
- v1.8.4: calculators start at DOMContentLoaded, after every deferred script, so v1 never runs a calculator v2 has taken. `lg-calculator` displays as a block, and its markup shows until the v2 script takes it. No change to what any v1 calculator shows.
- Tests: for Take-Home Pay, the same text and headings as v1 with JavaScript off and once rendered; v2 runs the markup from the page; every other calculator runs as v1 with the v2 script loaded.

## v2.0.0-alpha.1 (and v1.8.3) – 2026-10-29
First step of v2: calculators that the site's CSS can't change. **Staging only for now.** Nothing changes for v1 pages.
- New `<lg-calculator key="take-home-pay"></lg-calculator>` web component in `dist/v2/lg-calculator.min.js`. It draws the calculator inside its own shadow root, so Webflow's styles (white paragraph text, label margins, checkbox styles, the template's container widths and so on) can't reach it. The site's fonts still apply.
- One Code Embed on the Tools template, `<lg-calculator key="{Calculator key}">`, serves every item: the key comes from the CMS field. It hides itself, taking no space, on items whose calculator isn't in v2 yet or whose v1 markup is still pasted in, so an item moves to v2 when its Calculator markup field is emptied (and back when it's pasted again).
- Built from the same sources as v1 by `scripts/build-v2.js`: the tax core and the Take-Home Pay module are copied from `src/lg-calc.js`, the styles from the shared components in `src/lg-calc.css`, and the markup from `markup/take-home-pay.html`. Fix something once and both versions get it.
- v1 and v2 can be loaded on the same page. v2 uses its own global (`window.LyfeCalculators`), and v1 can't see inside the component.
- v1.8.3: Take-Home Pay looks up its elements from its own root, so the module works inside the component, and the template's `<lg-calculator>` embed takes no space while hidden. No change to what any v1 calculator shows; no need to re-paste anything.
- Tests (`test/v2.test.js`): every Take-Home Pay scenario shows exactly what the v1 snapshot shows, and every element's styles and position are the same with and without the staging site's CSS (`test/fixtures/webflow-site.css`) plus deliberately hostile rules, at 1280px and 375px. The template embed is checked on every v1 calculator (hidden, same figures and layout) and on Take-Home Pay with its markup field empty.

## v1.8.2 – 2026-10-29
CSS only, no embed changes.
- Fix: the first paragraph of "How was this calculated?" on Take-Home Pay and Retirement Income showed as white on white. It has no class of its own, so it took a colour from the site's rich-text styles; it now sets its own (Ocean). The sticky result bar's text inherits the bar's colour for the same reason.

## v1.8.1 – 2026-10-29
Take-home pay fixes and a new pay rise tool. **Re-paste `markup/take-home-pay.html`.**
- "What a pay rise is worth" now shows +£5,000, +£10,000 and +£20,000 a year (was £1,000, £5,000 and 10%), each with your new salary, and adds "Try your own pay rise": a slider up to £50,000 with an amount box for any figure, showing your new pay, take-home a month, the extra a month and the share of the rise you keep.
- Fix: the "How was this calculated?" card had extra space below its title when closed (a closed `<details>` still added a flex gap in Chrome, and site styles could add a margin to the summary). This also tightens the same card on Retirement Income.
- Fix: the Postgraduate Loan checkbox is now drawn by the calculator (white box, Mint Ink with a tick when checked), so site-wide checkbox styles no longer change it, and it sits inside its box with the right padding.
- New shared components: `lgc-range` (slider), `lgc-range-panel` and `lgc-range-result`.

## v1.8.0 – 2026-10-29
- New Take-Home Pay calculator (key `take-home-pay`, markup in `markup/take-home-pay.html`). Pay a year, month or week becomes take-home pay after 2026/27 income tax, National Insurance, pension and student loans:
  - England, Wales and Northern Ireland or Scottish income tax rates, including the Personal Allowance taper over £100,000.
  - Pension paid from pay before tax, after tax (relief at source, with the higher-rate relief you can claim back) or by salary sacrifice, on all pay or qualifying earnings.
  - Plan 1, 2, 4 and 5 student loans and the Postgraduate Loan.
  - A breakdown by year, month and week, a bar of where your pay goes, and what a £1,000, £5,000 or 10% pay rise is worth.
- `LG.ukTax` now also has Scottish rates, student loan thresholds, `taxBand` and `personalAllowance`. Existing calculators are unchanged.
- New shared components: select and checkbox fields, a stacked share bar, notes, a total row for tables, and option switches that stay side by side on phones (`lgc-switch-compact`).
- Tests: known answers for the new tax figures and pension types.
- Salary by age: updated to ONS ASHE 2026 provisional figures (Table 6.7a, released 22 October 2026). The UK full-time median is now £40,911 (was £39,039 in the 2025 provisional figures). The chart's axis now runs to £110k, as the top 10% of men aged 40 to 59 now start above £100k. **Re-paste `markup/salary-by-age.html`**: its default figures, chart and table are in the markup.

## v1.7.0 – 2026-10-28
Every calculator now uses the markup pattern from Retirement Income. **All ten older embeds must be re-pasted** in the same publish as the head code moving to v1.7.0. Calculations are unchanged.
- Markup: each embed has one root, `<div class="lg-calc lg-calc-classic" data-calc="key">`, so it no longer depends on the Webflow wrapper. Removed leftover browser-extension attributes from the net worth embed and inline styles from the debt-to-income gauge.
- Layout: the phone and tablet layouts respond to the calculator's own width (container queries) instead of the screen width. In the standard template they switch at the same screen widths as before. Card-style calculators (savings goal, emergency fund, pro rata, salary by age) now have 24px between cards, like the others (was 48px).
- Sticky result bar on narrow screens for all ten: the main result and a "See results" link while the results are below.
- Screen readers: loan, mortgage, compound interest, debt-to-income and net worth read one short sentence once typing pauses, instead of the whole results panel on every key press. Inheritance tax section errors are announced.
- "Clear all" for loan, mortgage, compound interest and debt-to-income, and "Clear all figures" for emergency fund.
- Emergency fund and salary by age now say when an entry isn't a number (they were silent).
- Money fields in net worth, inheritance tax, compound interest, loan, mortgage, debt-to-income and savings goal are tidied to 12,500 style when you leave them. Phone keyboards show Next between fields and Done on the last one.
- Tap targets: net worth's "Just mine / Our household" options and buttons, and inheritance tax's buttons, are now at least 44px tall.
- Tests: new scenarios for invalid entries in emergency fund and salary by age, and for Clear in emergency fund and debt-to-income.

## v1.6.0 – 2026-10-28
- New Retirement Income calculator (key `retirement-income`, markup in `markup/retirement-income.html`). How long a pension pot could last, in today's money:
  - The pot pays whatever the State Pension and other guaranteed income don't cover, so it covers the full income before State Pension age.
  - Tax-free cash taken as you go (25% of each withdrawal) or 25% upfront, both within the £268,275 Lump Sum Allowance.
  - Estimated income tax and take-home pay before and after State Pension age, and after the pot runs out (2026/27 rates).
  - The highest income that would last to your chosen age, growth 1% lower and higher, a chart of the pot over time and a year-by-year table.
- New shared `lgc-` components and the markup pattern for calculators (see README): a self-contained `.lg-calc` root with container-query layout, field-level errors with an error summary, a Clear figures button, one debounced screen-reader announcement, and a sticky result bar on narrow screens.
- No change to the existing calculators: their computed styles match v1.5.0.

## v1.5.0 – 2026-10-28
No visual change: computed styles match v1.4.0, and results for valid input are unchanged.
- Every calculator now uses the shared JS helpers for start-up (`LG.start`), reading numbers (`LG.parseNumber`), money and percentages (`LG.money`, `LG.percent`) and marking invalid fields (`LG.markInvalid`). Net worth, inheritance tax, savings goal, emergency fund, pro rata and salary by age were moved over; no calculator has its own number parser or currency formatter any more.
- Emergency fund, pro rata and salary by age no longer misread malformed input: "28k" was read as 28, "-500" as 500 and "1e5" as 15. Invalid entries now count as blank, are marked invalid for screen readers, and are no longer cleared when you leave the field. Pro rata also says "Enter numbers only".
- Inheritance tax accepts commas only as thousands separators ("500,000", not "5,00,000").
- Tests: new checks for the stricter input handling.

## v1.4.0 – 2026-10-28
Visual update: all ten calculators now follow the Lyfeguard brand kit (v2.3). Calculations are unchanged.
- Colours: Ocean for text, headings and the dark results panels; Neon Mint for highlights on Ocean (bars, eyebrow labels, focus); Mint Ink for accents on light backgrounds (bars, borders, selected options, focus rings); Mist and Mist Alt for inputs and tinted areas; one secondary text colour (Ocean at 68%) in place of six greys; Ocean at 12% for lines.
- Accent text on light backgrounds is Ocean (Mint Ink is too light for text), and links get a Mint Ink underline.
- Corners: 20px for cards and panels, 14px for inputs, buttons and inner cards, 10px for small chips.
- Option switchers (age, hours/days, monthly/annual and similar) are a light Mist track with a faint line; the selected option is a raised white chip, with Mint only in the radio dot.
- Accessibility: text below WCAG AA contrast went from 31 elements to none across the calculators.
- Chart data colours and warning and error colours are unchanged.

## v1.3.0 – 2026-10-28
No visual change: every calculator's computed styles were checked against v1.2.1.
- CSS design tokens: the shared colours and fonts are defined once in `:root` (`--lg-navy`, `--lg-teal`, `--lg-line-soft`, `--lg-surface-tint`, `--lg-surface-input`, four `--lg-on-dark-*` colours for the dark results cards, and `--lg-font-body`, `--lg-font-heading`, `--lg-font-label`) and used in 241 places instead of repeated values.
- Each token keeps the exact value it replaced. Colours that differ slightly between calculators (the two accent and line colours, and six near-identical greys) are listed in the stylesheet for a later design pass rather than merged.
- The style tools ignore CSS custom properties and compare only the resulting styles.

## v1.2.1 – 2026-10-28
- Fix: v1.2.0 removed the fallback that styled savings goal, emergency fund, pro rata, salary by age and inheritance tax when the template wrapper has no `data-calc` attribute, so those calculators lost their layout. Each calculator's scoped styles now apply whenever its own markup is on the page (`:root:has(#...)`), so styling no longer depends on the template wrapper and `data-calc` is optional.
- New test (`test/styles.test.js`) renders every calculator with and without the template wrapper and requires identical styles. It fails on v1.2.0 for exactly those five calculators.
- CSS is 109 KB minified (v1.1.0: 128 KB).

## v1.2.0 – 2026-10-28
**Known issue, fixed in v1.2.1:** savings goal, emergency fund, pro rata, salary by age and inheritance tax lose their layout styles when the template wrapper has no `data-calc` attribute. Don't use this version.
- Tests: known-answer and snapshot tests for all ten calculators (`npm test`), a style comparison against any earlier release (`npm run style-diff`), and a GitHub check that runs the build and tests on every pull request.
- CSS 17% smaller (128 KB to 106 KB minified): removed a duplicate copy of the loan styles, the selectors that only served the old static pages (`.lg-calc-wrap:has(...)`), and styles for elements no longer in the markup (old in-card CTAs, IHT FAQ, breadcrumb and skip-link styles, unused compound interest and mortgage classes).
- JS: shared helpers for start-up, number input, money formatting and errors (`LG.start`, `LG.parseNumber`, `LG.money`, `LG.showError`), used by the loan, mortgage, compound interest and debt-to-income calculators.
- Loan, mortgage and compound interest fields now reject malformed numbers such as "1e5" or "1,0,0" instead of reading them as a value.
- Removed code that only served the old static pages (section ids and Webflow form handling).
- Pro rata: the higher-rate threshold is worked out from `LG.ukTax` instead of being typed in separately.

## v1.1.0 – 2026-10-28
- New Debt-to-Income Ratio calculator (key `debt-to-income`, markup in `markup/debt-to-income.html`).
- `npm run build` rebuilds `dist/` from `src/` in one step.

## v1.0.1 – 2026-10-23
- Calculators work in the Tools CMS template (no Webflow Form needed).
- IHT styles no longer depend on #iht-form.
- Rich Text wrapper resets for the template.
- Mortgage module no longer logs a warning on other calculators' pages.

## v1.0.0 – 2026-10-23
- Combined the CSS and JS for all nine calculators into one file each.
