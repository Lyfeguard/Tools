# Guide PDFs

Builds a branded PDF of every published guide from the Webflow CMS, uploads it to the site's assets and puts its link in the guide's **PDF Download** field. The gated download block on the Guides template (`webflow/download-block.html`) shows the link once someone has filled in the HubSpot form.

It runs on its own: the **Guide PDFs** workflow (`.github/workflows/guide-pdfs.yml`) checks every hour and rebuilds only the PDFs whose article has changed. It is separate from the calculators: its own `package.json`, its own tests, its own workflow, and nothing outside this folder apart from that workflow file.

## What's in a PDF
A cover (category, title, summary, main image, author, last reviewed date, reading time and a clickable contents list), the article, the FAQs linked to the guide, and a closing call to action with UTM tags (`utm_source=lyfeguard-pdf&utm_medium=download&utm_campaign=<slug>`), so sign-ups from PDFs show in GA4. Every page has a footer with the title, review date and page number.

The review date comes from "Last reviewed Month YYYY" in the article, or the publish month if there isn't one.

## How it decides what to build
- **Published content only.** It reads the live (published) items, so drafts and unpublished edits never reach a PDF.
- **A fingerprint of the content.** Each file is named `lyfeguard-<slug>-<8 characters>.pdf`, where the 8 characters are a fingerprint of everything the PDF shows: title, summary, body, image, category, call to action, author and FAQs. If the fingerprint of the live article differs from the file in the PDF Download field, the PDF is rebuilt. SEO fields and other changes that don't show in the PDF don't trigger a rebuild. To rebuild everything after a template change, bump `TEMPLATE_VERSION` in `lib/content.js` or run the workflow with **force**.
- **Bespoke PDFs are left alone.** If the field holds any other file (for example the fillable UK Life Admin Checklist on "What Is Life Admin?"), the guide is skipped. Empty the field to hand the guide back to the generator.
- **Old files are tidied up.** After a rebuild, generated PDFs that no guide links to any more (staged or live) and that are over two hours old are deleted from the assets. Only files named `lyfeguard-<known slug>-<fingerprint>.pdf` (or the pilot's `lyfeguard-<slug>.pdf`) are ever deleted.

## Link mode: staged or live
Set with the repository variable `PDF_LINK_MODE` (Settings > Secrets and variables > Actions > Variables).
- `staged` (default): the new link is saved to the CMS and goes live the next time the guide is published. Nothing is published by the workflow.
- `live`: the new link is written straight to the live site, but only for guides with no unpublished edits, and only the PDF Download field. Guides with pending edits fall back to staged.

## Set-up
1. In Webflow: Site settings > Apps & integrations > API access > Generate API token, with **CMS: read and write** and **Assets: read and write**.
2. In GitHub: Settings > Secrets and variables > Actions > New repository secret, named `WEBFLOW_TOKEN`. Without it, the workflow does nothing and says so.
3. Optional: add the variable `PDF_LINK_MODE` (see above).
4. Run the workflow by hand once (Actions > Guide PDFs > Run workflow) with **dry run** ticked, and check the PDFs in the run's artifacts. Then run it without dry run.

GitHub turns off scheduled workflows in public repositories after 60 days without a commit. If the PDFs stop updating, re-enable the workflow on the Actions tab.

## Running it locally
Needs Node.js 22.
```
cd pdf-generator
npm ci
npx playwright install chromium
npm test                                     # sample guide in test/fixtures (made-up content)
WEBFLOW_TOKEN=... node sync.js plan          # what would be rebuilt; changes nothing
WEBFLOW_TOKEN=... node sync.js run --dry-run # build into out/ without uploading
node sync.js run --fixtures <dir>            # build from saved items.json, faqs.json and authors.json
```
`out/` is git-ignored. Keep it that way, and never commit real CMS exports or built PDFs: this repository is public and jsDelivr serves every committed file.

## Files
- `sync.js`: the command the workflow runs (plan, build, upload, link, tidy up).
- `lib/content.js`: fingerprints, file names, which files may be replaced or deleted. No network.
- `lib/render.js`: the HTML for a guide, the clean-up of Webflow rich text (hidden heading anchors, table embeds, inline styles, relative links) and the PDF print.
- `lib/webflow.js`: the Webflow API calls (items, live items, assets) using Node's built-in `fetch`.
- `template/pdf.css`: the PDF's design. Brand colours as CSS variables at the top.
- `assets/`: Manrope (SIL Open Font License, `OFL.txt`) and the white Lyfeguard logo.
- `config.json`: site, collection and field IDs, call-to-action links and category names.
- `webflow/download-block.html`: the gated download block for the Guides template, with set-up notes for Webflow and HubSpot.
- `test/`: tests for the rules above and a render of the sample guide.

## Insights
Switched off in `config.json` until the Insights collection has a PDF Download field and a demo link for the call to action (`ctaUrl`). Then set `enabled` to `true`.
