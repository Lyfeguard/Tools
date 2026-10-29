
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
      // The key comes from the CMS item ("Calculator key" in the template's
      // embed), or from the nearest data-calc on the page.
      var holder = this.closest('[data-calc]');
      var key = (this.getAttribute('key') || (holder && holder.getAttribute('data-calc')) || '').trim();
      var calc = LG.calculators[key];
      // The template has the element on every item, so it stays hidden, and
      // quiet, on items whose calculator isn't in the component yet or whose
      // v1 markup is still pasted in.
      if (!calc || !TEMPLATES[key] || document.querySelector('.lg-calc[data-calc="' + key + '"]')) {
        this.hidden = true;
        return;
      }
      this.hidden = false;
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
