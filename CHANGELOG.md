# Changelog

## v1.2.0 – 2026-10-28
No visual or calculation changes: every calculator's results and styles were checked against v1.1.0.
- Tests: known-answer and snapshot tests for all ten calculators (`npm test`), a style comparison against any earlier release (`npm run style-diff`), and a GitHub check that runs the build and tests on every pull request.
- CSS 15% smaller (128 KB to 109 KB minified): removed a duplicate copy of the loan styles and styles for elements no longer in the markup (old in-card CTAs, IHT FAQ, breadcrumb and skip-link styles, unused compound interest and mortgage classes).
- JS: shared helpers for start-up, number input, money formatting and errors (`LG.start`, `LG.parseNumber`, `LG.money`, `LG.showError`), used by the loan, mortgage, compound interest and debt-to-income calculators.
- Loan, mortgage and compound interest fields now reject malformed numbers such as "1e5" or "1,0,0" instead of reading them as a value.
- Removed code that only served the old static pages (section ids and Webflow form handling).
- Styling no longer depends on the template wrapper: each calculator's scoped styles apply whenever its own markup is on the page (`:root:has(#...)`), so `data-calc` on `.lg-calc-wrap` is optional. A new test renders every calculator without the wrapper and requires identical styles.
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
