# Architecture

How the calculators are built, served and kept safe for search engines.

- [What a page loads](#what-a-page-loads)
- [The `<lg-calculator>` component](#the-lg-calculator-component)
- [SEO](#seo)
- [Source and build](#source-and-build)
- [Built files](#built-files)
- [The v1 reference build](#the-v1-reference-build)

## What a page loads

| File | Loaded by | Version |
|---|---|---|
| `dist/v2/<key>.min.css` | Tools template head | `@{{Release}}` (the item's Release field) |
| `dist/v2/<key>.min.js` | Tools template head | `@{{Release}}` |
| `dist/lg-track.min.js` | Site-wide footer, every page | `@2` |
| `dist/lg-dl.min.js` | Guides and Insights embeds, and calculators when the PDF button is pressed | `@2` on articles; the calculator's release on calculators |
| `dist/v2/lg-pdf.min.js` and the Manrope fonts | Calculators, when a PDF is downloaded | The calculator's release |

All of them come from jsDelivr (`https://cdn.jsdelivr.net/gh/Lyfeguard/tools@<version>/...`). A calculator page loads 10 to 21 KB gzipped. Nothing else loads until someone asks for a PDF.

## The `<lg-calculator>` component

`markup/<key>.html` wraps each calculator in `<lg-calculator key="<key>">`. When the script runs, the element:

1. moves its markup into its own shadow root, together with that calculator's styles, so the site's CSS can't change the calculator;
2. starts the calculator's module there (`LG.start`), with the shared behaviours looked up inside the shadow root;
3. adds the "Download PDF summary" button and the analytics events.

The element waits for a calculator that registers later (`LG.waiting`, `LG.styles[key]` in `src/v2/prelude.js` and `src/v2/element.js`), so the order the scripts load in doesn't matter.

## SEO

The calculators exist for search, so the HTML that crawlers read must not change.

- **The markup stays in the page HTML.** It's in the CMS field, not added by script. Crawlers that don't run JavaScript read it as it is. Google flattens shadow DOM when it renders, so it sees the same text.
- **It works without JavaScript.** `dist/v2/<key>.min.css` styles the markup on the page, so it looks right before the script runs, and if the script never loads.
- **No hidden extras.** The PDF button appears only after someone has used the calculator. The "Use these figures" links are plain internal links in the markup.
- **Tests prove it.** `test/v2.test.js` checks each calculator has the same text and headings without JavaScript and once rendered.

## Source and build

Each piece of code is written once. `npm run build` runs `scripts/build.sh`, which:

1. puts the data files into the code (`scripts/data.js`, at each `/* @data:<name> */ null` marker);
2. builds `dist/lg-calc.min.*`, the [v1 reference build](#the-v1-reference-build);
3. builds the v2 files (`scripts/build-v2.js`), taking from `src/lg-calc.js` the tax core and each calculator's module (between `/* @v2:<key>-start */` and `/* @v2:<key>-end */`), plus any code it shares with others (`USES`), and from `src/lg-calc.css` the shared components and design tokens;
4. builds the files around the calculators (`scripts/build-extras.js`): the download dialog, the PDF writer (including the logo, turned into PDF drawing operators) and the click tracking;
5. minifies everything with terser and fails if any source or built file isn't ASCII-only.

### Where the code lives

| Source | Contents |
|---|---|
| `src/lg-calc.js` | The tax core, shared helpers (`LG.start`, `LG.parseNumber`, `LG.money` and so on) and every calculator's module |
| `src/lg-calc.css` | Design tokens, the shared `lgc-` components and every calculator's styles |
| `src/v2/prelude.js` | Start-up and the version (`LG.version`) |
| `src/v2/element.js` | The `<lg-calculator>` element |
| `src/v2/shared.js` | Shared behaviours (result bar, announcements, Clear figures, money formatting), looked up inside the shadow root |
| `src/v2/track.js` | The calculator analytics events |
| `src/v2/handoff.js` | Sending and receiving figures between calculators |
| `src/v2/download.js`, `download.css` | The "Download PDF summary" button |
| `src/v2/pdf.js` | The PDF writer |
| `src/lg-dl.js`, `lg-dl.css` | The email-gated download dialog |
| `src/lg-track.js` | The site-wide click tracking |

### Each calculator's styles

A calculator gets only the rules of `src/lg-calc.css` whose classes and ids it uses. These can appear in its markup, its module or the shared component code, or be built in its code from a quoted prefix (`'lgdti-band-' + name`). `scripts/css-subset.js` does the selection: classes inside `:not()` don't count, and `:is()` needs only one of its alternatives.

`scripts/build-v2.js` adds a small base layer that reproduces what the site's base styles gave the calculators on the page: body font and line height, paragraph and label spacing, link font and border-box sizing. The tests prove each calculator looks the same with its own styles as with the whole stylesheet, with JavaScript and without.

## Built files

| File | Contents |
|---|---|
| `dist/v2/<key>.min.js` | The component, the shared code and one calculator's module, with its styles for the shadow root |
| `dist/v2/<key>.min.css` | The same styles for the page |
| `dist/v2/lg-calculator.min.js` | Every calculator in one file, for a page with several |
| `dist/v2/lg-pdf.min.js` | The PDF writer |
| `dist/lg-dl.min.js` | The download dialog, with its styles |
| `dist/lg-track.min.js` | The click tracking |
| `dist/lg-calc.min.css`, `dist/lg-calc.min.js` | The v1 reference build |

CI rebuilds `dist/` on every pull request and fails if it differs from what's committed.

## The v1 reference build

v1 put every calculator into one stylesheet and one script, outside any shadow root. The site no longer loads it. It's still built, at 1.9.0, because the tests use it as the reference:

- `test/calculators.test.js` checks v1's figures against the snapshots;
- `test/v2.test.js` checks v2 gives the same figures, text and look as v1;
- `npm run style-diff` compares v1's computed styles with an earlier release.
