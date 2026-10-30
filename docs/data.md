# Data

Figures that change over time live in `data/`, not in the code.

- [Files](#files)
- [How the data gets into the code](#how-the-data-gets-into-the-code)
- [At each Budget](#at-each-budget)
- [Each April](#each-april)
- [New ONS tables](#new-ons-tables)

## Files

| File | Contents | Used by |
|---|---|---|
| `data/2026-27.json` | The 2026/27 tax year: Income Tax (including Scottish rates), National Insurance, student loans, auto-enrolment, the High Income Child Benefit Charge, Inheritance Tax bands, pensions (the lump sum allowance and the full State Pension), and the tax on buying a home (`propertyTax`: Stamp Duty, LBTT and LTT) | Every calculator that uses tax figures, through `LG.taxYear` and `LG.ukTax` |
| `data/ons-ashe-2026.json` | ONS ASHE salary tables by age, for everyone, men and women | Salary by Age |

Keys that start with `$` are notes (`$about`, `$checked`, `$source`), and the build leaves them out of the built files. Record in `$checked` when and against what the figures were last checked.

## How the data gets into the code

`src/lg-calc.js` has a marker where each file goes:

```js
var YEAR = (LG.taxYear = /* @data:2026-27 */ null);
```

When you build, `scripts/data.js` replaces each marker with the file's contents. `test/data.test.js` checks every figure is present and sensible: bands rise, and rates are fractions.

## At each Budget

Stamp Duty, LBTT and LTT rates change when the UK, Scottish or Welsh government announces them, often from a date that isn't 6 April. When one does, update `propertyTax` in the current data file and its `$source` and `$checked` notes, rebuild, update the snapshots and release before the new rates start. In Webflow, re-check the worked examples on the three Tools items.

## Each April

### In this repository

1. **Copy the data file** to the new year: `data/2026-27.json` to `data/2027-28.json`.
2. **Update every figure** from GOV.UK, including the Scottish rates and student loan thresholds, and update `$checked`.
3. **Point the marker** in `src/lg-calc.js` at the new file (`/* @data:2027-28 */`).
4. **Rebuild and test.** Where results change on purpose, update the snapshots (`UPDATE_SNAPSHOTS=1 npm test`) and review the diff.
5. **Release** ([releasing.md](releasing.md)).

### In Webflow

1. **Re-check the worked examples** in each Tools item's Extended Content. Any that use tax rates or allowances need new figures.
2. **Update the year in the SEO titles that carry one.** Take-Home Pay, Retirement Income, Pro Rata Salary, Inheritance Tax, Stamp Duty, LBTT and LTT say "2026/27", and Salary by Age says "2026".

## New ONS tables

Add the new file (`data/ons-ashe-2027.json`, in the same shape), point the marker in the Salary by Age module at it, rebuild, update the snapshots and update the year in Salary by Age's SEO title.
