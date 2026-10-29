/*!
 * Lyfeguard | lg-track.js | VERSION
 * Site-wide click tracking for GA4 (through GTM): pushes lyf_event to the
 * dataLayer for calls to action, navigation, contact links and anything
 * marked with data-track-* attributes. Load it on every page, once.
 * Moved here from the site's footer code; clicks inside calculators
 * (<lg-calculator>, a shadow root) are tracked too.
 */
(function () {
  'use strict';

  if (window.LyfeTrack) return; // loaded twice
  window.LyfeTrack = true;
  window.dataLayer = window.dataLayer || [];

  var LYFEGUARD_HOSTS = ['lyfeguard.com', 'www.lyfeguard.com'];

  var APP_HOST = 'app.lyfeguard.com';
  var MEETINGS_HOST = 'meetings.lyfeguard.com';

  function cleanPath(path) {
    if (!path) return '/';
    path = path.replace(/\/+$/, '');
    return path || '/';
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 80);
  }

  function currentPageId() {
    var path = cleanPath(window.location.pathname);

    return path === '/' ? 'homepage' : slugify(path);
  }

  // closest() that also looks outside a shadow root, so elements inside a
  // calculator (<lg-calculator>) find the page around them.
  function closest(element, selector) {
    while (element) {
      var found = element.closest(selector);
      if (found) return found;
      var root = element.getRootNode();
      element = root && root.host ? root.host : null;
    }
    return null;
  }

  function getText(element) {
    return (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 100);
  }

  function getLocation(element) {
    var manual = element.getAttribute('data-track-location');

    if (manual) return manual;

    var section = closest(element, '[data-track-section]');

    if (section) {
      return section.getAttribute('data-track-section');
    }

    if (closest(element, 'lg-calculator')) {
      return 'calculator';
    }

    if (closest(element, 'header')) {
      return 'header_nav';
    }

    if (closest(element, 'footer')) {
      return 'footer';
    }

    var node = element;
    var depth = 0;

    while (node && depth < 8) {
      var classes = typeof node.className === 'string' ? node.className : '';

      var value = ((node.id || '') + ' ' + classes).toLowerCase();

      if (value.indexOf('hero') > -1) {
        return 'hero';
      }

      if (value.indexOf('pricing') > -1 || value.indexOf('plans') > -1) {
        return 'pricing';
      }

      if (value.indexOf('individual') > -1) {
        return 'individuals_section';
      }

      if (value.indexOf('professional') > -1) {
        return 'professionals_section';
      }

      if (value.indexOf('trust') > -1 || value.indexOf('security') > -1) {
        return 'trust_section';
      }

      node = node.parentElement;
      depth++;
    }

    return 'body';
  }

  function classifyPath(path) {
    path = cleanPath(path);

    if (path.indexOf('/professionals/wealth') === 0) {
      return {
        action: 'explore_wealth',
        audience: 'wealth',
      };
    }

    if (path.indexOf('/professionals/legal') === 0) {
      return {
        action: 'explore_legal',
        audience: 'legal',
      };
    }

    if (path === '/professionals') {
      return {
        action: 'explore_professionals',
        audience: 'professional',
      };
    }

    if (path === '/personal/pricing') {
      return {
        action: 'view_pricing',
        audience: 'consumer',
      };
    }

    if (path.indexOf('/personal') === 0) {
      return {
        action: 'explore_individuals',
        audience: 'consumer',
      };
    }

    if (path.indexOf('/platform/') === 0) {
      return {
        action: 'explore_feature',
        audience: 'all',
        content_topic: slugify(path.split('/').pop()),
      };
    }

    if (path.indexOf('/guides/') === 0) {
      return {
        event_name: 'content_click',
        action: 'read_guide',
        audience: 'consumer',
        content_topic: slugify(path.split('/').pop()),
      };
    }

    if (path === '/guides') {
      return {
        action: 'explore_guides',
        audience: 'consumer',
      };
    }

    if (path.indexOf('/insights/') === 0) {
      return {
        event_name: 'content_click',
        action: 'read_insight',
        audience: 'professional',
        content_topic: slugify(path.split('/').pop()),
      };
    }

    if (path === '/insights') {
      return {
        action: 'explore_insights',
        audience: 'professional',
      };
    }

    if (path.indexOf('/tools/') === 0) {
      return {
        event_name: 'tool_click',
        action: 'use_tool',
        audience: 'consumer',
        content_topic: slugify(path.split('/').pop()),
      };
    }

    if (path === '/tools') {
      return {
        action: 'explore_tools',
        audience: 'consumer',
      };
    }

    if (path === '/trust') {
      return {
        action: 'explore_trust',
        audience: 'all',
      };
    }

    if (path === '/contact') {
      return {
        action: 'contact',
        audience: 'all',
      };
    }

    if (path === '/about') {
      return {
        action: 'explore_about',
        audience: 'all',
      };
    }

    if (path === '/') {
      return {
        action: 'navigate_home',
        audience: 'all',
      };
    }

    return null;
  }

  function classifyAppAction(text) {
    var t = text.toLowerCase();

    if (t.indexOf('log in') > -1 || t.indexOf('login') > -1 || t.indexOf('sign in') > -1) {
      return 'login';
    }

    if (t.indexOf('upgrade') > -1 || t.indexOf('pro') > -1) {
      return 'upgrade_account';
    }

    if (t.indexOf('start free') > -1 || t.indexOf('create account') > -1 || t.indexOf('free account') > -1 || t.indexOf('sign up') > -1 || t.indexOf('get started free') > -1) {
      return 'create_account';
    }

    return 'open_app';
  }

  document.addEventListener('click', function (event) {
    // The element clicked, even inside a calculator: from outside a shadow
    // root, event.target is the <lg-calculator> itself.
    var origin = event.composedPath ? event.composedPath()[0] : event.target;

    if (!(origin instanceof Element)) {
      return;
    }

    var element = origin.closest('[data-track-event], a[href]');

    if (!element) return;

    if (closest(element, '[data-track-ignore="true"]')) {
      return;
    }

    var text = getText(element);
    var location = getLocation(element);

    /*
     * Existing manual attributes.
     * These always take priority.
     */

    var manualEvent = element.getAttribute('data-track-event');

    var manualAction = element.getAttribute('data-track-action');

    var manualId = element.getAttribute('data-track-id');

    var manualAudience = element.getAttribute('data-track-audience');

    var manualContent = element.getAttribute('data-track-content');

    var manualVariant = element.getAttribute('data-track-variant');

    var href = element.getAttribute('href');

    var url = null;

    if (href) {
      try {
        url = new URL(href, window.location.href);
      } catch (e) {
        return;
      }
    } else if (!manualEvent) {
      return;
    }

    // A link to somewhere on this page ("See results", a contents list) isn't a visit.
    if (url && !manualEvent && url.hash && url.origin === window.location.origin && cleanPath(url.pathname) === cleanPath(window.location.pathname)) {
      return;
    }

    var eventName = manualEvent || '';
    var action = manualAction || '';
    var audience = manualAudience || '';
    var contentTopic = manualContent || '';

    if (!url) {
      // A button or other element marked with data-track-event: its own attributes say it all.
    } else if (url.protocol === 'mailto:') {
      eventName = eventName || 'contact_click';

      action = action || 'contact_email';

      audience = audience || 'all';
    } else if (url.protocol === 'tel:') {
      eventName = eventName || 'contact_click';

      action = action || 'contact_phone';

      audience = audience || 'all';
    } else if (url.hostname === APP_HOST) {
      action = action || classifyAppAction(text);

      audience = audience || (action === 'create_account' || action === 'upgrade_account' ? 'consumer' : 'all');

      if (action === 'login' && (location === 'header_nav' || location === 'footer')) {
        eventName = eventName || 'nav_click';
      } else {
        eventName = eventName || 'cta_click';
      }
    } else if (url.hostname === MEETINGS_HOST) {
      eventName = eventName || 'cta_click';

      action = action || 'book_demo';

      audience = audience || 'professional';
    } else if (LYFEGUARD_HOSTS.indexOf(url.hostname) > -1) {
      var path = cleanPath(url.pathname);

      if (path.indexOf('/policies/') === 0 && !manualEvent) {
        return;
      }

      var route = classifyPath(path);

      if (!route) {
        if (location === 'header_nav' || location === 'footer') {
          eventName = eventName || 'nav_click';

          action = action || 'navigate';

          audience = audience || 'all';
        } else if (!manualEvent) {
          return;
        }
      } else {
        action = action || route.action;

        audience = audience || route.audience || 'all';

        contentTopic = contentTopic || route.content_topic || '';

        if (location === 'header_nav' || location === 'footer') {
          eventName = eventName || 'nav_click';
        } else {
          eventName = eventName || route.event_name || 'cta_click';
        }
      }
    } else if (!manualEvent) {
      return;
    }

    if (!eventName || !action) {
      return;
    }

    var elementId = manualId;

    if (!elementId) {
      var destination = url && url.pathname && url.pathname !== '/' ? slugify(url.pathname) : slugify(text);

      elementId = [currentPageId(), location, action, destination].filter(Boolean).join('_').substring(0, 150);
    }

    var trackingData = {
      event: 'lyf_event',

      ga4_event_name: eventName,

      cta_action: action,

      element_id: elementId,

      element_text: text,

      element_location: location,

      audience: audience,
    };

    if (contentTopic) {
      trackingData.content_topic = contentTopic;
    }

    if (manualVariant) {
      trackingData.variant = manualVariant;
    }

    if (url && (url.protocol === 'https:' || url.protocol === 'http:')) {
      trackingData.link_url = url.origin + cleanPath(url.pathname);
    }

    window.dataLayer.push(trackingData);
  });
})();
