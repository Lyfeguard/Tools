# PDFs and downloads

Guides, Insights and calculators all offer a branded PDF behind the same email-gated dialog.

- [The download dialog](#the-download-dialog)
- [HubSpot](#hubspot)
- [Calculator PDF summaries](#calculator-pdf-summaries)
- [Tests](#tests)

## The download dialog

`src/lg-dl.js` and `src/lg-dl.css` are built to `dist/lg-dl.min.js`, one file with its styles.

- **Where it's used.** On the Guides and Insights templates, a `.lg-dl` block in a Code Embed loads the dialog ([webflow.md](webflow.md#guides-and-insights-download-embeds)). On calculators, the "Download PDF summary" button loads it.
- **The form.** The dialog holds a HubSpot form, which loads only when the dialog opens, so it adds nothing to page load. If the form is blocked (by an ad blocker, say), the dialog shows a fallback link.
- **Remembering who has asked.** It remembers each download someone has given their email for, in `localStorage` under `lg-dl-ok:<type>:<slug>`, and gives them that file straight away next time. A new guide, insight or calculator asks again, so HubSpot records every download. HubSpot usually fills in the form for returning contacts.
- **What HubSpot gets.** It fills the hidden fields `last_resource_requested` and `last_resource_url`.
- **Tracking.** It pushes `pdf_download` to the dataLayer ([analytics.md](analytics.md#downloads)).
- **Other forms.** Success events from other HubSpot forms on the page, such as a newsletter sign-up, don't reveal the download.

### Block attributes

A block is a `<div class="lg-dl">` around a `.lg-dl-trigger` button.

| Attribute | Value |
|---|---|
| `data-pdf` | The PDF's address. The block hides itself without one. |
| `data-name`, `data-slug` | The article's name and slug |
| `data-title` | Optional. The dialog heading becomes "Get" plus this title, instead of "Get this guide as a PDF". |
| `data-type` | `guide` (the default) or `insight` |
| `data-form-id` | The HubSpot form |
| `data-portal-id`, `data-region` | Optional. They default to the portal and region below. |

## HubSpot

All three forms are in portal `139576714`, region `eu1`.

| Used by | Form ID |
|---|---|
| Guides | `bd1160d4-2c27-4e02-a991-abb4c2319fa5` |
| Insights | `6702e583-4328-40b1-a84d-58f41a01e327` |
| Calculators | `9d095c21-3177-42e8-9862-64228125f64d` |

Each form needs the hidden fields `last_resource_requested` and `last_resource_url`.

## Calculator PDF summaries

- **The button.** `src/v2/download.js` adds "Download PDF summary" at the end of each calculator's results panel. It shows only once someone has used the calculator and there's a result, so search engines see the page unchanged. Its styles (`src/v2/download.css`) use `!important`, so a calculator's own rules can't restyle it.
- **Loading.** Nothing loads until the button is pressed. Then the dialog (`dist/lg-dl.min.js`) and the PDF writer (`dist/v2/lg-pdf.min.js`) load from the same release as the calculator.
- **The PDF.** `src/v2/pdf.js` makes the PDF in the browser from what the calculator shows: the fields filled in, the headline result, the results panels, any tables and "How this was calculated". The figures never leave the page; HubSpot gets only the calculator's name and the page's address.
- **The design** follows the guide PDFs (`pdf-generator/template/pdf.css`). It uses Manrope, fetched from `pdf-generator/assets/fonts/` when needed, and the logo from `pdf-generator/assets/logo/`, so keep those paths.
- **Links** in the PDF carry `utm_source=lyfeguard-pdf&utm_medium=download&utm_campaign=<key>-calculator`.
- **No set-up per calculator.** A new calculator gets its PDF from its markup.

## Tests

`test/pdf.test.js` makes every calculator's PDF and reads it back with poppler's `pdftotext` and `pdfinfo`. It also checks the dialog, the hidden fields, the tracking and the Guides block. CI installs `poppler-utils`; locally, install poppler ([development.md](development.md#setting-up)).
