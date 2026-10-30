# Webflow

How the site uses this repository, and who edits what.

- [Overview](#overview)
- [Tools collection fields](#tools-collection-fields)
- [Tools template](#tools-template)
- [Guides and Insights template heads](#guides-and-insights-template-heads)
- [Guides and Insights download embeds](#guides-and-insights-download-embeds)
- [Site-wide custom code](#site-wide-custom-code)
- [Social sharing images](#social-sharing-images)

## Overview

| | |
|---|---|
| Site ID | `69d54ef24a10ef9131d434dc` |
| Tools collection ID | `6adb231bd68542e4dfb08593` |
| Tools item IDs | [`webflow/cms-items.json`](../webflow/cms-items.json) |
| Canonical address | `https://lyfeguard.com` (not `www`) |
| Staging | The site's webflow.io subdomain. It shares the live CMS: staged changes show there when you publish to the subdomain only, and go live with the next publish to the custom domains. |

## Tools collection fields

Each calculator page is one item. A field is edited either by people in Webflow or by code, never both.

### Edited in Webflow

The name, SEO title and description, Quick Answer, At a Glance, Extended Content (including the worked examples and "How we calculate"), FAQs, Guides, Glossary, the call to action, the Icon and the Social Image.

These hold the page's written content. Don't copy them into this repository.

### Managed by code (don't edit)

| Field | Slug | Holds |
|---|---|---|
| Calculator markup ("Embed") | `embed` | `markup/<key>.html`, as one embed block |
| Component Key | `component-key` | The calculator's key, which names its files |
| Release | `release` | The release tag the page loads its calculator from |

The **Release to Webflow** workflow writes these fields ([releasing.md](releasing.md)), and anything typed into them is overwritten. Never edit the markup in Webflow's editor, which drops parts of it.

## Tools template

### Head code

Page settings > Custom code > Inside `<head>` tag holds [`webflow/template-head.html`](../webflow/template-head.html), with each `{{...}}` inserted as a field through "+ Add field". It changes only for a new major version.

### Page settings

- **SEO title and description** are bound to the item's SEO fields.
- **The Open Graph image** is bound to Social Image.
- **The structured data** is set in the template's page settings, not in the head code.

### Layout

- The Calculator markup field sits in the template's embed slot (`.lg-tools-embed-slot`). Keep `overflow-x: auto` off that slot: it stops the sticky result bar sticking on phones.
- The calculators style and lay themselves out, so they don't depend on the template's classes.

## Guides and Insights template heads

Page settings > Custom code > Inside `<head>` tag, on both templates, holds [`webflow/content-head.html`](../webflow/content-head.html): one line loading `dist/lg-content.min.css` from `@2`. It styles the tables, short answers and notes written in the rich text ([content-blocks.md](content-blocks.md)). It changes only for a new major version.

## Guides and Insights download embeds

Each template has one Code Embed for the gated PDF download, which loads `dist/lg-dl.min.js` from `@2`:

| Template | Embed | PDF field | HubSpot form |
|---|---|---|---|
| Guides | [`webflow/guides-download-embed.html`](../webflow/guides-download-embed.html) | PDF Download | `bd1160d4-2c27-4e02-a991-abb4c2319fa5` |
| Insights | [`webflow/insights-download-embed.html`](../webflow/insights-download-embed.html) | PDF Link | `6702e583-4328-40b1-a84d-58f41a01e327` |

- **Fields.** Insert each `{{wf:...}}` placeholder with "+ Add Field".
- **Visibility.** Keep conditional visibility on the wrapper, so it shows only when the PDF field is set. A block without a PDF also hides itself.
- **The PDF.** The [PDF generator](../pdf-generator/README.md) fills in the PDF field.

[pdf-downloads.md](pdf-downloads.md) explains how the dialog works.

## Site-wide custom code

This lives in Site settings > Custom code. Don't change it without agreeing it first: it runs on every page.

### Head

Google Tag Manager's standard snippet, which also records when the page started loading (`gtm.start`):

```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PLZ6Q89');</script>
<!-- End Google Tag Manager -->
```

### Footer

The click tracking:

```html
<script src="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@2/dist/lg-track.min.js" defer></script>
```

`@2` serves the newest 2.x release, and the release workflow refreshes jsDelivr's copy, so this line doesn't change between releases. [analytics.md](analytics.md) lists what it sends.

## Social sharing images

Each Tools item's Social Image field holds the page's Open Graph image, which LinkedIn, WhatsApp and Slack show when the page is shared. The images are 1200 x 630 and follow the guide PDFs' style: the calculator's name and icon on navy, with the Lyfeguard logo. Any of them can be replaced in Webflow.

For a new calculator:

```bash
node scripts/social-images.js "Mortgage Calculator" icon.svg
```

`icon.svg` is the SVG from the calculator's Icon field. The image is written to `out/social/`, which git ignores. Upload it to the item's Social Image field.
