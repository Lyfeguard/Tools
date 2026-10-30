# Development

- [Setting up](#setting-up)
- [Making a change](#making-a-change)
- [Tests](#tests)
- [Comparing styles](#comparing-styles)
- [Continuous integration](#continuous-integration)
- [Scripts](#scripts)

## Setting up

You need Node.js 22, and poppler for the PDF tests (`apt install poppler-utils` or `brew install poppler`).

```bash
npm ci
```

```bash
npx playwright install chromium
```

## Making a change

1. **Edit the source** in `src/`, `markup/` or `data/`. Never edit `dist/`.
2. **Bump the version** if the change will be released: `LG.version` in `src/v2/prelude.js`. Bump the header in `src/lg-calc.js` and `src/lg-calc.css` only when the v1 reference build changes.
3. **Rebuild** `dist/`:

   ```bash
   npm run build
   ```

4. **Run the tests**:

   ```bash
   npm test
   ```

5. **Compare styles** if you changed CSS ([below](#comparing-styles)).
6. **Add an entry** to `CHANGELOG.md`.
7. **Open a pull request.** Commit `dist/` together with the source; CI checks the two match.
8. **Release** once it's merged ([releasing.md](releasing.md)).

## Tests

`npm test` runs every `test/*.test.js` file with Node's test runner. The tests open each calculator in Chromium from the built `dist/` files.

| Test | Checks |
|---|---|
| `known-answers.test.js` | Results against figures worked out by hand: tax, loan and mortgage formulas, IHT bands and so on |
| `calculators.test.js` | Every figure, message and chart value against the snapshots in `test/snapshots/` |
| `v2.test.js` | Each v2 calculator against v1: figures, look on the site, look without JavaScript, text and headings, immunity to the site's CSS, and page weight (its own two files, under 25 KB gzipped) |
| `styles.test.js` | Calculators don't depend on the Webflow wrapper's styles |
| `handoff.test.js`, `links.test.js` | "Use these figures" links: present in the markup, and filling the right fields |
| `pdf.test.js` | Every calculator's PDF (read back with `pdftotext` and `pdfinfo`), the dialog, its hidden fields and tracking, and the Guides block |
| `analytics.test.js` | The click tracking matches the old footer code, and the calculator events |
| `data.test.js` | Every figure in `data/` is present and sensible |
| `content.test.js` | The content blocks' look on Guides and Tools pages over the site's rich text, and the CSV-to-table script |
| `social.test.js` | Social images: size, escaping, and that nothing in an icon can run |
| `webflow-markup.test.js` | The CMS sync: what differs, staging, `--only` and tag checks |

`test/scenarios.js` lists the inputs each calculator is tested with, and `test/page.js` opens a calculator page.

### Updating snapshots

When a result changes on purpose, update the snapshots and review the diff before committing:

```bash
UPDATE_SNAPSHOTS=1 npm test
```

```bash
git diff test/snapshots
```

## Comparing styles

After a CSS change, prove that nothing else moved. This compares every element's computed styles with an earlier release:

```bash
npm run style-diff -- v2.0.1
```

Add `--only=<key>` for one calculator and `--all` for every scenario. It compares the v1 reference build. Every calculator's styles come from `src/lg-calc.css`, so this covers v2 too.

## Continuous integration

| Workflow | Runs | Does |
|---|---|---|
| Check calculators (`check.yml`) | Every pull request and push to `main` | Rebuilds `dist/` and fails if it differs from what's committed, then runs `npm test` |
| Release to Webflow (`release.yml`) | A published release, or by hand | See [releasing.md](releasing.md) |
| Guide PDFs (`guide-pdfs.yml`) | Hourly, by hand, and on pull requests that touch `pdf-generator/` | See [pdf-generator/README.md](../pdf-generator/README.md) |

## Scripts

| Script | Use |
|---|---|
| `scripts/build.sh` | The whole build (`npm run build`) |
| `scripts/build-v2.js` | The v2 files for each calculator |
| `scripts/build-extras.js` | The download dialog, the PDF writer and the click tracking |
| `scripts/css-subset.js` | Picks each calculator's CSS rules |
| `scripts/data.js` | Puts the data files into the code |
| `scripts/links.js` | Writes the links from `markup/links.js` into `markup/<key>.html` |
| `scripts/webflow-markup.js` | Writes the Tools items' code-owned fields ([releasing.md](releasing.md#the-sync-script)) |
| `scripts/style-diff.js` | Style comparison (`npm run style-diff`) |
| `scripts/table.js` | Turns a CSV into a table embed for rich text ([content-blocks.md](content-blocks.md#table)) |
| `scripts/social-images.js` | A social sharing image for a calculator ([webflow.md](webflow.md#social-sharing-images)) |
