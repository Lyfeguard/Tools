# Lyfeguard Tools

Shared CSS and JavaScript for the calculators at lyfeguard.com/tools, plus the
markup and template code for the Webflow "Tools" CMS collection.

## How it's used
Each page on the Tools template loads only its own calculator, served by jsDelivr and named by the item's Component key field (`webflow/template-head.html`):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@v2.0.1/dist/v2/{{Component key}}.min.css">
<script src="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@v2.0.1/dist/v2/{{Component key}}.min.js" defer></script>
```

That's 10 to 21 KB gzipped a page, against about 120 KB when every page loaded v1 and every v2 calculator. v1 (`dist/lg-calc.min.css` and `.min.js`, all calculators in one) is still built and tested, for any page that uses it. The site loads `dist/lg-track.min.js` on every page for click tracking (`webflow/site-custom-code.md`).

## Folders
- `src/` – readable CSS and JS. Make every change here.
- `dist/` – minified files that Webflow loads. Rebuild them from `src/`; never edit them by hand.
- `data/` – the figures that change: each tax year's rates and thresholds (`2026-27.json`) and the ONS salary tables (`ons-ashe-2026.json`). The build puts them into the code.
- `markup/` – HTML for each item's "Calculator markup" field (paste it as one Custom Code block).
- `webflow/` – template head code, item field values and the setup guide.
- `test/` – automated tests that open every calculator in a browser (see below).
- `scripts/` – the build scripts, the CMS markup sync and the style check.
- `pdf-generator/` – branded PDF copies of the guides, kept in step with the CMS by its own workflow. Separate from the calculators (see below).

## Calculator keys
net-worth, inheritance-tax, compound-interest, savings-goal, emergency-fund,
loan-repayment, pro-rata-salary, salary-by-age, mortgage, debt-to-income,
retirement-income, take-home-pay

## Making a change
Needs Node.js 22. Run `npm ci` once, then `npx playwright install chromium` for the tests.

1. Edit `src/lg-calc.css` or `src/lg-calc.js`, and update the version number in the file header (and `LG.version` in the JS).
2. Rebuild `dist/`:
   ```
   npm run build
   ```
   This runs `scripts/build.sh`: it puts the data files in (`scripts/data.js`), minifies v1 (`dist/lg-calc.min.*`), builds v2 for each calculator (`scripts/build-v2.js`) and the files beside it (`scripts/build-extras.js`: the download dialog, the PDF maker and the click tracking), and checks every file is ASCII-only.
3. Run the tests:
   ```
   npm test
   ```
   - `test/known-answers.test.js` checks results against figures worked out by hand (tax, loan and mortgage formulas, IHT bands and so on).
   - `test/calculators.test.js` checks every figure, message and chart value against the saved snapshots in `test/snapshots/`. If you changed a result on purpose, run `UPDATE_SNAPSHOTS=1 npm test` and check the snapshot diff before committing.
4. If you changed the CSS, prove nothing else moved by comparing every element's final styles with the last release:
   ```
   npm run style-diff -- v2.0.0
   ```
5. Commit, then create a release tagged with the new version (e.g. `v2.0.1`). GitHub runs the build and tests on every pull request ("Check calculators").
6. Update the version in the template head code. If `markup/` changed, run **Sync calculator markup** (Actions > Sync calculator markup > Run workflow, `.github/workflows/sync-markup.yml`): it writes each item's Calculator markup field and Component key from `markup/` through the Webflow CMS API, as staged changes, only where they differ. It uses the `WEBFLOW_TOKEN` secret (CMS read and write). Then test on the webflow.io staging site and publish.

Keep all files ASCII-only (write £ as `\u00A3` in JS), so the files can't be mis-encoded (the old "Â£" bug).

## Markup pattern for calculators
New calculators follow the pattern in `markup/retirement-income.html`.
- One root element: `<div class="lg-calc" data-calc="key" id="prefix">`. It styles and lays itself out (spacing, and layout that responds to its own width with container queries), so nothing depends on the Webflow template.
- The ten older calculators have the same root with `lg-calc-classic` added (`<div class="lg-calc lg-calc-classic" data-calc="key">`). That keeps their own styles and switches off the base text styles meant for new calculators. All their layout rules are container queries on this root, so each embed needs it.
- Use the shared `lgc-` components in `src/lg-calc.css` (cards, fields, option switcher, stats, comparison cards, chart, table, sticky result bar). They use class selectors only, so Webflow styles can override them.
- Every input has a `<label>`, a hint and an error line linked with `aria-describedby`, `inputmode` and `enterkeyhint`. Groups of fields and radio buttons sit in a `<fieldset>` with a `<legend>`.
- One error summary (`role="alert"`) at the top of the form, a "Clear figures" button, and one short screen-reader announcement (`aria-live`) once typing pauses, not the whole results panel.
- Charts are SVG with a text description (`role="img"` and `aria-label`) and the same figures in a table.
- No inline styles and no `<script>` in the markup.

Shared behaviours, switched on by attributes (core section of `src/lg-calc.js`, used by every calculator):
- `<div class="lgc-sticky" data-source="id" data-results="id" hidden>` with a `[data-sticky-value]` inside: a result bar at the bottom of narrow screens while the results are below. `data-source-label="id"` keeps its label in step with a heading that changes.
- `<p class="lgc-sr-only" aria-live="polite" data-announce="id id">` (optional `data-announce-prefix`): reads out those elements once typing pauses, and stays silent while any of them shows a dash.
- `<button type="button" data-clear>`: puts every field back to how the page loaded it, then lets the calculator update.
- `data-format="money"` on an input: tidied to 12,500 style when you leave it.

## v2: the `<lg-calculator>` component
A calculator drawn inside its own shadow root, so the site's CSS can't change it. `scripts/build-v2.js` makes, for each calculator:
- `dist/v2/<key>.min.js`: the component, the shared code and that calculator's module, with only its own styles for inside the shadow root.
- `dist/v2/<key>.min.css`: the same styles for the page, so the markup looks right before the script runs and without JavaScript.
- And `dist/v2/lg-calculator.min.js`, every calculator in one file, for a page with several.

A calculator's styles are the rules of `src/lg-calc.css` whose classes and ids it uses: in its markup, its module or the shared component code, or built in its code from a quoted prefix (`'lgdti-band-' + name`). `scripts/css-subset.js` does this; classes inside `:not()` don't count, and `:is()` needs one of its alternatives. The tests prove each calculator looks the same with its own styles as with the whole stylesheet, with JavaScript and without.

SEO comes first: a calculator must be indexed exactly as with v1.
- The markup stays in the page HTML. `markup/<key>.html` (the CMS Calculator markup field) wraps the calculator in `<lg-calculator key="...">`. The script moves that markup into the element's shadow root and runs it there, so crawlers that don't run JavaScript read the same HTML as before, and Google (which flattens shadow DOM when it renders) sees the same text.
- If the script doesn't load, the markup stays where it is, styled by its stylesheet.
- Nothing is pasted by hand: `scripts/webflow-markup.js` builds each item's field from `markup/` (item ids in `webflow/cms-items.json`), and it's written through the Webflow CMS API, then published with the site. `check` lists the items whose field differs from the repo.

Nothing is written twice. `scripts/build-v2.js` (run by `npm run build`) copies the tax core and each calculator's module from `src/lg-calc.js` (between `/* @v2:...-start */` and `/* @v2:...-end */` comments), and the shared components section and design tokens from `src/lg-calc.css`. `src/v2/` holds only what's different: the start-up, the shared behaviours looked up inside the component, and the element itself. All twelve calculators are built in. The component's styles are the whole of `src/lg-calc.css` (bar the page-level rules), plus a small base layer in `scripts/build-v2.js` that reproduces what the site's base styles give the calculators on the page today (body font and line height, paragraph and label spacing, link font, border-box sizing), so each looks as it does on the site.

A new calculator: wrap its module in `@v2:<key>-start` / `@v2:<key>-end` comments, look elements up through `root.getRootNode()` (or the `get` that `LG.start` passes to setup), never `document`, add it to `CALCULATORS` in `scripts/build-v2.js`, add its scenarios to `test/scenarios.js`, wrap `markup/<key>.html` in `<lg-calculator key="<key>">`, then sync the field.

`test/v2.test.js` checks, for each calculator: the same figures as v1 (the v1 snapshots); the same look as v1 on the site (with `test/fixtures/webflow-site.css`), apart from the listed site styles that leaked in by mistake (`LEAK_FIXES`); without JavaScript, exactly v1's look from its own stylesheet; no change from the site's CSS or hostile rules; the same text and headings as v1, both without JavaScript and once rendered; and that a page requests only its own two files, under 25 KB gzipped.

## Calculators that work together
`markup/links.js` lists the "Use these figures" links from each calculator to the ones that take its figures on (take-home pay to debt-to-income, mortgage to debt-to-income, pro rata salary and salary by age to take-home pay, emergency fund to savings goal, net worth to inheritance tax). `scripts/links.js` writes them into `markup/<key>.html` as plain links, so they're in the page HTML. As one is clicked, `src/v2/handoff.js` adds the figures after the `#` (never sent to the server, and the click tracking records links without it); the calculator it opens fills them in, says where they came from, and takes them out of the address. It accepts only plain numbers into its own fields. Net worth hands over only figures entered for one person, as Inheritance Tax works on one person's estate. `test/links.test.js` checks the markup has the links, and `test/handoff.test.js` checks every link fills the right fields.

## What's edited where
- In Webflow (the Tools collection), by people: the name, SEO title and description, Quick Answer, At a Glance, Extended Content (including the worked examples and "How we calculate"), FAQs, Guides, Glossary, the call to action, the icon and Social Image.
- From this repository, never by hand (the "Managed by code (don't edit)" group): the Calculator markup field ("Embed") and Component Key, written by the **Sync calculator markup** workflow from `markup/`. Anything typed into them in Webflow is overwritten.

## Social sharing images
Each Tools item's Social Image field holds the page's Open Graph image (1200 x 630, what LinkedIn, WhatsApp and Slack show when the page is shared); the Tools template's Open Graph image is bound to it. They were made in the guide PDFs' style (the calculator's name and icon on navy, with the Lyfeguard logo) and can be replaced in Webflow with any design. For a new calculator, make one the same way:
```
node scripts/social-images.js "Mortgage Calculator" icon.svg
```
(`icon.svg` is the calculator's Icon field SVG; the image is written to `out/social/`, which git ignores.) `test/social.test.js` checks the size, the escaping and that nothing in an icon can run.

## Analytics
GA4 through Google Tag Manager. Everything is a `lyf_event` dataLayer push (details in `webflow/site-custom-code.md`):
- `src/lg-track.js` → `dist/lg-track.min.js`: the site-wide click tracking, moved here from Webflow's footer code. It looks through shadow roots, so clicks inside calculators are tracked (`element_location: calculator`). `test/analytics.test.js` replays the old footer code (`test/fixtures/lg-track-before.js`) and the new file on the same clicks and checks they match.
- `src/v2/track.js`: each calculator's own events: `calculator_start`, `calculator_result`, `calculator_see_results`, `calculator_download`, `calculator_pdf_request`, `calculator_clear`, `calculator_handoff` and `calculator_error`. Never the figures entered.

## Data
The rates, thresholds and tables that change are in `data/`, not the code. `scripts/data.js` puts each file in at its `/* @data:<name> */ null` marker in `src/lg-calc.js` when you build, for v1 and v2 alike; every calculator reads the tax year from `LG.taxYear`. Keys starting with `$` are notes and stay out of the built files.

Each April: copy `data/2026-27.json` to the new year (`data/2027-28.json`), update the figures from GOV.UK, point the marker in `src/lg-calc.js` at it, rebuild, and update the snapshots where results change on purpose (`UPDATE_SNAPSHOTS=1 npm test`). Then, in Webflow: re-check the worked examples in each Tools item's Extended Content (any that use tax rates or allowances will need new figures), and update the tax year in the SEO titles that carry one (Take-Home Pay, Retirement Income, Pro Rata Salary and Inheritance Tax say "2026/27"; Salary by Age says "2026"). `test/data.test.js` checks every figure is there and makes sense (bands rise, rates are fractions). New ONS tables work the same way.

## PDF summaries and the download dialog
Every v2 calculator offers a branded PDF of the figures entered and the results, behind an email form. The calculators, the Guides and the Insights all use the same dialog.
- `src/lg-dl.js` and `src/lg-dl.css` → `dist/lg-dl.min.js`: the email-gated download dialog (the Guides' design). It holds a HubSpot form (v4 embed, portal 139576714, eu1) that loads when the dialog opens, plus a fallback link if the form is blocked. It remembers each download someone has given their email for (`localStorage` `lg-dl-ok:<type>:<slug>`) and gives them that file straight away next time. A new guide, insight or calculator asks again, so HubSpot records every download; HubSpot usually fills the form in for returning contacts. It fills the `last_resource_requested` and `last_resource_url` hidden fields and pushes `pdf_download` (`resource_slug`, `resource_title`, `resource_type`: `guide`, `insight` or `calculator`) to the dataLayer for GA4. On the Guides and Insights templates, one Code Embed (`webflow/guides-download-embed.html`, `webflow/insights-download-embed.html`) holds the `.lg-dl` block and loads the script.
- `src/v2/download.js`: the "Download PDF summary" button at the end of each calculator's results panel (found from the result bar's markup). It shows once someone has used the calculator and there's a result, so search engines see the page as before. Nothing else loads until it's pressed. Calculators use HubSpot form `9d095c21-3177-42e8-9862-64228125f64d`.
- `src/v2/pdf.js` → `dist/v2/lg-pdf.min.js`: makes the PDF in the browser from what the calculator shows: the fields filled in, the headline result, the results panels, tables and "How this was calculated". The figures never leave the page, and HubSpot gets only the calculator's name and page address. The layout follows the guide PDFs (`pdf-generator/template/pdf.css`): Manrope, fetched from `pdf-generator/assets/fonts/` when needed, and the logo from `pdf-generator/assets/logo/`, turned into PDF drawing operators by `scripts/build-extras.js`. Links carry `utm_source=lyfeguard-pdf&utm_medium=download&utm_campaign=<key>-calculator`. No per-calculator set-up: a new calculator gets its PDF from its markup.

`test/pdf.test.js` makes every calculator's PDF and reads it back with poppler's `pdftotext` and `pdfinfo` (CI installs `poppler-utils`; locally, `apt install poppler-utils` or `brew install poppler`). It also checks the dialog, the hidden fields, the tracking and the Guides block.

## Guide and Insight PDFs (`pdf-generator/`)
A branded PDF of every published guide and insight, built from the Webflow CMS, uploaded to the site's assets and linked from each guide's PDF Download field for the gated download block. The **Guide PDFs** workflow (`.github/workflows/guide-pdfs.yml`) checks hourly and rebuilds only PDFs whose article has changed. It needs the `WEBFLOW_TOKEN` repository secret.

The calculators' PDF summaries use its fonts and logo (`assets/`), so keep those paths. Otherwise it is kept apart from the calculators: its own `package.json` and tests inside the folder, and its own workflow, so `npm ci`, the build, the ASCII check and "Check calculators" never touch it. Details in `pdf-generator/README.md`.

## Rules
- Nothing private in this repository: it's public and jsDelivr serves every committed file. That includes unpublished guides, CMS exports, built PDFs and client material.
- Never point Webflow at `@main` or `@latest`. Always use a version tag, so changes go live only when you choose.
- In the CSS, use the design tokens (`--lg-ocean`, `--lg-mint-ink`, `--lg-ink-soft`, `--lg-radius` and so on, defined at the top of `src/lg-calc.css` from the brand kit) instead of typing colours, fonts or radii again. Neon Mint (`--lg-mint`) is only for Ocean backgrounds.
- Tax rates, National Insurance, student loan thresholds and the other yearly figures (2026/27, including Scottish rates) are in `data/2026-27.json` and need updating each April (see Data above). The calculators read them through `LG.ukTax` and `LG.taxYear`.
- In the JS, every calculator uses the shared helpers in the core section: `LG.start` (start-up and missing-element check), `LG.parseNumber` (reading typed numbers: never use `parseFloat` on user input), `LG.money`, `LG.percent`, `LG.markInvalid` and `LG.showError`. New calculators should too.
