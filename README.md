# Lyfeguard Tools

The calculators at [lyfeguard.com/tools](https://lyfeguard.com/tools), and the code around them: the `<lg-calculator>` web component, the markup for each calculator page, the PDF summaries and download dialog, the site-wide click tracking, and the generator for the Guide and Insight PDFs.

The pages are built in Webflow, as items in the **Tools** CMS collection. This repository holds everything a page loads from code. The files are served from jsDelivr at a release tag, so a change goes live only when it is released.

## Contents

- [How it works](#how-it-works)
- [Calculators](#calculators)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Documentation](#documentation)
- [Rules](#rules)

## How it works

Each calculator page is a Tools item. The template's head loads only that page's calculator, at the release in the item's **Release** field:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@{{Release}}/dist/v2/{{Component key}}.min.css">
<script src="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@{{Release}}/dist/v2/{{Component key}}.min.js" defer></script>
```

- **The markup stays in the page.** The calculator's HTML is in the item's Calculator markup field, so crawlers read it without running JavaScript. The script moves it into a shadow root, where the site's CSS can't change it. SEO is the reason the calculators exist, so nothing here may change what search engines see.
- **Small pages.** Each page loads only its own calculator, 10 to 21 KB gzipped.
- **Releases.** Publishing a GitHub release runs the **Release to Webflow** workflow. The workflow points every Tools item at the new tag and writes the markup from this repository, as staged changes. You then publish in Webflow. No code in Webflow changes between releases.
- **Site-wide files.** The click tracking, the Guides and Insights download dialog and the content blocks' styles load from `@2`, the newest 2.x release.

[docs/architecture.md](docs/architecture.md) explains all of this in detail.

## Calculators

| Key | Calculator |
|---|---|
| `net-worth` | Net Worth |
| `inheritance-tax` | Inheritance Tax |
| `compound-interest` | Compound Interest |
| `savings-goal` | Savings Goal |
| `emergency-fund` | Emergency Fund |
| `loan-repayment` | Loan Repayment |
| `pro-rata-salary` | Pro Rata Salary |
| `salary-by-age` | Salary by Age |
| `mortgage` | Mortgage |
| `debt-to-income` | Debt-to-Income |
| `retirement-income` | Retirement Income |
| `take-home-pay` | Take-Home Pay |
| `stamp-duty` | Stamp Duty (England and Northern Ireland) |
| `lbtt` | LBTT (Scotland) |
| `land-transaction-tax` | Land Transaction Tax (Wales) |
| `redundancy-pay` | Redundancy Pay |
| `mortgage-affordability` | Mortgage Affordability |

The key names the calculator's files (`dist/v2/<key>.min.js`, `markup/<key>.html`) and goes in its Tools item's Component Key field. The three taxes on buying a home share one engine, with each nation's rates in the data file. Item IDs are in [`webflow/cms-items.json`](webflow/cms-items.json).

## Repository layout

| Path | What it holds |
|---|---|
| `src/` | Readable source. Make every change here. |
| `src/v2/` | The `<lg-calculator>` component and what the calculators share: start-up, behaviours, analytics, links between calculators, the PDF button and the PDF writer. |
| `dist/` | Built, minified files that the site loads. Rebuild them with `npm run build`; never edit them by hand. |
| `data/` | Figures that change: each tax year's rates and thresholds, and the ONS salary tables. |
| `markup/` | The HTML for each calculator, written to its Tools item by the release workflow. `links.js` lists the "Use these figures" links. |
| `scripts/` | The build, the CMS sync, the style comparison, the social image maker and the CSV-to-table converter. |
| `test/` | Browser tests for every calculator, with snapshots and fixtures. |
| `webflow/` | Code that goes into Webflow: the Tools, Guides and Insights template heads, the Guides and Insights download embeds, and the Tools item IDs. |
| `pdf-generator/` | A separate package that builds the Guide and Insight PDFs from the CMS ([its README](pdf-generator/README.md)). |
| `.github/workflows/` | `check.yml` (build and tests on every pull request), `release.yml` (Release to Webflow) and `guide-pdfs.yml` (hourly Guide PDFs). |
| `CHANGELOG.md` | What changed in each release. |

## Quick start

You need Node.js 22.

```bash
npm ci
```

```bash
npx playwright install chromium
```

```bash
npm run build
```

```bash
npm test
```

The PDF tests also need poppler (`apt install poppler-utils` or `brew install poppler`). [docs/development.md](docs/development.md) covers the full workflow.

## Documentation

| Guide | Covers |
|---|---|
| [Architecture](docs/architecture.md) | The component, how it's built, why it's SEO-safe, and what the site loads |
| [Development](docs/development.md) | Setting up, building, testing, comparing styles and CI |
| [Writing a calculator](docs/calculators.md) | The markup pattern, the shared behaviours, adding a calculator and linking calculators |
| [Releasing](docs/releasing.md) | Releasing, staging, rolling back and moving to a new major version |
| [Webflow](docs/webflow.md) | Which fields people edit and which code owns, the template, embeds, site-wide code and social images |
| [Data](docs/data.md) | The data files and the April update checklist |
| [Analytics](docs/analytics.md) | The events sent to GTM and GA4, and the GTM set-up |
| [Content blocks](docs/content-blocks.md) | Tables, short answers and notes in rich text, and writing for featured snippets |
| [PDFs and downloads](docs/pdf-downloads.md) | The email-gated dialog, the calculator PDF summaries and the HubSpot forms |
| [Guide and Insight PDFs](pdf-generator/README.md) | The separate generator for article PDFs |

## Rules

- **Nothing private in this repository.** It's public, and jsDelivr serves every committed file. Never commit unpublished guides, CMS exports, built PDFs, third-party reference pages or client material.
- **Webflow loads release tags only.** It never loads `@main` or `@latest`. Tools pages use `@{{Release}}`, and site-wide files use the major version (`@2`).
- **Code-owned fields are never edited by hand.** The Calculator markup ("Embed"), Component Key and Release fields are written by the release workflow ([docs/webflow.md](docs/webflow.md)).
- **SEO comes first.** A change must not alter the text, headings or links that crawlers read in the page HTML.
- **Source files stay ASCII-only.** Write non-ASCII characters as escapes (`£` for £ in JS). The build fails otherwise, so the files can't be mis-encoded.
- **Use the design tokens.** Use `--lg-ocean`, `--lg-mint-ink`, `--lg-radius` and the rest, defined at the top of `src/lg-calc.css`, instead of typing colours, fonts or radii. Neon Mint (`--lg-mint`) is for Ocean backgrounds only.
- **Use the shared helpers.** Every calculator uses `LG.start`, `LG.parseNumber` (never `parseFloat` on user input), `LG.money`, `LG.percent`, `LG.markInvalid` and `LG.showError`.
- **Yearly figures live in `data/`, not the code** ([docs/data.md](docs/data.md)).
