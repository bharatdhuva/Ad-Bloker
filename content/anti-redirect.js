/**
 * ShieldBlock — Anti-Redirect & Popup Protection
 * Blocks malicious redirects, popup windows, and clickjacking overlays.
 */
(function() {
  'use strict';

  // ─── Block popup windows ─────────────────────────────────────
  const origOpen = window.open;
  let lastUserClick = 0;

  document.addEventListener('click', () => { lastUserClick = Date.now(); }, true);
  document.addEventListener('mousedown', () => { lastUserClick = Date.now(); }, true);

  window.open = function(url, ...args) {
    const timeSinceClick = Date.now() - lastUserClick;
    // Only allow popups within 1 second of a user click
    if (timeSinceClick > 1000) {
      console.log('[ShieldBlock] Blocked popup:', url);
      return null;
    }
    // Block known ad/redirect URLs
    if (typeof url === 'string' && isAdUrl(url)) {
      console.log('[ShieldBlock] Blocked ad popup:', url);
      return null;
    }
    return origOpen.call(this, url, ...args);
  };

  // ─── Prevent JS redirects ────────────────────────────────────
  let originalLocation = window.location.href;

  // Block assignment to location via setter
  const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
  if (locationDescriptor && locationDescriptor.configurable) {
    try {
      const origSetter = locationDescriptor.set;
      Object.defineProperty(window, 'location', {
        get: locationDescriptor.get,
        set: function(val) {
          const timeSinceClick = Date.now() - lastUserClick;
          if (timeSinceClick > 1000 && typeof val === 'string' && isAdUrl(val)) {
            console.log('[ShieldBlock] Blocked redirect to:', val);
            return;
          }
          origSetter.call(this, val);
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) { /* Some browsers won't allow this */ }
  }

  // ─── Remove clickjacking overlays ─────────────────────────────
  function removeClickjackOverlays() {
    document.querySelectorAll('div, iframe').forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && style.zIndex > 9000 &&
          parseFloat(style.opacity) < 0.15 &&
          el.offsetWidth > window.innerWidth * 0.5 &&
          el.offsetHeight > window.innerHeight * 0.5) {
        el.remove();
      }
    });

    // Remove invisible iframes covering the page
    document.querySelectorAll('iframe').forEach(iframe => {
      const style = getComputedStyle(iframe);
      if ((style.opacity === '0' || style.visibility === 'hidden') &&
          iframe.offsetWidth > 100 && iframe.offsetHeight > 100 &&
          style.position === 'fixed') {
        iframe.remove();
      }
    });
  }

  function isAdUrl(url) {
    const adDomains = [
      'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
      'adnxs.com', 'taboola.com', 'outbrain.com', 'popads.net',
      'popcash.net', 'propellerads.com', 'trafficjunky.com',
      'adcash.com', 'adsterra.com', 'exoclick.com', 'juicyads.com',
      'clickadu.com', 'hilltopads.net', 'adf.ly', 'bit.ly/ad',
      'shrink.', 'sh.st', 'bc.vc', 'binance.com/ad'
    ];
    try {
      const hostname = new URL(url, location.href).hostname;
      return adDomains.some(d => hostname.includes(d));
    } catch (e) {
      return false;
    }
  }

  // Run overlay cleanup periodically
  setInterval(removeClickjackOverlays, 2000);
  document.addEventListener('DOMContentLoaded', removeClickjackOverlays);
})();
