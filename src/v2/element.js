
  /* ------------------------------------------------------------------
     The element. Its markup and styles live in a shadow root, so the
     site's CSS can't reach them; the site's fonts still apply.
     ------------------------------------------------------------------ */
  var sheets = {};
  function addStyles(scope, key) {
    var css = LG.styles[key] || STYLES;
    var canAdopt = 'adoptedStyleSheets' in scope && typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype;
    if (canAdopt) {
      if (!sheets[key]) {
        sheets[key] = new CSSStyleSheet();
        sheets[key].replaceSync(css);
      }
      scope.adoptedStyleSheets = [sheets[key]];
    } else {
      var style = document.createElement('style');
      style.textContent = css;
      scope.appendChild(style);
    }
  }

  // <lg-calculator> wraps the calculator's markup, which is in the page HTML
  // (the CMS field), so search engines read it exactly as before. The element
  // moves that markup into its shadow root and starts the calculator there.
  // Until then, or if this script doesn't load, the markup shows as it is,
  // styled by the calculator's stylesheet (dist/v2/<key>.min.css).
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
      // Its code hasn't loaded yet (it comes in its own file): wait for it.
      // Until then the markup shows as it is in the page.
      if (!calc) {
        (LG.waiting[key] = LG.waiting[key] || []).push(this);
        return;
      }
      var scope = this.attachShadow({ mode: 'open' });
      addStyles(scope, key);
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
        addDownload(this, scope, key);
        addTracking(scope, key);
        addHandoffLinks(scope, key);
        receiveHandoff(scope, key);
      } catch (error) {
        report(key, error);
      }
    }
  }
  if (window.customElements && !customElements.get('lg-calculator')) customElements.define('lg-calculator', LgCalculator);
