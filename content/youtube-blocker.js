/**
 * ShieldBlock — Deep YouTube Ad Blocker
 * Intercepts YouTube's player API responses to strip ad configuration
 * at the data level, before ads are ever rendered.
 */
(function() {
  'use strict';

  if (!location.hostname.includes('youtube.com')) return;

  // ─── 1. STRIP ADS FROM PLAYER RESPONSE DATA ──────────────────
  // This is the core — YouTube configures ads in the player JSON response.
  // We intercept and remove all ad-related keys before the player reads them.

  const AD_KEYS = [
    'adPlacements', 'adSlots', 'adBreakParams', 'adBreakHeartbeatParams',
    'playerAds', 'adParams', 'adDevice', 'adSignals', 'adSlotLoggingData',
    'instreamAdPlayerOverlayRenderer', 'linearAdSequenceRenderer',
    'adLayoutLoggingData', 'inPlayerSlotId', 'adInfoRenderer',
    'adNextParams', 'adModule', 'playerLegacyDesktopWatchAdsRenderer',
    'adPlacements', 'adBreakParams', 'adVideoId'
  ];

  function stripAdsFromObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => stripAdsFromObject(item)).filter(Boolean);
    }

    for (const key of AD_KEYS) {
      if (key in obj) {
        delete obj[key];
      }
    }

    // Remove ad renderers from arrays
    for (const key in obj) {
      if (key.toLowerCase().includes('ad') && key.toLowerCase().includes('renderer')) {
        delete obj[key];
        continue;
      }
      if (typeof obj[key] === 'object') {
        obj[key] = stripAdsFromObject(obj[key]);
      }
    }

    return obj;
  }

  // ─── 2. INTERCEPT ytInitialPlayerResponse ─────────────────────
  // YouTube embeds the player config as a global variable
  let initialResponseCleaned = false;

  function cleanInitialResponse() {
    if (initialResponseCleaned) return;
    if (window.ytInitialPlayerResponse) {
      stripAdsFromObject(window.ytInitialPlayerResponse);
      initialResponseCleaned = true;
    }
  }

  // Override the property to clean it when YouTube sets it
  try {
    let _ytInitialPlayerResponse = window.ytInitialPlayerResponse;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      get: function() { return _ytInitialPlayerResponse; },
      set: function(val) {
        if (val && typeof val === 'object') {
          stripAdsFromObject(val);
        }
        _ytInitialPlayerResponse = val;
        initialResponseCleaned = true;
      },
      configurable: true
    });
  } catch(e) {}

  // Also intercept ytInitialData for feed/search ads
  try {
    let _ytInitialData = window.ytInitialData;
    Object.defineProperty(window, 'ytInitialData', {
      get: function() { return _ytInitialData; },
      set: function(val) {
        if (val && typeof val === 'object') {
          removeFeedAds(val);
        }
        _ytInitialData = val;
      },
      configurable: true
    });
  } catch(e) {}

  function removeFeedAds(data) {
    if (!data) return;
    // Remove promoted/ad items from video feeds
    const paths = [
      'contents.twoColumnBrowseResultsRenderer.tabs',
      'contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents'
    ];
    try {
      // Deep scan for ad renderers in feed
      JSON.stringify(data, (key, value) => {
        if (key === 'adSlotRenderer' || key === 'promotedSparklesWebRenderer' ||
            key === 'promotedVideoRenderer' || key === 'searchPyvRenderer' ||
            key === 'adSlotAndLayoutMetadata' || key === 'inFeedAdLayoutRenderer' ||
            key === 'displayAdRenderer' || key === 'brandVideoSingletonRenderer') {
          return undefined;
        }
        return value;
      });
    } catch(e) {}
  }

  // ─── 3. INTERCEPT FETCH FOR /youtubei/ API CALLS ──────────────
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';

    // Block direct ad requests
    if (isYTAdRequest(url)) {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const response = await origFetch.apply(this, arguments);

    // Intercept player API responses and strip ads
    if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next')) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        stripAdsFromObject(data);
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch(e) {
        return response;
      }
    }

    return response;
  };

  // ─── 4. INTERCEPT XHR FOR PLAYER API ──────────────────────────
  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._shieldUrl = url || '';
    if (isYTAdRequest(this._shieldUrl)) {
      this._shieldBlocked = true;
    }
    if (this._shieldUrl.includes('/youtubei/v1/player') ||
        this._shieldUrl.includes('/youtubei/v1/next')) {
      this._shieldIntercept = true;
    }
    return origXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    if (this._shieldBlocked) {
      Object.defineProperty(this, 'readyState', { value: 4, writable: false });
      Object.defineProperty(this, 'status', { value: 200, writable: false });
      Object.defineProperty(this, 'responseText', { value: '{}', writable: false });
      this.dispatchEvent(new Event('load'));
      this.dispatchEvent(new Event('loadend'));
      return;
    }

    if (this._shieldIntercept) {
      this.addEventListener('load', function() {
        try {
          const data = JSON.parse(this.responseText);
          stripAdsFromObject(data);
          Object.defineProperty(this, 'responseText', {
            value: JSON.stringify(data), writable: false
          });
          Object.defineProperty(this, 'response', {
            value: JSON.stringify(data), writable: false
          });
        } catch(e) {}
      });
    }

    return origXHRSend.apply(this, arguments);
  };

  // ─── 5. AUTO-SKIP & DOM CLEANUP ───────────────────────────────
  function skipAndClean() {
    // Click skip buttons
    const skipBtns = document.querySelectorAll(
      '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, ' +
      'button[id^="skip-button"], .ytp-ad-skip-button-slot button'
    );
    skipBtns.forEach(btn => {
      if (btn.offsetParent !== null) btn.click();
    });

    // Handle ad-showing state
    const player = document.querySelector('.html5-video-player');
    if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
      const video = player.querySelector('video');
      if (video && video.duration && isFinite(video.duration)) {
        video.currentTime = video.duration;
        video.muted = true;
      }
    }

    // Remove ad elements
    const adElements = [
      'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer',
      'ytd-banner-promo-renderer', 'ytd-statement-banner-renderer',
      'ytd-promoted-sparkles-web-renderer', 'ytd-promoted-video-renderer',
      'ytd-compact-promoted-video-renderer', 'ytd-display-ad-renderer',
      'ytd-video-masthead-ad-v3-renderer', 'ytd-primetime-promo-renderer',
      'ytd-action-companion-ad-renderer', 'ytd-brand-video-singleton-renderer',
      'ytd-search-pyv-renderer', 'ytd-movie-offer-module-renderer',
      '.ytp-ad-overlay-container', '.ytp-ad-text-overlay',
      '#player-ads', '#masthead-ad', '.ytd-merch-shelf-renderer',
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
      '.ytp-ad-image-overlay', '.ytp-ad-overlay-slot'
    ];

    adElements.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Remove items with ad badges
    document.querySelectorAll('.badge-style-type-ad').forEach(badge => {
      const parent = badge.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-reel-video-renderer');
      if (parent) parent.remove();
    });
  }

  function isYTAdRequest(url) {
    if (!url) return false;
    const patterns = [
      '/pagead/', '/ptracking', '/api/stats/ads', '/get_midroll_',
      'googleads', '/ad_status', '/pcs/activeview', '/generate_204',
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      '/youtubei/v1/player/ad_break', 'securepubads', 'imasdk.googleapis.com',
      '/adlog/', '/api/stats/qoe?adformat', '/api/stats/playback?adformat'
    ];
    return patterns.some(p => url.includes(p));
  }

  // ─── 6. RUN LOOP ─────────────────────────────────────────────
  setInterval(skipAndClean, 500);

  const observer = new MutationObserver(() => {
    requestAnimationFrame(skipAndClean);
    cleanInitialResponse();
  });

  const startObserver = () => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  };

  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver);

  // Handle YouTube SPA navigation
  window.addEventListener('yt-navigate-finish', () => {
    initialResponseCleaned = false;
    cleanInitialResponse();
    skipAndClean();
  });

  window.addEventListener('load', () => {
    cleanInitialResponse();
    skipAndClean();
    setTimeout(skipAndClean, 1000);
    setTimeout(skipAndClean, 3000);
  });
})();
