# Lyfeguard Tools

Shared CSS and JavaScript for the calculators at lyfeguard.com/tools, plus the
markup and template code for the Webflow "Tools" CMS collection.

## How it's used
The Tools template loads two files in its head code, served by jsDelivr:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@v1.0.1/dist/lg-calc.min.css">
<script src="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@v1.0.1/dist/lg-calc.min.js" defer></script>
```

Each calculator starts only when its own markup is on the page.

## Folders
- `src/` – readable CSS and JS. Make every change here.
- `dist/` – minified files that Webflow loads. Rebuild them from `src/`; never edit them by hand.
- `markup/` – HTML for each item's "Calculator markup" field (paste it as one Custom Code block).
- `webflow/` – template head code, item field values and the setup guide.

## Calculator keys
net-worth, inheritance-tax, compound-interest, savings-goal, emergency-fund,
loan-repayment, pro-rata-salary, salary-by-age, mortgage

## Making a change
1. Edit `src/lg-calc.css` or `src/lg-calc.js`, and update the version number in the file header (and `LG.version` in the JS).
2. Rebuild `dist/`:
   ```
   npx csso src/lg-calc.css --no-restructure -o dist/lg-calc.min.css
   sed -i 's/background:0 0\([;}]\)/background:transparent\1/g' dist/lg-calc.min.css
   npx terser src/lg-calc.js -c -m --comments '/^!/' --format ascii_only=true -o dist/lg-calc.min.js
   ```
3. Commit, then create a release tagged with the new version (e.g. `v1.0.2`).
4. Test on the webflow.io staging site with the new tag, then update the version in the template head code and publish.

Keep all files ASCII-only (write £ as `\u00A3` in JS), so the files can't be mis-encoded (the old "Â£" bug).

## Rules
- Never point Webflow at `@main` or `@latest`. Always use a version tag, so changes go live only when you choose.
- Tax rates (2026/27) are in `LG.ukTax` in `src/lg-calc.js` and need updating each April.
