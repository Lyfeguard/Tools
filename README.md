# Lyfeguard Tools

Shared CSS and JavaScript for the calculators at lyfeguard.com/tools, plus the
markup and template code for the Webflow "Tools" CMS collection.

## How it's used
The Tools template loads two files in its head code, served by jsDelivr:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@v1.2.1/dist/lg-calc.min.css">
<script src="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@v1.2.1/dist/lg-calc.min.js" defer></script>
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
loan-repayment, pro-rata-salary, salary-by-age, mortgage, debt-to-income

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
   npm run style-diff -- v1.2.1
   ```
5. Commit, then create a release tagged with the new version (e.g. `v1.2.2`). GitHub runs the build and tests on every pull request ("Check calculators").
6. Test on the webflow.io staging site with the new tag, then update the version in the template head code and publish.

Keep all files ASCII-only (write £ as `\u00A3` in JS), so the files can't be mis-encoded (the old "Â£" bug).

## Rules
- Never point Webflow at `@main` or `@latest`. Always use a version tag, so changes go live only when you choose.
- Tax rates (2026/27) are in `LG.ukTax` in `src/lg-calc.js` and need updating each April.
- In the JS, new calculators should use the shared helpers in the core section: `LG.start` (start-up and missing-element check), `LG.parseNumber` (reading typed numbers), `LG.money` and `LG.showError`. The loan, mortgage, compound interest and debt-to-income calculators use them.
