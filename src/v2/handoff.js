  /* ------------------------------------------------------------------
     Calculators that work together. A "Use these figures" link (in the
     markup, written by scripts/links.js) opens another calculator with
     the figures carried after the # in its address: that part never goes to
     the server, the click tracking records links without it, and the
     calculator that receives it removes it from the address once read.
       #lg-from=<key>&<field id>=<number>&@<radio name>=<value>
     It fills only its own fields, and only with plain numbers or the
     choices its fields offer.
     ------------------------------------------------------------------ */
  var NAMES = {
    'take-home-pay': 'take-home pay',
    'debt-to-income': 'debt-to-income',
    mortgage: 'mortgage',
    'pro-rata-salary': 'pro rata salary',
    'salary-by-age': 'salary by age',
    'emergency-fund': 'emergency fund',
    'savings-goal': 'savings goal',
    'net-worth': 'net worth',
    'inheritance-tax': 'inheritance tax',
    'stamp-duty': 'Stamp Duty',
    lbtt: 'LBTT',
    'land-transaction-tax': 'Land Transaction Tax',
  };
  // What's still needed on a calculator after the figures arrive.
  var NEXT = {
    'inheritance-tax': ' Then answer the questions about your home and who inherits to see the estimate.',
  };
  function amount(el) {
    if (!el) return null;
    // A field's value, or the text of a result.
    var text = (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? el.value : el.textContent).replace(/[^\d.\-]/g, '');
    var n = parseFloat(text);
    return isFinite(n) && n > 0 ? money2(n) : null;
  }
  // Whole pounds as they are; pence always as two digits (8750.50).
  function money2(n) {
    n = Math.round(n * 100) / 100;
    return n % 1 ? n.toFixed(2) : String(n);
  }
  function checked(scope, name) {
    var el = scope.querySelector('input[type="radio"][name="' + name + '"]:checked');
    return el ? el.value : null;
  }
  // Tax on buying a home: the price and kind of buyer go to another nation's
  // calculator. Wales has no first-time buyer relief, so there a first-time
  // buyer is buying their main home.
  function homeTax(get, scope, from, to) {
    var buyer = checked(scope, from + '-buyer');
    if (buyer === 'first' && to === 'lgltt') buyer = 'home';
    var figures = {};
    figures['@' + to + '-buyer'] = buyer;
    figures[to + '-price'] = amount(get(from + '-price'));
    return figures;
  }
  // From each calculator: for each one it links to, the figures to send.
  // Each returns { field id or @radio name: value }; empty values are left out.
  var SEND = {
    'take-home-pay': {
      'debt-to-income': function (get, scope) {
        var period = checked(scope, 'lgth-period');
        var pay = amount(get('lgth-salary'));
        if (!pay) return null;
        if (period === 'week') return { '@lgdti-period': 'year', 'lgdti-income': String(Math.round(pay * 52)) };
        return { '@lgdti-period': period === 'month' ? 'month' : 'year', 'lgdti-income': pay };
      },
    },
    mortgage: {
      'debt-to-income': function (get) {
        return { 'lgdti-housing': amount(get('lgmc-monthly')) };
      },
    },
    'pro-rata-salary': {
      'take-home-pay': function (get) {
        return { '@lgth-period': 'year', 'lgth-salary': amount(get('pr-salary-out')), 'lgth-pension': amount(get('pr-ee')) };
      },
    },
    'salary-by-age': {
      'take-home-pay': function (get) {
        return { '@lgth-period': 'year', 'lgth-salary': amount(get('sa-salary')) };
      },
    },
    'emergency-fund': {
      'savings-goal': function (get) {
        return { 'sg-goal': amount(get('ef-target')), 'sg-initial': amount(get('ef-saved')) };
      },
    },
    'net-worth': {
      // Inheritance Tax works on one person's estate: only their own figures go.
      'inheritance-tax': function (get, scope) {
        if (checked(scope, 'lgnw-scope') !== 'personal') return null;
        var sum = function (ids) {
          var total = ids.reduce(function (t, id) {
            return t + (parseFloat(amount(get(id))) || 0);
          }, 0);
          return total ? money2(total) : null;
        };
        return {
          'lgiht-home': amount(get('lgnw-property')),
          'lgiht-other-property': amount(get('lgnw-other-property')),
          'lgiht-cash': sum(['lgnw-current-accounts', 'lgnw-cash']),
          'lgiht-investments': sum(['lgnw-isa', 'lgnw-investments']),
          'lgiht-possessions': amount(get('lgnw-vehicles')),
          'lgiht-business': amount(get('lgnw-business')),
          'lgiht-other': amount(get('lgnw-other-assets')),
          'lgiht-mortgage': amount(get('lgnw-mortgage')),
          // Student loans are written off on death, so they don't reduce the estate.
          'lgiht-debts': sum(['lgnw-car-finance', 'lgnw-credit-cards', 'lgnw-personal-loans', 'lgnw-overdraft', 'lgnw-other-debts']),
        };
      },
    },
    'stamp-duty': {
      'lbtt': function (get, scope) {
        return homeTax(get, scope, 'lgsd', 'lglbtt');
      },
      'land-transaction-tax': function (get, scope) {
        return homeTax(get, scope, 'lgsd', 'lgltt');
      },
    },
    'lbtt': {
      'stamp-duty': function (get, scope) {
        return homeTax(get, scope, 'lglbtt', 'lgsd');
      },
      'land-transaction-tax': function (get, scope) {
        return homeTax(get, scope, 'lglbtt', 'lgltt');
      },
    },
    'land-transaction-tax': {
      'stamp-duty': function (get, scope) {
        return homeTax(get, scope, 'lgltt', 'lgsd');
      },
      'lbtt': function (get, scope) {
        return homeTax(get, scope, 'lgltt', 'lglbtt');
      },
    },
  };
  LG.handoffs = SEND;

  // Sending: the link gets the figures as it's about to be followed, however
  // that happens: a click, a middle-click or "Open in new tab", the keyboard,
  // or a long press on a phone.
  function addHandoffLinks(scope, key) {
    function update(event) {
      var link = event.target.closest && event.target.closest('a[data-handoff]');
      if (!link) return;
      var to = link.getAttribute('data-handoff');
      var make = SEND[key] && SEND[key][to];
      var base = link.getAttribute('href').split('#')[0];
      var figures = null;
      try {
        figures = make ? make(function (id) {
          return scope.getElementById(id);
        }, scope) : null;
      } catch (error) {
        report(key, error);
      }
      var params = ['lg-from=' + encodeURIComponent(key)];
      Object.keys(figures || {}).forEach(function (k) {
        if (figures[k]) params.push(encodeURIComponent(k) + '=' + encodeURIComponent(figures[k]));
      });
      link.setAttribute('href', params.length > 1 ? base + '#' + params.join('&') : base);
    }
    ['pointerdown', 'focusin', 'contextmenu', 'auxclick', 'click'].forEach(function (type) {
      scope.addEventListener(type, update, true);
    });
  }

  // Receiving: fill in the fields, then take the figures out of the address.
  function receiveHandoff(scope, key) {
    var hash = location.hash.slice(1);
    if (!/(^|&)lg-from=/.test(hash)) return;
    var params = {};
    hash.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) {
        try {
          params[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
        } catch (e) {}
      }
    });
    var from = params['lg-from'];
    var filled = 0;
    var fire = function (el, types) {
      types.forEach(function (type) {
        el.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
      });
    };
    // Radios first, so a field's meaning (a year or a month) is set before its value.
    Object.keys(params).forEach(function (k) {
      if (k.charAt(0) !== '@') return;
      var radio = [].filter.call(scope.querySelectorAll('input[type="radio"]'), function (r) {
        return r.name === k.slice(1) && r.value === params[k];
      })[0];
      if (radio && !radio.checked) {
        radio.checked = true;
        fire(radio, ['input', 'change']);
      }
    });
    Object.keys(params).forEach(function (k) {
      if (k === 'lg-from' || k.charAt(0) === '@') return;
      var el = scope.getElementById(k);
      var value = params[k];
      if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName) || /^(radio|checkbox|hidden|submit|button)$/.test(el.type) || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) return;
      el.value = value;
      fire(el, ['input', 'change']);
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true })); // formats money fields
      filled++;
    });
    try {
      history.replaceState(history.state, '', location.pathname + location.search);
    } catch (e) {}
    if (!filled) return;
    var note = document.createElement('p');
    note.className = 'lgc-handoff';
    note.setAttribute('role', 'status');
    note.textContent = 'We\u2019ve filled in your figures from the ' + (NAMES[from] || 'other') + ' calculator. Check them, and change anything that\u2019s different.' + (NEXT[key] || '');
    var root = scope.querySelector('.lg-calc');
    root.insertBefore(note, root.firstChild);
  }
