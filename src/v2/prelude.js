  /* ------------------------------------------------------------------
     <lg-calculator> component (v2): set-up shared by the calculators.
     The tax core and each calculator's module are copied in from
     src/lg-calc.js by scripts/build-v2.js, so both versions share them.
     ------------------------------------------------------------------ */
  var LG = (window.LyfeCalculators = window.LyfeCalculators || {});
  LG.version = '2.4.0';
  LG.calculators = LG.calculators || {};
  // Each calculator's styles (from whichever file brought it), and the
  // elements on the page waiting for a calculator that hasn't loaded yet.
  LG.styles = LG.styles || {};
  LG.waiting = LG.waiting || {};

  function report(key, error) {
    if (window.console && console.error) console.error('[Lyfeguard calculators] ' + key + ':', error);
  }

  // Each module() call registers one calculator: its LG.start() options are
  // kept, and every <lg-calculator key="..."> on the page runs their setup.
  var currentKey = null;
  function module(key, factory) {
    currentKey = key;
    try {
      factory();
    } catch (error) {
      report(key, error);
    }
    currentKey = null;
    LG.styles[key] = STYLES;
    // Its <lg-calculator> elements may already be on the page.
    (LG.waiting[key] || []).splice(0).forEach(function (el) {
      el.connectedCallback();
    });
  }
