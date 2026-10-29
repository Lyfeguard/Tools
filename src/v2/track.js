  /* ------------------------------------------------------------------
     Analytics: what people do in a calculator, as lyf_event pushes to the
     dataLayer (GA4 through GTM), in the same shape as the site's click
     tracking (dist/lg-track.min.js). Never the figures entered.
       calculator_start         first change to a field
       calculator_result        first result shown after that
       calculator_see_results   "See results" in the result bar
       calculator_download      an Excel or CSV download
       calculator_pdf_request   "Download PDF summary"
       calculator_clear         "Clear all"
       calculator_error         the first error message shown
     ------------------------------------------------------------------ */
  function slug(value) {
    return String(value || '').toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 80);
  }
  function pushEvent(key, name, action, text) {
    var page = slug(location.pathname.replace(/\/+$/, '')) || 'homepage';
    var data = {
      event: 'lyf_event',
      ga4_event_name: name,
      cta_action: action,
      element_id: [page, 'calculator', action].join('_').substring(0, 150),
      element_text: String(text || '').replace(/\s+/g, ' ').trim().substring(0, 100),
      element_location: 'calculator',
      audience: 'consumer',
      content_topic: slug(key),
    };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(data);
  }
  LG.track = pushEvent;

  function addTracking(scope, key) {
    var once = {};
    function first(name, action, text) {
      if (once[name]) return;
      once[name] = true;
      pushEvent(key, name, action, text);
    }
    var started = false;
    function start() {
      started = true;
      first('calculator_start', 'start');
      result();
    }
    scope.addEventListener('input', start);
    scope.addEventListener('change', start);

    var parts = resultParts(scope);
    function result() {
      if (started && parts.value && !NO_RESULT.test(parts.value.textContent.replace(/\s+/g, ' ').trim())) first('calculator_result', 'result');
    }
    if (parts.value) new MutationObserver(result).observe(parts.value, { childList: true, characterData: true, subtree: true });

    scope.addEventListener('click', function (event) {
      var el = event.target.closest && event.target.closest('a, button');
      if (!el) return;
      var text = el.textContent;
      if (el.matches('.lgc-sticky-link')) pushEvent(key, 'calculator_see_results', 'see_results', text);
      else if (el.matches('.lgc-pdf-button')) pushEvent(key, 'calculator_pdf_request', 'pdf_request', text);
      else if (el.matches('[data-clear], [id$="-clear"], [id$="-reset"]')) pushEvent(key, 'calculator_clear', 'clear', text);
      else if (el.matches('[id$="-download"]')) pushEvent(key, 'calculator_download', /csv/i.test(text) ? 'download_csv' : 'download_excel', text);
    });

    // Error messages: role="alert" elements that show with text.
    var alerts = [].slice.call(scope.querySelectorAll('[role="alert"]'));
    function error() {
      alerts.forEach(function (el) {
        var text = el.textContent.replace(/\s+/g, ' ').trim();
        if (started && text && !el.hidden && el.getClientRects().length) first('calculator_error', 'error', text);
      });
    }
    alerts.forEach(function (el) {
      new MutationObserver(error).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    });
  }
