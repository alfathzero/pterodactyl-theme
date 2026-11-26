/* ===== server bottom navigation (mobile) =====
 * Moves the server sub-navigation (Console / Files / Databases / ...)
 * into a fixed bottom tab bar on small screens. Native nav is kept in
 * the DOM (hidden) so React Router keeps owning the routing.
 */
(function () {
  'use strict';

  var NAV_ID = 'srv-bottom-nav';
  var HIDE_CLASS = 'srv-subnav-native';
  var BODY_CLASS = 'srv-nav-on';

  var ICONS = {
    console:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>',
    files:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
    databases:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    schedules:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 11a2.6 2.6 0 1 0 0-5.2"/><path d="M18 20a5.5 5.5 0 0 0-2-4.3"/></svg>',
    backups:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.4-7"/><path d="M21 3v6h-6"/><circle cx="12" cy="12" r="2.6"/></svg>',
    network:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/></svg>',
    startup:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5 3 21l4.5-1.5"/><path d="M14 4a6 6 0 0 1 6 6c0 4.5-5 9-9 11-1.5-3-1.5-5-3-6.5C6 12 4 10 4 8.5A6 6 0 0 1 14 4Z"/><circle cx="14" cy="8" r="1.6"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.6H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/></svg>',
    activity:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.5-7 5 14 2.5-7h4"/></svg>',
  };

  var navEl = null;
  var nativeRoot = null;
  var lastActive = '';
  var timer = null;

  function isServerPage() {
    return /^\/server\/[^/]+/.test(location.pathname);
  }

  function svgFor(label) {
    return ICONS[String(label).toLowerCase()] ||
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/></svg>';
  }

  function attrSel(href) {
    return 'a[href=' + JSON.stringify(href) + ']';
  }

  function findNativeRoot() {
    // twin.macro/styled-components does not keep tailwind class names in the DOM,
    // so detect the sub-nav by the group of router links sharing one parent.
    var anchors = document.querySelectorAll('a[href^="/server/"]');
    var best = null;
    var bestCount = 0;

    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (navEl && navEl.contains(a)) continue;
      var parent = a.parentElement;
      if (!parent) continue;
      var count = parent.querySelectorAll('a[href^="/server/"]').length;
      if (count > bestCount) {
        bestCount = count;
        best = parent;
      }
    }

    if (!best || bestCount < 3) return null;
    var root = best.parentElement;
    if (!root || root === document.body) return best;
    return root;
  }

  function nativeLinks(root) {
    return Array.prototype.filter.call(root.querySelectorAll('a'), function (a) {
      return !!a.getAttribute('href') && a.textContent.trim().length > 0;
    });
  }

  function clickNative(href, event) {
    var links = document.querySelectorAll(attrSel(href));
    for (var i = 0; i < links.length; i++) {
      if (navEl && navEl.contains(links[i])) continue;
      event.preventDefault();
      links[i].click();
      return;
    }
  }

  function build(root) {
    var links = nativeLinks(root);
    if (links.length < 2) return null;

    var nav = document.createElement('nav');
    nav.id = NAV_ID;
    nav.setAttribute('aria-label', 'Server navigation');

    var inner = document.createElement('div');
    inner.className = 'sbn-inner';

    links.forEach(function (a) {
      var label = a.textContent.trim();
      var href = a.getAttribute('href');

      var tab = document.createElement('a');
      tab.className = 'sbn-tab';
      tab.href = href;
      tab.innerHTML = svgFor(label) + '<span></span>';
      tab.querySelector('span').textContent = label;
      tab.addEventListener('click', function (e) {
        clickNative(href, e);
      });

      inner.appendChild(tab);
    });

    nav.appendChild(inner);
    document.body.appendChild(nav);
    return nav;
  }

  function sync(root) {
    if (!navEl) return;
    var tabs = navEl.querySelectorAll('.sbn-tab');
    var activeHref = '';
    var inner = navEl.querySelector('.sbn-inner');

    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var href = tab.getAttribute('href');
      var src = root.querySelector(attrSel(href));
      var on = !!(src && src.classList.contains('active'));

      tab.classList.toggle('active', on);
      if (on) {
        tab.setAttribute('aria-current', 'page');
        activeHref = href;
      } else {
        tab.removeAttribute('aria-current');
      }
    }

    if (inner && activeHref && activeHref !== lastActive) {
      lastActive = activeHref;
      for (var j = 0; j < tabs.length; j++) {
        if (tabs[j].getAttribute('href') !== activeHref) continue;
        var tr = tabs[j].getBoundingClientRect();
        var ir = inner.getBoundingClientRect();
        var delta = tr.left - ir.left - (inner.clientWidth - tr.width) / 2;
        if (Math.abs(delta) > 8) inner.scrollLeft += delta;
        break;
      }
    }
  }

  function teardown() {
    if (navEl && navEl.parentNode) navEl.parentNode.removeChild(navEl);
    navEl = null;
    if (nativeRoot) nativeRoot.classList.remove(HIDE_CLASS);
    nativeRoot = null;
    lastActive = '';
    document.body.classList.remove(BODY_CLASS);
  }

  function scan() {
    if (!document.body) return;
    if (!isServerPage()) {
      if (navEl || document.body.classList.contains(BODY_CLASS)) teardown();
      return;
    }

    var root = findNativeRoot();
    if (!root) return; // server page still loading

    if (root !== nativeRoot) {
      if (nativeRoot) nativeRoot.classList.remove(HIDE_CLASS);
      nativeRoot = root;
    }

    var links = nativeLinks(root);
    var rebuild = !navEl || navEl.querySelectorAll('.sbn-tab').length !== links.length;
    if (rebuild) {
      if (navEl && navEl.parentNode) navEl.parentNode.removeChild(navEl);
      navEl = build(root);
      lastActive = '';
      if (!navEl) return;
    }

    root.classList.add(HIDE_CLASS);
    document.body.classList.add(BODY_CLASS);
    sync(root);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, 90);
  }

  function boot() {
    scan();

    var app = document.getElementById('app');
    if (app && window.MutationObserver) {
      new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
    }

    window.addEventListener('popstate', schedule);
    setInterval(scan, 1000);

    ['pushState', 'replaceState'].forEach(function (fn) {
      var orig = history[fn];
      history[fn] = function () {
        var r = orig.apply(this, arguments);
        schedule();
        return r;
      };
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
