/**
 * ShieldBlock — Universal Script Interceptor
 * Blocks ad scripts at the injection level on ANY website.
 * Intercepts fetch/XHR, kills ad script tags, and neutralizes ad libraries.
 * Runs at document_start before any other scripts execute.
 */
(function() {
  'use strict';

  // ─── 1. BLOCK AD SCRIPTS BEFORE THEY LOAD ────────────────────
  // Override document.createElement to intercept script creation
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function(tagName, options) {
    const el = origCreateElement(tagName, options);
    if (tagName.toLowerCase() === 'script') {
      const origSetAttribute = el.setAttribute.bind(el);
      el.setAttribute = function(name, value) {
        if (name === 'src' && isAdUrl(value)) {
          console.log('[ShieldBlock] Blocked script:', value);
          return; // Don't set the src at all
        }
        return origSetAttribute(name, value);
      };

      // Also intercept .src property
      const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
      if (srcDescriptor) {
        Object.defineProperty(el, 'src', {
          set: function(val) {
            if (isAdUrl(val)) {
              console.log('[ShieldBlock] Blocked script src:', val);
              return;
            }
            srcDescriptor.set.call(this, val);
          },
          get: function() {
            return srcDescriptor.get.call(this);
          },
          configurable: true
        });
      }
    }

    // Block ad iframes
    if (tagName.toLowerCase() === 'iframe') {
      const origSetAttr = el.setAttribute.bind(el);
      el.setAttribute = function(name, value) {
        if (name === 'src' && isAdUrl(value)) {
          console.log('[ShieldBlock] Blocked iframe:', value);
          return;
        }
        return origSetAttr(name, value);
      };
    }

    return el;
  };

  // ─── 2. INTERCEPT FETCH REQUESTS ─────────────────────────────
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (isAdUrl(url)) {
      console.log('[ShieldBlock] Blocked fetch:', url);
      return Promise.resolve(new Response('', { status: 200, statusText: 'Blocked' }));
    }
    return origFetch.apply(this, arguments);
  };

  // ─── 3. INTERCEPT XMLHttpRequest ──────────────────────────────
  const origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._shieldUrl = typeof url === 'string' ? url : String(url);
    if (isAdUrl(this._shieldUrl)) {
      this._shieldBlocked = true;
    }
    return origXHROpen.apply(this, arguments);
  };

  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    if (this._shieldBlocked) {
      console.log('[ShieldBlock] Blocked XHR:', this._shieldUrl);
      Object.defineProperty(this, 'status', { value: 200 });
      Object.defineProperty(this, 'readyState', { value: 4 });
      Object.defineProperty(this, 'response', { value: '' });
      Object.defineProperty(this, 'responseText', { value: '' });
      this.dispatchEvent(new Event('load'));
      return;
    }
    return origXHRSend.apply(this, arguments);
  };

  // ─── 4. INTERCEPT BEACON & SENDBEACON ─────────────────────────
  const origBeacon = navigator.sendBeacon;
  if (origBeacon) {
    navigator.sendBeacon = function(url, data) {
      if (isAdUrl(url)) {
        console.log('[ShieldBlock] Blocked beacon:', url);
        return true;
      }
      return origBeacon.apply(this, arguments);
    };
  }

  // ─── 5. NEUTRALIZE AD LIBRARIES ──────────────────────────────
  // Pre-define common ad library objects as no-ops
  const noopFn = function() { return noopFn; };
  noopFn.prototype = noopFn;
  const noopObj = new Proxy({}, {
    get: () => noopFn,
    set: () => true
  });

  const adLibraries = [
    'google_ad_client', 'google_ad_slot', 'google_ad_width', 'google_ad_height',
    'google_ads_iframe', 'google_ad_format', 'google_reactive_ad_format',
    'adsbygoogle', 'googletag', '_gaq', 'ga', 'gtag', 'dataLayer',
    '__gads', '_taboola', '_outbrain', 'MGID', 'RC_WIDGET',
    'AdButler', 'revenuehits', '__cmp', '__tcfapi'
  ];

  // Set googletag as a functional no-op to prevent errors
  window.googletag = window.googletag || {};
  window.googletag.cmd = window.googletag.cmd || [];
  window.googletag.pubads = () => ({
    addEventListener: noopFn, setTargeting: noopFn, enableSingleRequest: noopFn,
    set: noopFn, get: noopFn, getSlots: () => [], refresh: noopFn,
    disableInitialLoad: noopFn, enableLazyLoad: noopFn, collapseEmptyDivs: noopFn,
    clear: noopFn, updateCorrelator: noopFn, setPrivacySettings: noopFn,
    setRequestNonPersonalizedAds: noopFn, getTargeting: () => [], getTargetingKeys: () => [],
    getAttributeKeys: () => [], display: noopFn, enableVideoAds: noopFn
  });
  window.googletag.enableServices = noopFn;
  window.googletag.display = noopFn;
  window.googletag.defineSlot = () => ({ addService: () => ({ addService: noopFn }), defineSizeMapping: noopFn, setTargeting: noopFn, set: noopFn, get: noopFn });
  window.googletag.defineOutOfPageSlot = window.googletag.defineSlot;
  window.googletag.companionAds = () => ({ setRefreshUnfilledSlots: noopFn });
  window.googletag.sizeMapping = () => ({ addSize: function() { return this; }, build: () => [] });
  window.googletag.apiReady = true;
  window.googletag.pubadsReady = true;

  // Neutralize adsbygoogle
  window.adsbygoogle = window.adsbygoogle || [];
  const origAdsPush = window.adsbygoogle.push;
  window.adsbygoogle.push = function() {
    // Silently consume ad push requests
    return 0;
  };

  // ─── 6. KILL AD SCRIPT TAGS IN DOM ───────────────────────────
  const scriptObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        // Check scripts
        if (node.tagName === 'SCRIPT') {
          const src = node.src || '';
          const text = node.textContent || '';
          if (isAdUrl(src) || isAdScript(text)) {
            node.type = 'javascript/blocked';
            node.textContent = '';
            if (node.src) node.removeAttribute('src');
            node.remove();
            continue;
          }
        }

        // Check iframes
        if (node.tagName === 'IFRAME') {
          const src = node.src || '';
          if (isAdUrl(src) || isAdIframe(node)) {
            node.remove();
            continue;
          }
        }

        // Check child scripts/iframes in added containers
        if (node.querySelectorAll) {
          node.querySelectorAll('script[src]').forEach(s => {
            if (isAdUrl(s.src)) {
              s.type = 'javascript/blocked';
              s.textContent = '';
              s.removeAttribute('src');
              s.remove();
            }
          });
          node.querySelectorAll('iframe').forEach(f => {
            if (isAdUrl(f.src) || isAdIframe(f)) {
              f.remove();
            }
          });
        }
      }
    }
  });

  // Start observing as early as possible
  if (document.documentElement) {
    scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  // ─── 7. BLOCK POPUPS & window.open ───────────────────────────
  let lastInteraction = 0;
  const trackInteraction = () => { lastInteraction = Date.now(); };
  document.addEventListener('click', trackInteraction, true);
  document.addEventListener('mousedown', trackInteraction, true);
  document.addEventListener('touchstart', trackInteraction, true);
  document.addEventListener('keydown', trackInteraction, true);

  const origWindowOpen = window.open;
  window.open = function(url) {
    const timeSince = Date.now() - lastInteraction;
    if (timeSince > 1500) {
      console.log('[ShieldBlock] Blocked popup:', url);
      return null;
    }
    if (typeof url === 'string' && isAdUrl(url)) {
      console.log('[ShieldBlock] Blocked ad popup:', url);
      return null;
    }
    return origWindowOpen.apply(this, arguments);
  };

  // ─── DETECTION FUNCTIONS ──────────────────────────────────────

  function isAdUrl(url) {
    if (!url || typeof url !== 'string') return false;
    url = url.toLowerCase();

    // Ad network domains
    const adDomains = [
      'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
      'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
      'adservice.google.', 'pagead2.', 'imasdk.googleapis.com',
      'adnxs.com', 'adsrvr.org', 'adform.net', 'serving-sys.com',
      'outbrain.com', 'taboola.com', 'revcontent.com', 'mgid.com',
      'criteo.com', 'criteo.net', 'rubiconproject.com', 'pubmatic.com',
      'openx.net', 'casalemedia.com', 'amazon-adsystem.com',
      'moatads.com', 'adsafeprotected.com', 'popads.net', 'popcash.net',
      'propellerads.com', 'adcash.com', 'adsterra.com', 'exoclick.com',
      'clickadu.com', 'hilltopads.net', 'ad-maven.com', 'trafficjunky.com',
      'juicyads.com', 'adcolony.com', 'admob.com', 'inmobi.com',
      'smaato.net', 'mopub.com', 'vungle.com', 'unityads.unity3d.com',
      'adroll.com', 'mathtag.com', 'bidswitch.net', 'smartadserver.com',
      'contextweb.com', 'yieldmo.com', 'sharethrough.com', 'zedo.com',
      'spotxchange.com', 'lijit.com', 'indexww.com', 'triplelift.com',
      'sovrn.com', 'gumgum.com', 'teads.tv', 'nativo.com',
      'scorecardresearch.com', 'quantserve.com', 'bluekai.com',
      'demdex.net', 'krxd.net', 'exelator.com', 'tapad.com',
      'hotjar.com', 'mixpanel.com', 'amplitude.com', 'fullstory.com',
      'mouseflow.com', 'luckyorange.com', 'crazyegg.com',
      'facebook.com/tr', 'connect.facebook.net/en_US/fbevents',
      'bat.bing.com', 'snap.licdn.com', 'ads.linkedin.com',
      'analytics.twitter.com', 'ads-api.twitter.com',
      'securepubads.', 'tpc.googlesyndication.',
      'static.doubleclick.', 'ad.doubleclick.',
      'mediavisor.doubleclick.', 'cm.g.doubleclick.',
      'bid.g.doubleclick.', 'pagead.l.doubleclick.'
    ];

    // URL path patterns
    const adPaths = [
      '/pagead/', '/pcs/activeview', '/ads/', '/adserver/',
      '/ad_status', '/get_midroll', '/ptracking', '/api/stats/ads',
      '/adx/', '/ad/js/', '/ad_frame', '/adsense/',
      '/adview', '/ad_click', '/aclk?', '/pagead/lvz',
      '/generate_204?', '/adlog/', '/beacon/ad',
      '/serve/ad', '/delivery/ad', '/bidrequest'
    ];

    for (const domain of adDomains) {
      if (url.includes(domain)) return true;
    }
    for (const path of adPaths) {
      if (url.includes(path)) return true;
    }

    return false;
  }

  function isAdScript(text) {
    if (!text || text.length < 20) return false;
    const adPatterns = [
      'googlesyndication', 'adsbygoogle', 'google_ad_client',
      'google_ad_slot', 'doubleclick', 'googletagservices',
      'adservice.google', 'pagead/js/', 'show_ads_impl',
      'partnerad', 'adpushup', 'adthrive', 'mediavine',
      '__cmp(', 'quantcast', 'pubads()', 'gpt.js'
    ];
    const lowerText = text.toLowerCase().substring(0, 2000);
    return adPatterns.some(p => lowerText.includes(p));
  }

  function isAdIframe(iframe) {
    const id = (iframe.id || '').toLowerCase();
    const name = (iframe.name || '').toLowerCase();
    const cls = (iframe.className || '').toLowerCase();
    const adTerms = ['google_ads', 'ad_iframe', 'adfr', 'gpt_', 'ad-slot', 'ad_unit'];
    return adTerms.some(t => id.includes(t) || name.includes(t) || cls.includes(t));
  }
})();
