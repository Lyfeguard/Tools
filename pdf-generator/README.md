# Guide and Insight PDFs

Builds a branded PDF of every published guide and insight from the Webflow CMS. It uploads each PDF to the site's assets and links it from the item's PDF field. On the site, the gated download block shows that link once someone has filled in the HubSpot form ([docs/pdf-downloads.md](../docs/pdf-downloads.md)).

It runs on its own. The **Guide PDFs** workflow (`.github/workflows/guide-pdfs.yml`) checks every hour and rebuilds only the PDFs whose article has changed.

It's a separate package, with its own `package.json`, tests and workflow, and uses nothing outside this folder. The calculators' PDF summaries use its fonts and logo (`assets/`), so keep those paths.

- [What's in a PDF](#whats-in-a-pdf)
- [Collections](#collections)
- [How it decides what to build](#how-it-decides-what-to-build)
- [Link mode](#link-mode)
- [Set-up](#set-up)
- [Running the workflow](#running-the-workflow)
- [Running it locally](#running-it-locally)
- [Files](#files)

## What's in a PDF

- **A cover**: the category, title, summary, main image, author, last reviewed date, reading time and a clickable contents list.
- **The content**: the article, then the FAQs linked to it.
- **A closing call to action** with UTM tags (`utm_source=lyfeguard-pdf&utm_medium=download&utm_campaign=<slug>`), so sign-ups from PDFs show in GA4.
- **A footer on every page** with the title, review date and page number.

The review date comes from "Last reviewed Month YYYY" in the article, or the publish month if there isn't one.

## Collections

Each collection is set up in `config.json`. Its `fields` map the collection's field names; a collection without `fields` uses the Guides' names.

| | Guides | Insights |
|---|---|---|
| PDF field | PDF Download (`pdf-download`) | PDF Link (`pdf-link`) |
| FAQs | `faqs` | `faqs-2` |
| Call to action text | `cta-description` | CTA Subheading (`cta-subheading`) |
| Call to action link | `app.lyfeguard.com/register` | The meetings page |
| Button text when the item sets none | Create free account | Book a demo |
| Cover eyebrow | The guide's category | "Insights" (the collection has an Audience, not a Category) |
| Short answer box, before the article | Quick Answer (`quick-answer`), labelled "Short answer" | Executive Summary (`executive-summary`), labelled "Executive summary" |
| Extra content | | Sources, added after the article |
| Download embed | `webflow/guides-download-embed.html` | `webflow/insights-download-embed.html` |

The Insights collection's old PDF (File) field isn't used.

## How it decides what to build

- **Published content only.** It reads the live items, so drafts and unpublished edits never reach a PDF.
- **A fingerprint of the content.** Each file is named `lyfeguard-<slug>-<8 characters>.pdf`. The 8 characters are a fingerprint of everything the PDF shows: title, summary, short answer, body, image, category, call to action, author and FAQs. When the live article's fingerprint differs from the file in its PDF field, the PDF is rebuilt. SEO fields and other changes that don't show in the PDF don't trigger a rebuild.
- **Rebuilding everything.** After a template change, bump `TEMPLATE_VERSION` in `lib/content.js`, or run the workflow with **force**.
- **Bespoke PDFs are left alone.** If the PDF field holds any other file, the item is skipped. An example is the fillable UK Life Admin Checklist on "What Is Life Admin?". Empty the field to hand the item back to the generator.
- **Old files are tidied up.** After a rebuild, the generator deletes generated PDFs that are over two hours old and that no item links to any more, staged or live. It only ever deletes files named `lyfeguard-<known slug>-<fingerprint>.pdf`, or the pilot's `lyfeguard-<slug>.pdf`.

## Link mode

Set this with the repository variable `PDF_LINK_MODE` (Settings > Secrets and variables > Actions > Variables).

| Mode | Behaviour |
|---|---|
| `staged` (default) | The new link is saved to the CMS and goes live the next time the item is published. The workflow publishes nothing. |
| `live` | The new link is written straight to the live site, but only the PDF field, and only for items with no unpublished edits. Items with pending edits fall back to staged. |

## Set-up

1. **Create a token in Webflow.** Go to Site settings > Apps & integrations > API access > Generate API token, with **CMS: read and write** and **Assets: read and write**.
2. **Add it to GitHub.** Go to Settings > Secrets and variables > Actions > New repository secret, and name it `WEBFLOW_TOKEN`. Without it, the workflow does nothing and says so.
3. **Optional:** set `PDF_LINK_MODE` ([above](#link-mode)).
4. **Try a dry run.** Run the workflow by hand once with **dry run** ticked, and check the PDFs in the run's artifacts. Then run it without dry run.

## Running the workflow

Go to Actions > Guide PDFs > Run workflow.

| Input | Use |
|---|---|
| `dry_run` | Build the PDFs without uploading them or changing the CMS. The PDFs are in the run's artifacts. |
| `force` | Rebuild every PDF, even if its content hasn't changed |
| `slug` | Only this item |

GitHub turns off scheduled workflows in public repositories after 60 days without a commit. If the PDFs stop updating, re-enable the workflow on the Actions tab.

## Running it locally

You need Node.js 22.

```bash
cd pdf-generator
npm ci
npx playwright install chromium
```

| Command | Does |
|---|---|
| `npm test` | Tests, and a render of the sample guide in `test/fixtures` (made-up content) |
| `WEBFLOW_TOKEN=... node sync.js plan` | Lists what would be rebuilt, and changes nothing |
| `WEBFLOW_TOKEN=... node sync.js run --dry-run` | Builds into `out/` without uploading |
| `node sync.js run --fixtures <dir>` | Builds from saved `items.json`, `faqs.json` and `authors.json` |

`out/` is git-ignored; keep it that way. Never commit real CMS exports or built PDFs: this repository is public, and jsDelivr serves every committed file.

## Files

| Path | Contents |
|---|---|
| `sync.js` | The command the workflow runs: plan, build, upload, link and tidy up |
| `lib/content.js` | Fingerprints, file names, and which files may be replaced or deleted. No network. |
| `lib/render.js` | The HTML for an article, the clean-up of Webflow rich text (hidden heading anchors, table embeds, inline styles, relative links) and the PDF print |
| `lib/webflow.js` | The Webflow API calls (items, live items, assets), using Node's built-in `fetch` |
| `template/pdf.css` | The PDF's design, with the brand colours as CSS variables at the top |
| `assets/` | Manrope (SIL Open Font License, `OFL.txt`) and the white Lyfeguard logo |
| `config.json` | Site and collection IDs, each collection's field names, call-to-action links and category names |
| `test/` | Tests for the rules above, and the sample guide |
