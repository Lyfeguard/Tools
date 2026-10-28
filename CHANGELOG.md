# Changelog

## v1.4.0 – 2026-10-28
Visual update: all ten calculators now follow the Lyfeguard brand kit (v2.3). Calculations are unchanged.
- Colours: Ocean for text, headings and the dark results panels; Neon Mint for highlights on Ocean (bars, eyebrow labels, focus); Mint Ink for accents on light backgrounds (bars, borders, selected options, focus rings); Mist and Mist Alt for inputs and tinted areas; one secondary text colour (Ocean at 68%) in place of six greys; Ocean at 12% for lines.
- Accent text on light backgrounds is Ocean (Mint Ink is too light for text), and links get a Mint Ink underline.
- Corners: 20px for cards and panels, 14px for inputs, buttons and inner cards, 10px for small chips.
- Option switchers (age, hours/days, monthly/annual and similar) are a light Mist track with a faint line; the selected option is a raised white chip, with Mint only in the radio dot.
- Accessibility: text below WCAG AA contrast went from 31 elements to none across the calculators.
- Chart data colours and warning and error colours are unchanged.

## v1.3.0 – 2026-10-28
No visual change: every calculator's computed styles were checked against v1.2.1.
- CSS design tokens: the shared colours and fonts are defined once in `:root` (`--lg-navy`, `--lg-teal`, `--lg-line-soft`, `--lg-surface-tint`, `--lg-surface-input`, four `--lg-on-dark-*` colours for the dark results cards, and `--lg-font-body`, `--lg-font-heading`, `--lg-font-label`) and used in 241 places instead of repeated values.
- Each token keeps the exact value it replaced. Colours that differ slightly between calculators (the two accent and line colours, and six near-identical greys) are listed in the stylesheet for a later design pass rather than merged.
- The style tools ignore CSS custom properties and compare only the resulting styles.

## v1.2.1 – 2026-10-28
- Fix: v1.2.0 removed the fallback that styled savings goal, emergency fund, pro rata, salary by age and inheritance tax when the template wrapper has no `data-calc` attribute, so those calculators lost their layout. Each calculator's scoped styles now apply whenever its own markup is on the page (`:root:has(#...)`), so styling no longer depends on the template wrapper and `data-calc` is optional.
- New test (`test/styles.test.js`) renders every calculator with and without the template wrapper and requires identical styles. It fails on v1.2.0 for exactly those five calculators.
- CSS is 109 KB minified (v1.1.0: 128 KB).

## v1.2.0 – 2026-10-28
**Known issue, fixed in v1.2.1:** savings goal, emergency fund, pro rata, salary by age and inheritance tax lose their layout styles when the template wrapper has no `data-calc` attribute. Don't use this version.
- Tests: known-answer and snapshot tests for all ten calculators (`npm test`), a style comparison against any earlier release (`npm run style-diff`), and a GitHub check that runs the build and tests on every pull request.
- CSS 17% smaller (128 KB to 106 KB minified): removed a duplicate copy of the loan styles, the selectors that only served the old static pages (`.lg-calc-wrap:has(...)`), and styles for elements no longer in the markup (old in-card CTAs, IHT FAQ, breadcrumb and skip-link styles, unused compound interest and mortgage classes).
- JS: shared helpers for start-up, number input, money formatting and errors (`LG.start`, `LG.parseNumber`, `LG.money`, `LG.showError`), used by the loan, mortgage, compound interest and debt-to-income calculators.
- Loan, mortgage and compound interest fields now reject malformed numbers such as "1e5" or "1,0,0" instead of reading them as a value.
- Removed code that only served the old static pages (section ids and Webflow form handling).
- Pro rata: the higher-rate threshold is worked out from `LG.ukTax` instead of being typed in separately.

## v1.1.0 – 2026-10-28
- New Debt-to-Income Ratio calculator (key `debt-to-income`, markup in `markup/debt-to-income.html`).
- `npm run build` rebuilds `dist/` from `src/` in one step.

## v1.0.1 – 2026-10-23
- Calculators work in the Tools CMS template (no Webflow Form needed).
- IHT styles no longer depend on #iht-form.
- Rich Text wrapper resets for the template.
- Mortgage module no longer logs a warning on other calculators' pages.

## v1.0.0 – 2026-10-23
- Combined the CSS and JS for all nine calculators into one file each.
