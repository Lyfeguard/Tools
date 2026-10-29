
  // In the component, LG.start records the calculator instead of running it.
  LG.start = function (options) {
    if (currentKey) LG.calculators[currentKey] = options;
  };

  /* ------------------------------------------------------------------
     Shared behaviours, switched on by data attributes in the markup.
     The same as in src/lg-calc.js, but looked up inside one component.
     ------------------------------------------------------------------ */
  // Text that means "no result yet".
  var NO_RESULT = /^(?:|\u2014|\u2013|\u00A3\u2013|\u00A3\u2014)$/;

  function initShared(scope) {
    var root = scope.querySelector('.lg-calc');
    function textOf(id) {
      var el = scope.getElementById(id);
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }
    function watchText(ids, fn) {
      ids.forEach(function (id) {
        var el = scope.getElementById(id);
        if (el) new MutationObserver(fn).observe(el, { childList: true, characterData: true, subtree: true });
      });
    }

    // Result bar on narrow screens while the results are below.
    scope.querySelectorAll('.lgc-sticky[data-source]').forEach(function (bar) {
      var results = scope.getElementById(bar.getAttribute('data-results'));
      var value = bar.querySelector('[data-sticky-value]');
      var sourceId = bar.getAttribute('data-source');
      var labelId = bar.getAttribute('data-source-label');
      var label = bar.querySelector('.lgc-sticky-label');
      if (!results || !value || !scope.getElementById(sourceId)) return;
      var below = false;
      function update() {
        var text = textOf(sourceId);
        value.textContent = text;
        if (labelId && label && textOf(labelId)) label.textContent = textOf(labelId);
        bar.hidden = NO_RESULT.test(text) || !below;
      }
      watchText(labelId ? [sourceId, labelId] : [sourceId], update);
      if (typeof IntersectionObserver !== 'undefined') {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            below = !e.isIntersecting && e.boundingClientRect.top > 0;
          });
          update();
        }).observe(results);
      }
      update();
    });

    // One short screen-reader announcement once typing pauses.
    scope.querySelectorAll('[data-announce]').forEach(function (el) {
      var ids = el.getAttribute('data-announce').split(/\s+/).filter(Boolean);
      var prefix = el.getAttribute('data-announce-prefix') || '';
      var timer = null;
      watchText(ids, function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          var parts = ids.map(textOf);
          var ready = parts.length && !parts.some(function (t) {
            return NO_RESULT.test(t);
          });
          // A label then an amount reads as one phrase; whole sentences get a full stop.
          var text = parts.reduce(function (acc, t) {
            return acc ? acc + (/[A-Za-z]$/.test(acc) && /^[^A-Za-z]/.test(t) ? ' ' : '. ') + t : t;
          }, '');
          el.textContent = ready ? (prefix ? prefix + ' ' : '') + text.replace(/\.\s*\./g, '.') : '';
        }, 900);
      });
    });

    // Clear: every field back to how the page loaded it, then let the calculator update.
    scope.querySelectorAll('[data-clear]').forEach(function (button) {
      button.addEventListener('click', function () {
        var fields = root.querySelectorAll('input, select, textarea');
        var first = null;
        fields.forEach(function (el) {
          if (el.type === 'radio' || el.type === 'checkbox') el.checked = el.defaultChecked;
          else if (el.tagName === 'SELECT')
            Array.prototype.forEach.call(el.options, function (o) {
              o.selected = o.defaultSelected;
            });
          else el.value = el.defaultValue;
          if (!first && el.type !== 'radio' && el.type !== 'checkbox' && !el.disabled) first = el;
        });
        fields.forEach(function (el) {
          // An unchecked radio firing change would look like the user picked it.
          if (el.type === 'radio' && !el.checked) return;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        if (first) first.focus();
      });
    });

    // Money fields are tidied to 12,500 style when you leave them.
    scope.addEventListener(
      'focusout',
      function (event) {
        var el = event.target;
        if (!el || !el.matches || !el.matches('input[data-format="money"]')) return;
        var item = LG.parseNumber(el.value, 2);
        if (item.entered && item.valid) el.value = item.value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
      },
      true,
    );

    // In-page links (#id) can't reach inside the component, so scroll and focus here.
    scope.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[href^="#"]');
      var target = link && scope.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      event.preventDefault();
      var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }
