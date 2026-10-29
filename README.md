# Lyfeguard Tools

Shared CSS and JavaScript for the calculators at lyfeguard.com/tools, plus the
markup and template code for the Webflow "Tools" CMS collection.

## How it's used
The Tools template loads two files in its head code, served by jsDelivr:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@v1.8.2/dist/lg-calc.min.css">
<script src="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@v1.8.2/dist/lg-calc.min.js" defer></script>
```

Each calculator starts only when its own markup is on the page.

## Folders
- `src/` – readable CSS and JS. Make every change here.
- `dist/` – minified files that Webflow loads. Rebuild them from `src/`; never edit them by hand.
- `markup/` – HTML for each item's "Calculator markup" field (paste it as one Custom Code block).
- `webflow/` – template head code, item field values and the setup guide.
- `test/` – automated tests that open every calculator in a browser (see below).
- `scripts/` – the build script and the style check.

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
   This runs `scripts/build.sh`, which does the same as these three commands and checks every file is ASCII-only:
   ```
   npx csso src/lg-calc.css --no-restructure -o dist/lg-calc.min.css
   sed -i 's/background:0 0\([;}]\)/background:transparent\1/g' dist/lg-calc.min.css
   npx terser src/lg-calc.js -c -m --comments '/^!/' --format ascii_only=true -o dist/lg-calc.min.js
   ```
3. Run the tests:
   ```
   npm test
   ```
   - `test/known-answers.test.js` checks results against figures worked out by hand (tax, loan and mortgage formulas, IHT bands and so on).
   - `test/calculators.test.js` checks every figure, message and chart value against the saved snapshots in `test/snapshots/`. If you changed a result on purpose, run `UPDATE_SNAPSHOTS=1 npm test` and check the snapshot diff before committing.
4. If you changed the CSS, prove nothing else moved by comparing every element's final styles with the last release:
   ```
   npm run style-diff -- v1.8.2
   ```
5. Commit, then create a release tagged with the new version (e.g. `v1.6.1`). GitHub runs the build and tests on every pull request ("Check calculators").
6. Test on the webflow.io staging site with the new tag, then update the version in the template head code and publish.

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

## Rules
- Never point Webflow at `@main` or `@latest`. Always use a version tag, so changes go live only when you choose.
- In the CSS, use the design tokens (`--lg-ocean`, `--lg-mint-ink`, `--lg-ink-soft`, `--lg-radius` and so on, defined at the top of `src/lg-calc.css` from the brand kit) instead of typing colours, fonts or radii again. Neon Mint (`--lg-mint`) is only for Ocean backgrounds.
- Tax rates, National Insurance and student loan thresholds (2026/27, including Scottish rates) are in `LG.ukTax` in `src/lg-calc.js` and need updating each April.
- In the JS, every calculator uses the shared helpers in the core section: `LG.start` (start-up and missing-element check), `LG.parseNumber` (reading typed numbers: never use `parseFloat` on user input), `LG.money`, `LG.percent`, `LG.markInvalid` and `LG.showError`. New calculators should too.
