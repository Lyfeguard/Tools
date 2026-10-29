
  /* ------------------------------------------------------------------
     The element. Its markup and styles live in a shadow root, so the
     site's CSS can't reach them; the site's fonts still apply.
     ------------------------------------------------------------------ */
  var sheet = null;
  function addStyles(scope) {
    var canAdopt = 'adoptedStyleSheets' in scope && typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype;
    if (canAdopt) {
      if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(STYLES);
      }
      scope.adoptedStyleSheets = [sheet];
    } else {
      var style = document.createElement('style');
      style.textContent = STYLES;
      scope.appendChild(style);
    }
  }

  // <lg-calculator> wraps the calculator's markup, which is in the page HTML
  // (the CMS field), so search engines read it exactly as before. The element
  // moves that markup into its shadow root and starts the calculator there.
  // Until then, or if this script doesn't load, v1 shows and runs it as usual.
  class LgCalculator extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return; // already set up (the element was moved)
      var self = this;
      if (!this.firstElementChild && document.readyState === 'loading') {
        // Loaded without defer: wait for the markup inside to be parsed.
        document.addEventListener('DOMContentLoaded', function () {
          self.connectedCallback();
        }, { once: true });
        return;
      }
      var markup = this.querySelector('.lg-calc[data-calc]');
      // An empty element (such as a template embed) shows nothing.
      if (!markup) {
        this.hidden = true;
        return;
      }
      var key = (this.getAttribute('key') || markup.getAttribute('data-calc')).trim();
      var calc = LG.calculators[key];
      // Not in v2 yet: leave the markup where it is, for v1 to run.
      if (!calc) return;
      var scope = this.attachShadow({ mode: 'open' });
      addStyles(scope);
      while (this.firstChild) scope.appendChild(this.firstChild);
      var missing = (calc.required || []).filter(function (id) {
        return !scope.getElementById(id);
      });
      if (missing.length) return report(key, 'missing elements: ' + missing.join(', '));
      try {
        initShared(scope);
        // As LG.start does in v1: the calculator's root, and get(id) to look up an element.
        calc.setup(scope.querySelector('.lg-calc'), function (id) {
          return scope.getElementById(id);
        });
      } catch (error) {
        report(key, error);
      }
    }
  }
  if (window.customElements && !customElements.get('lg-calculator')) customElements.define('lg-calculator', LgCalculator);
