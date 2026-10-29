# Site-wide custom code (Site settings > Custom code)

Analytics run through Google Tag Manager (GTM-PLZ6Q89), which sends to GA4.
The click tracking that was pasted into the footer now lives in this
repository (`src/lg-track.js`, built to `dist/lg-track.min.js`), so it's
versioned and tested like the calculators. It also tracks clicks inside the
calculators, which the pasted copy couldn't see.

## Head code
Replace the line

```html
<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-PLZ6Q89"></script>
```

with Google's standard snippet, which also records when the page started
loading (`gtm.start`, used by GTM's page view and timing triggers):

```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PLZ6Q89');</script>
<!-- End Google Tag Manager -->
```

Leave everything else in the head as it is.

## Footer code
Replace both scripts (the `gtag('js', ...)` one, which nothing uses, and
the click tracking) with:

```html
<script src="https://cdn.jsdelivr.net/gh/Lyfeguard/tools@2/dist/lg-track.min.js" defer></script>
```

`@2` is the newest 2.x release, so this line doesn't change between releases:
the **Release to Webflow** workflow refreshes jsDelivr's copy each time.
A v3 would be switched to here by hand.

## What gets sent
Everything is a `lyf_event` push to the dataLayer, as before:
`ga4_event_name`, `cta_action`, `element_id`, `element_text`,
`element_location`, `audience`, and `content_topic`, `variant` and `link_url`
where they apply.

- Clicks anywhere on the site: exactly as before (a test replays the old
  footer code and the new file on the same clicks). Two fixes: a button with
  `data-track-event` and no link is tracked as itself (it was logged as a
  link to "/null"), and links to a spot on the same page (contents lists,
  "See results") aren't counted as visits.
- Clicks inside a calculator: `element_location` is `calculator`.
- The calculators' own events (from `dist/v2/<key>.min.js`), with
  `element_location: calculator`, `audience: consumer` and
  `content_topic` the calculator's key:
  `calculator_start`, `calculator_result`, `calculator_see_results`,
  `calculator_download`, `calculator_pdf_request`, `calculator_clear`,
  `calculator_handoff` (a "Use these figures" link) and
  `calculator_error`. Never the figures entered.
- PDF downloads (guides, insights and calculators): `pdf_download`, as
  before, with `resource_type`.

In GTM, check the GA4 event tag that fires on `lyf_event`: if its event
name is the `ga4_event_name` variable, the calculator events arrive in GA4
with no change. If it lists event names, add the eight above. To report on
them by calculator, register `content_topic` as a custom dimension in GA4
if it isn't one already.
