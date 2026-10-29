  /* ------------------------------------------------------------------
     <lg-calculator> component (v2): set-up shared by the calculators.
     The tax core and each calculator's module are copied in from
     src/lg-calc.js by scripts/build-v2.js, so both versions share them.
     ------------------------------------------------------------------ */
  var LG = (window.LyfeCalculators = window.LyfeCalculators || {});
  LG.version = '2.0.0-alpha.1';
  LG.calculators = LG.calculators || {};

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
  }
