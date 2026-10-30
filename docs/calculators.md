# Writing a calculator

- [Markup pattern](#markup-pattern)
- [Shared behaviours](#shared-behaviours)
- [JavaScript](#javascript)
- [Adding a calculator](#adding-a-calculator)
- [Calculators that work together](#calculators-that-work-together)

## Markup pattern

New calculators follow `markup/retirement-income.html` and `markup/take-home-pay.html`.

- **One root element**, inside the component:

  ```html
  <lg-calculator key="<key>">
    <div class="lg-calc" data-calc="<key>" id="<prefix>"> ... </div>
  </lg-calculator>
  ```

  The root does its own spacing, and its layout responds to its own width through container queries. Nothing depends on the Webflow template.
- **The ten older calculators** add `lg-calc-classic` to the root. That keeps their own styles and switches off the base text styles meant for new calculators.
- **Shared components.** Use the `lgc-` components in `src/lg-calc.css`: cards, fields, the option switcher, stats, comparison cards, the chart, the table and the sticky result bar.
- **Accessible fields.** Every input has a `<label>`, a hint and an error line linked with `aria-describedby`, plus `inputmode` and `enterkeyhint`. Groups of fields and radio buttons sit in a `<fieldset>` with a `<legend>`.
- **Errors and announcements.** One error summary (`role="alert"`) goes at the top of the form, with a "Clear figures" button. One short screen-reader announcement (`aria-live`) plays once typing pauses; it doesn't read out the whole results panel.
- **Accessible charts.** Charts are SVG with a text description (`role="img"` and `aria-label`), and the same figures are in a table.
- **Nothing inline.** No inline styles and no `<script>` in the markup.

## Shared behaviours

These are switched on by attributes in the markup (`src/v2/shared.js`).

| Markup | Behaviour |
|---|---|
| `<div class="lgc-sticky" data-source="id" data-results="id" hidden>` with a `[data-sticky-value]` inside | A result bar at the bottom of narrow screens while the results are below. Add `data-source-label="id"` to keep its label in step with a heading that changes. |
| `<p class="lgc-sr-only" aria-live="polite" data-announce="id id">` | Reads out those elements once typing pauses, and stays silent while any of them shows a dash. `data-announce-prefix` adds a lead-in. |
| `<button type="button" data-clear>` | Puts every field back to how the page loaded it, then lets the calculator update. |
| `<input data-format="money">` | Tidied to 12,500 style when the field loses focus. |

The "Download PDF summary" button needs no markup. It's added after the result bar's results panel and builds the PDF from what the calculator shows ([pdf-downloads.md](pdf-downloads.md)).

## JavaScript

Each calculator's module lives in `src/lg-calc.js`, between `/* @v2:<key>-start */` and `/* @v2:<key>-end */`.

- **Start-up.** Start with `LG.start`, which also reports missing elements.
- **Find elements in the shadow root.** Look them up through the `get` that `LG.start` passes to setup, or `root.getRootNode()`, never `document`.
- **Read numbers** with `LG.parseNumber`, never `parseFloat` on user input.
- **Format** with `LG.money` and `LG.percent`. Show errors with `LG.markInvalid` and `LG.showError`.
- **Use the data files.** Take tax figures from `LG.ukTax` and `LG.taxYear` ([data.md](data.md)), never typed into the code.

## Adding a calculator

1. Write `markup/<key>.html` to the [pattern](#markup-pattern), wrapped in `<lg-calculator key="<key>">`.
2. Add its styles to `src/lg-calc.css`, using the design tokens, and its module to `src/lg-calc.js` between the `@v2:<key>` comments.
3. Add the key to `CALCULATORS` in `scripts/build-v2.js`. If calculators share code, put it between its own `@v2:<name>` comments and list it for each of them in `USES` there, as the Stamp Duty, LBTT and LTT calculators do with `property-tax`.
4. Add its scenarios to `test/scenarios.js`, and hand-worked answers to `test/known-answers.test.js`.
5. Build, then create the snapshots with `UPDATE_SNAPSHOTS=1 npm test`, and review them.
6. In Webflow, create the Tools item and fill in its editable fields ([webflow.md](webflow.md#tools-collection-fields)). Add its key, slug and item ID to `webflow/cms-items.json`.
7. Make its social image ([webflow.md](webflow.md#social-sharing-images)).
8. Release. The workflow writes its markup, Component Key and Release ([releasing.md](releasing.md)).

## Calculators that work together

A calculator can pass its figures on to another with a "Use these figures" link.

| From | To |
|---|---|
| Take-Home Pay | Debt-to-Income |
| Mortgage | Debt-to-Income |
| Pro Rata Salary | Take-Home Pay |
| Salary by Age | Take-Home Pay |
| Emergency Fund | Savings Goal |
| Net Worth | Inheritance Tax |
| Stamp Duty, LBTT, LTT | Each other (the price and the kind of buyer) |

- **The links are in the HTML.** `markup/links.js` lists them. After you edit it, run `node scripts/links.js`, which writes them into `markup/<key>.html` as plain internal links, just before the result bar. `node scripts/links.js --check` lists any markup that's out of date.
- **The figures travel in the URL fragment.** As a link is opened (click, middle-click, "Open in new tab", keyboard or long press), `src/v2/handoff.js` adds the figures after the `#`. The fragment is never sent to the server, and the click tracking records the link without it.
- **The receiving calculator checks what it gets.** It accepts only plain numbers, and only into its own fields. It says where the figures came from, then takes them out of the address.
- **Net Worth** hands over figures only when they were entered for one person, because Inheritance Tax works on one person's estate. Its note asks for the questions about the home and who inherits, which the estimate needs.
- **Stamp Duty, LBTT and LTT** each link to the other two nations' calculators, so the three pages point searchers to the right one. Wales has no first-time buyer relief, so a first-time buyer arrives there as buying their main home.

`test/links.test.js` checks the markup has the links, and `test/handoff.test.js` checks every link fills the right fields.
