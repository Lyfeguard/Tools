/*!
 * Lyfeguard | lg-dl.js | VERSION
 * Email-gated downloads: a HubSpot form in a dialog, then the file. Used by
 * the Guides template (.lg-dl blocks) and the calculators' PDF summaries.
 */
(function (window, document) {
  'use strict';
  var api = (window.LyfeDownload = window.LyfeDownload || {});
  if (api.open) return; // loaded twice
  var CSS = '/* @css */';
  var KEY = 'lg-dl-ok'; // set once someone has given their email, on any download
  var PORTAL = '139576714';
  var REGION = 'eu1';
  var ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var HTML =
    '<button type="button" class="lg-dl-close" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
    '<div class="lg-dl-step lg-dl-ask"><div class="lg-dl-head"><p class="lg-dl-eyebrow"></p><h2 class="lg-dl-title" id="lg-dl-heading"></h2><p class="lg-dl-text"></p></div>' +
    '<div class="lg-dl-form"></div>' +
    '<p class="lg-dl-fallback" hidden>The form hasn\'t loaded (an ad blocker can stop it). <a class="lg-dl-link" href="#" target="_blank" rel="noopener">Download the PDF here</a>.</p></div>' +
    '<div class="lg-dl-step lg-dl-done" hidden><span class="lg-dl-tick" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
    '<h2 class="lg-dl-title" tabindex="-1">Your PDF is ready</h2><p class="lg-dl-text"></p>' +
    '<a class="lg-dl-button lg-dl-link" href="#" target="_blank" rel="noopener">' + ICON + '<span>Download the PDF</span></a></div>';

  var dialog = null;
  var current = null; // the options of the open download
  var frames = {}; // one HubSpot form per form id, kept between opens
  var forms = {}; // and its HubSpot form object, once ready
  var scriptAdded = false;

  function $(selector) {
    return dialog.querySelector(selector);
  }
  function remembered() {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch (e) {
      return false;
    }
  }
  function remember() {
    try {
      localStorage.setItem(KEY, '1');
    } catch (e) {}
  }
  function track(o, extra) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: 'pdf_download', resource_slug: o.slug, resource_title: o.trackName || o.name, resource_type: o.type }, extra || {}));
  }

  // The file: a URL (guides), or a function returning a promise of
  // { url, filename } (a PDF made in the browser, for the calculators).
  function file(o) {
    if (!o.promise) o.promise = typeof o.file === 'function' ? Promise.resolve().then(o.file) : Promise.resolve({ url: o.file });
    return o.promise;
  }
  function setLinks(o) {
    var links = dialog.querySelectorAll('.lg-dl-link');
    file(o).then(function (f) {
      if (current !== o) return;
      links.forEach(function (a) {
        a.href = f.url;
        if (f.filename) {
          a.setAttribute('download', f.filename);
          a.removeAttribute('target');
        } else {
          a.removeAttribute('download');
          a.target = '_blank';
        }
      });
    }, function (error) {
      if (window.console) console.error('[Lyfeguard download]', error);
    });
  }
  function save(f) {
    if (!f.filename) return window.open(f.url, '_blank', 'noopener');
    var a = document.createElement('a');
    a.href = f.url;
    a.download = f.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function addCss() {
    if (document.getElementById('lg-dl-css')) return;
    var style = document.createElement('style');
    style.id = 'lg-dl-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  function build() {
    if (dialog) return;
    addCss();
    dialog = document.createElement('dialog');
    dialog.className = 'lg-dl-dialog';
    dialog.setAttribute('aria-labelledby', 'lg-dl-heading');
    dialog.innerHTML = HTML;
    document.body.appendChild(dialog);
    $('.lg-dl-close').addEventListener('click', function () {
      dialog.close();
    });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', function () {
      document.documentElement.classList.remove('lg-dl-lock');
      if (current && current.trigger) current.trigger.focus();
    });

    // Events from every HubSpot form on the page come here: act only on the
    // open download's form.
    function ours(event) {
      var id = event.detail && event.detail.formId;
      return current && dialog.open && (!id || id === current.formId);
    }
    window.addEventListener('hs-form-event:on-ready', function (event) {
      var form = window.HubSpotFormsV4 && window.HubSpotFormsV4.getFormFromEvent(event);
      var id = event.detail && event.detail.formId;
      if (!form || !current || (id && id !== current.formId)) return;
      forms[current.formId] = form;
      fill(form, current);
    });
    window.addEventListener('hs-form-event:on-submission:success', function (event) {
      if (!ours(event)) return;
      remember();
      track(current);
      $('.lg-dl-ask').hidden = true;
      $('.lg-dl-done').hidden = false;
      $('.lg-dl-done .lg-dl-title').focus();
    });
  }

  // The hidden fields record what was downloaded: the resource's name and
  // its URL (for a calculator, the page). Never the figures in it.
  function fill(form, o) {
    try {
      form.setFieldValue('0-1/last_resource_requested', o.name);
      form.setFieldValue('0-1/last_resource_url', o.url);
    } catch (e) {
      /* the form still sends without them */
    }
  }

  function loadForm(o) {
    if (forms[o.formId]) fill(forms[o.formId], o);
    var box = $('.lg-dl-form');
    Object.keys(frames).forEach(function (id) {
      frames[id].hidden = id !== o.formId;
    });
    if (frames[o.formId]) return;
    var frame = (frames[o.formId] = document.createElement('div'));
    frame.className = 'hs-form-frame';
    frame.setAttribute('data-region', o.region);
    frame.setAttribute('data-form-id', o.formId);
    frame.setAttribute('data-portal-id', o.portalId);
    box.appendChild(frame);
    if (!scriptAdded) {
      scriptAdded = true;
      var s = document.createElement('script');
      s.src = 'https://js-' + o.region + '.hsforms.net/forms/embed/' + o.portalId + '.js';
      s.defer = true;
      s.onerror = showFallback;
      document.head.appendChild(s);
    }
    setTimeout(function () {
      if (!frame.childElementCount) showFallback();
    }, 8000);
  }
  function showFallback() {
    if (dialog) $('.lg-dl-fallback').hidden = false;
  }

  // Opens a download. o: { formId, name, trackName, url, slug, type, file, trigger,
  // eyebrow, title, text, doneText }. Someone who has already given their
  // email gets the file straight away.
  api.open = function (o) {
    o = Object.assign({ portalId: PORTAL, region: REGION, eyebrow: 'Free PDF', title: 'Get this guide as a PDF', text: 'Read it offline, print it or share it. Enter your email and your download appears straight away.', doneText: 'Thanks. Your download is below, and it\'s yours to keep.' }, o);
    if (remembered()) {
      track(o, { returning: true });
      // A URL opens in this click, so it isn't blocked as a pop-up.
      if (typeof o.file === 'string') return save({ url: o.file });
      return file(o).then(save);
    }
    build();
    current = o;
    $('.lg-dl-eyebrow').textContent = o.eyebrow;
    $('#lg-dl-heading').textContent = o.title;
    $('.lg-dl-ask .lg-dl-text').textContent = o.text;
    $('.lg-dl-done .lg-dl-text').textContent = o.doneText;
    $('.lg-dl-ask').hidden = false;
    $('.lg-dl-done').hidden = true;
    setLinks(o);
    loadForm(o);
    dialog.showModal();
    document.documentElement.classList.add('lg-dl-lock');
  };
  api.remembered = remembered;
  api.icon = ICON;

  // Guides: <div class="lg-dl" data-pdf data-name data-slug data-title
  // data-form-id> around a .lg-dl-trigger button.
  function blocks() {
    document.querySelectorAll('.lg-dl[data-pdf]').forEach(function (box) {
      var d = box.dataset;
      var trigger = box.querySelector('.lg-dl-trigger');
      if (d.ready || !trigger) return;
      d.ready = '1';
      var set = function (v) {
        return v && v.indexOf('{{') === -1 ? v : '';
      };
      if (!set(d.pdf)) return (box.style.display = 'none');
      addCss();
      trigger.addEventListener('click', function () {
        api.open({ formId: d.formId, portalId: d.portalId || PORTAL, region: d.region || REGION, name: set(d.title) || d.name, trackName: d.name, url: d.pdf, file: d.pdf, slug: d.slug, type: 'guide', trigger: trigger, title: set(d.title) ? 'Get ' + d.title : undefined });
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', blocks);
  else blocks();
})(window, document);
