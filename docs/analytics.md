# Analytics

Analytics run through Google Tag Manager (`GTM-PLZ6Q89`), which sends to GA4. Everything is a `lyf_event` push to the dataLayer.

- [Sources](#sources)
- [Fields](#fields)
- [Events](#events)
- [Privacy](#privacy)
- [GTM and GA4 set-up](#gtm-and-ga4-set-up)

## Sources

| Source | Built to | Loaded | Tracks |
|---|---|---|---|
| `src/lg-track.js` | `dist/lg-track.min.js` | The site-wide footer, every page ([webflow.md](webflow.md#site-wide-custom-code)) | Clicks anywhere on the site, including inside calculators' shadow roots |
| `src/v2/track.js` | Each `dist/v2/<key>.min.js` | Calculator pages | The calculator events |
| `src/lg-dl.js` | `dist/lg-dl.min.js` | When a download dialog opens | PDF downloads |

## Fields

Every push carries `ga4_event_name`, `cta_action`, `element_id`, `element_text`, `element_location` and `audience`, plus `content_topic`, `variant` and `link_url` where they apply.

## Events

### Clicks

The click tracking replaced the code that used to be pasted into the footer, and records the same events (`test/analytics.test.js` replays the old code, `test/fixtures/lg-track-before.js`, and the new file on the same clicks). It differs in three ways:

- clicks inside a calculator are tracked, with `element_location: calculator`;
- a button with `data-track-event` and no link is tracked as itself (the old code logged it as a link to "/null");
- links to a spot on the same page (contents lists, "See results") aren't counted as visits.

### Calculator events

These are sent with `element_location: calculator`, `audience: consumer` and `content_topic` set to the calculator's key.

| Event | When |
|---|---|
| `calculator_start` | The first change to a field |
| `calculator_result` | The first result shown after that |
| `calculator_see_results` | "See results" in the result bar |
| `calculator_download` | An Excel or CSV download |
| `calculator_pdf_request` | "Download PDF summary" |
| `calculator_clear` | "Clear figures" |
| `calculator_handoff` | A "Use these figures" link to another calculator |
| `calculator_error` | The first error message shown |

### Downloads

`pdf_download` is sent when someone downloads a PDF from a guide, an insight or a calculator. It carries `resource_slug`, `resource_title` and `resource_type` (`guide`, `insight` or `calculator`).

## Privacy

No event ever carries the figures someone enters. The figures passed between calculators travel in the URL fragment, which isn't sent to the server, and the click tracking records links without it.

## GTM and GA4 set-up

- **Event names.** Check the GA4 event tag that fires on `lyf_event`. If its event name is the `ga4_event_name` variable, the calculator events arrive in GA4 with no change. If it lists event names, add the eight calculator events.
- **Reporting by calculator.** Register `content_topic` as a custom dimension in GA4, so the events can be reported by calculator.
