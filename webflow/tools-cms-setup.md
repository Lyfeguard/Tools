# Tools CMS template: setup guide (lg-calc v1.8.5)

## 1. Host the two files
Upload `lg-calc.min.css` and `lg-calc.min.js` (v1.8.5) to your host and pin the version in the URL.
- jsDelivr from GitHub: `https://cdn.jsdelivr.net/gh/<org>/<repo>@v1.8.5/lg-calc.min.js`. Add `cdn.jsdelivr.net` to the CSP `script-src` and `style-src`, and add `<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>` to the site head.
- Cloudflare on your own domain: no CSP or preconnect change needed.

## 2. Collection fields (collection "Tools", currently slug `tool`)
| Field | Type | Notes |
|---|---|---|
| Name | built-in | e.g. Loan Repayment Calculator. Used in breadcrumb and schema |
| Slug | built-in | must match today's URL, e.g. `loan-repayment-calculator` |
| Calculator key | Plain text | net-worth, inheritance-tax, compound-interest, savings-goal, emergency-fund, loan-repayment, pro-rata-salary, salary-by-age, mortgage, debt-to-income, retirement-income, take-home-pay |
| H1 | Plain text | |
| Hero intro | Plain text | optional; nw, iht, ci, lc, mc, dti, ri, thp |
| Quick answer | Rich text | optional; sg, ef, pr, sa. Start with bold "Quick answer" |
| Calculator markup | Rich text | one Custom Code block, pasted from `markup/<key>.html` |
| Explainer | Rich text | the "how to use / how it works" copy below the calculator |
| FAQs | Multi-reference or Rich text | |
| Related guides | Multi-reference to Guides | |
| Show results CTA | Switch | |
| CTA heading, CTA body, CTA benefit 1-3, CTA button label, CTA button link, CTA tracking location, CTA tracking ID | Plain text / Link | only needed where the CTA is on |
| Meta title, Meta description | Plain text | bound in template SEO settings |
| Open Graph image | Image | |
| App description, Feature list | Plain text | schema only; features separated by "; " |
| Date modified | Plain text | YYYY-MM-DD |

Keep double quotes and & out of fields used in the schema; use the curly apostrophe (’).

## 3. Template structure
```
Section (current calculator section classes)
  Container
    Div  .lg-calc-wrap            attribute data-calc = Calculator key (optional, see below)
      Div .lg-heading-wrap.calculator
        Breadcrumb (Home / Tools / Name)
        H1  id="calc-heading"      ← H1
        Paragraph .lg-paragraph-hero        ← Hero intro    (visible if set)
        Rich Text .lg-paragraph-hero-calc  ← Quick answer  (visible if set)
      Rich Text .lg-calc-markup    ← Calculator markup
      Div .lg-result-cta           (visible if Show results CTA is on)
Section  Explainer (Rich Text, lg-rich-text-tools)
Section  FAQs
Section  Related guides
```
- No Form element. v1.0.1 runs without one.
- From v1.2.1 each calculator's styles are found from its own markup, so the `data-calc` attribute is optional. It's still a useful label, and harmless to keep.
- From v1.7.0 each embed carries its own `.lg-calc` root, and the phone layouts depend on it: an embed pasted before v1.7.0 loses its phone layout with the v1.7.0 head code. Re-paste every embed when you move the head code to v1.7.0.
- The Rich Text must have class `lg-calc-markup` and sit directly inside `.lg-calc-wrap`.

## 4. Template head code
Page settings → Custom code → Inside head: paste `template-head.html`, replace YOUR-HOST, and swap each {{...}} for the field via "+ Add field".
SEO settings: Title ← Meta title, Description ← Meta description; Open Graph ← same plus OG image.

## 5. Fill the items
One item per calculator, saved as draft. In "Calculator markup": + → Custom code → paste the whole of `markup/<key>.html`.

## 6. Test at /tool/<slug> on the webflow.io staging domain
Fill each calculator, check results, downloads (net worth, IHT, savings goal), and the browser console for errors.

## 7. Switch over in one publish
1. Delete the nine static pages and the tools folder.
2. Collection settings → rename to Tools, slug `tools`.
3. Publish, then re-test the live URLs and re-run PageSpeed.

## v2: `<lg-calculator>`
The staging site (lyfeguard-stage.webflow.io) is the Webflow subdomain of the live site, so they share the CMS: a staged CMS change shows on staging when you publish to the Webflow subdomain only, and goes live with the next publish to the custom domains.
- Template head code: `lg-calc` v1.8.5 and `<script src="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@v2.0.0-alpha.4/dist/v2/lg-calculator.min.js" defer></script>`. Update these before any item gets `<lg-calculator>` markup (older versions hide it).
- The Calculator markup field ("Embed", slug `embed`) holds `markup/<key>.html`, written by Claude through the Webflow CMS API (`scripts/webflow-markup.js`); item ids are in `cms-items.json`. A calculator moved to v2 has its markup wrapped in `<lg-calculator key="...">`, still in the field, so the page HTML is the same as before.
- The Code Embed added for the v2 pilot (`<lg-calculator key="{Calculator key}">` after the Rich Text) isn't needed. While it's there it shows nothing and takes no space; remove it when convenient.
- Keep `overflow-x: auto` off `.lg-tools-embed-slot` (it stops the sticky result bar sticking on phones).
