  /* ------------------------------------------------------------------
     PDF summaries. A button under the results; what it needs loads when
     it's pressed: the email dialog (dist/lg-dl.min.js, shared with the
     Guides) and the PDF maker (dist/v2/lg-pdf.min.js). The PDF is made
     in the browser, so the figures never leave the page.
     ------------------------------------------------------------------ */
  var HERE = (document.currentScript && document.currentScript.src) || '';
  var PDF_FORM = '9d095c21-3177-42e8-9862-64228125f64d'; // HubSpot: calculator PDF downloads
  var PDF_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var scripts = {};
  function loadScript(path) {
    var src = new URL(path, HERE).href;
    if (!scripts[src]) {
      scripts[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = function () {
          delete scripts[src];
          reject(new Error('could not load ' + src));
        };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  // The results panel and the headline figure, from the result bar's markup:
  // data-results and data-source, or its "See results" link and its value.
  function resultParts(scope) {
    var bar = scope.querySelector('.lgc-sticky');
    if (!bar) return {};
    var link = bar.querySelector('a[href^="#"]');
    return {
      bar: bar,
      results: scope.getElementById(bar.getAttribute('data-results') || (link ? link.getAttribute('href').slice(1) : '')),
      value: scope.getElementById(bar.getAttribute('data-source') || '') || bar.querySelector('[data-sticky-value], strong'),
    };
  }
  LG.resultParts = resultParts;

  function addDownload(host, scope, key) {
    var parts = resultParts(scope);
    var results = parts.results;
    var source = parts.value;
    if (!HERE || !results || !source) return;
    var box = document.createElement('div');
    box.className = 'lgc-pdf';
    box.innerHTML = '<button type="button" class="lgc-pdf-button" aria-haspopup="dialog">' + PDF_ICON + '<span>Download PDF summary</span></button>';
    results.appendChild(box);
    var button = box.firstChild;
    // Shown once someone has used the calculator and there's a result, so
    // search engines (which don't) see the page exactly as before.
    var used = false;
    function update() {
      box.hidden = !used || NO_RESULT.test(source.textContent.replace(/\s+/g, ' ').trim());
    }
    ['input', 'change'].forEach(function (type) {
      scope.addEventListener(type, function () {
        used = true;
        update();
      });
    });
    new MutationObserver(update).observe(source, { childList: true, characterData: true, subtree: true });
    update();
    button.addEventListener('click', function () {
      button.disabled = true;
      Promise.all([loadScript('../lg-dl.min.js'), loadScript('lg-pdf.min.js')]).then(function () {
        var doc = LG.summary(host);
        var fonts = new URL('../../pdf-generator/assets/fonts/', HERE).href;
        window.LyfeDownload.open({
          formId: PDF_FORM,
          name: doc.title + ' (PDF summary)',
          url: doc.url,
          slug: key,
          type: 'calculator',
          trigger: button,
          file: function () {
            return LG.pdf(doc, fonts);
          },
          title: 'Get your results as a PDF',
          text: 'A summary of your figures and results to keep, print or share. Enter your email and your download appears straight away. Your figures stay on your device.',
          doneText: 'Thanks. Your summary is below, and it\'s yours to keep.',
        });
      }).catch(function (error) {
        report(key, error);
      }).then(function () {
        button.disabled = false;
      });
    });
  }
