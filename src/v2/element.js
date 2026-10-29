
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

  class LgCalculator extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return; // already set up (the element was moved)
      var key = this.getAttribute('key');
      var calc = LG.calculators[key];
      if (!calc || !TEMPLATES[key]) return report('lg-calculator', 'no calculator with key "' + key + '"');
      var scope = this.attachShadow({ mode: 'open' });
      addStyles(scope);
      var template = document.createElement('template');
      template.innerHTML = TEMPLATES[key];
      scope.appendChild(template.content);
      var missing = (calc.required || []).filter(function (id) {
        return !scope.getElementById(id);
      });
      if (missing.length) return report(key, 'missing elements: ' + missing.join(', '));
      try {
        initShared(scope);
        calc.setup(scope.querySelector('.lg-calc'));
      } catch (error) {
        report(key, error);
      }
    }
  }
  if (window.customElements && !customElements.get('lg-calculator')) customElements.define('lg-calculator', LgCalculator);
