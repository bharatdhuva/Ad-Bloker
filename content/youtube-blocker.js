/**
 * ShieldBlock — YouTube Ad Blocker
 * Specifically targets YouTube video ads, overlay ads, and sponsored content.
 */
(function() {
  'use strict';

  if (!location.hostname.includes('youtube.com')) return;

  const LOG_PREFIX = '[ShieldBlock YT]';
  let skipAttempts = 0;

  // ─── Auto-skip video ads ──────────────────────────────────────
  function skipVideoAd() {
    // Click "Skip Ad" button variants
    const skipSelectors = [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      'button.ytp-ad-skip-button',
      '.ytp-ad-skip-button-slot button',
      '[id="skip-button:"] button',
      '.ytp-ad-skip-button-container button',
      'button[id^="skip-button"]',
      '.ytp-skip-ad button'
    ];

    for (const sel of skipSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return true;
      }
    }

    // Force skip by seeking to end of ad
    const video = document.querySelector('video.html5-main-video');
    const adIndicator = document.querySelector('.ytp-ad-player-overlay, .ad-showing, .ytp-ad-text');
    if (video && adIndicator) {
      if (video.duration && isFinite(video.duration)) {
        video.currentTime = video.duration;
        video.playbackRate = 16;
        return true;
      }
    }

    return false;
  }

  // ─── Remove ad overlays and banners ───────────────────────────
  function removeAdOverlays() {
    const adSelectors = [
      // Video ad overlays
      '.ytp-ad-overlay-container',
      '.ytp-ad-overlay-slot',
      '.ytp-ad-text-overlay',
      '.ytp-ad-image-overlay',
      // Banner ads
      'ytd-banner-promo-renderer',
      'ytd-statement-banner-renderer',
      'ytd-in-feed-ad-layout-renderer',
      'ytd-ad-slot-renderer',
      'ytd-display-ad-renderer',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-promoted-sparkles-text-search-renderer',
      'ytd-promoted-video-renderer',
      'ytd-compact-promoted-video-renderer',
      'ytd-video-masthead-ad-v3-renderer',
      'ytd-video-masthead-ad-advertiser-info-renderer',
      'ytd-primetime-promo-renderer',
      'ytd-action-companion-ad-renderer',
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
      '#player-ads',
      '#masthead-ad',
      // Sidebar ads
      'ytd-merch-shelf-renderer',
      'ytd-brand-video-singleton-renderer',
      'ytd-brand-video-shelf-renderer',
      // Search/feed ads
      'ytd-search-pyv-renderer',
      'ytd-promoted-sparkles-web-renderer',
      '.ytd-search-pyv-renderer',
      // Movie offers/promotions
      'ytd-movie-offer-module-renderer',
      // Popup/dialog ads
      'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
      'ytd-popup-container:has(.ytd-enforcement-message-view-model)',
      // Homepage ad shelves
      'ytd-rich-section-renderer:has(ytd-ad-slot-renderer)',
      // Shorts ads
      'ytd-reel-video-renderer:has(.ytd-ad-slot-renderer)'
    ];

    adSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.remove();
      });
    });

    // Remove "ad" badge containers
    document.querySelectorAll('.badge-style-type-ad, .ytd-badge-supported-renderer:has(.badge-style-type-ad)').forEach(el => {
      const parent = el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer');
      if (parent) parent.remove();
    });
  }

  // ─── Handle ad-showing class on player ────────────────────────
  function handleAdShowing() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return;

    if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
      const video = player.querySelector('video');
      if (video) {
        // Mute and speed through ad
        video.muted = true;
        video.playbackRate = 16;
        if (video.duration && isFinite(video.duration)) {
          video.currentTime = video.duration;
        }
      }
      skipVideoAd();
      skipAttempts++;

      // After 3 failed attempts, try aggressive removal
      if (skipAttempts > 3) {
        player.classList.remove('ad-showing', 'ad-interrupting');
        const adContainer = player.querySelector('.video-ads');
        if (adContainer) adContainer.innerHTML = '';
        skipAttempts = 0;
      }
    } else {
      skipAttempts = 0;
      // Restore normal playback
      const video = player.querySelector('video');
      if (video && video.playbackRate === 16) {
        video.playbackRate = 1;
        video.muted = false;
      }
    }
  }

  // ─── Block pre-roll via fetch/XHR interception ────────────────
  const origFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (isAdRequest(url)) {
      return Promise.resolve(new Response('', { status: 200 }));
    }
    return origFetch.apply(this, args);
  };

  const origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (typeof url === 'string' && isAdRequest(url)) {
      this._blocked = true;
    }
    return origXHROpen.call(this, method, url, ...rest);
  };

  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    if (this._blocked) {
      this.abort();
      return;
    }
    return origXHRSend.apply(this, args);
  };

  function isAdRequest(url) {
    const adPatterns = [
      '/pagead/', '/ptracking', '/api/stats/ads',
      'doubleclick.net', '/ad_status', 'google_ads',
      '/get_midroll_', 'googleads', 'get_video_info.*ad',
      '/api/stats/watchtime.*adformat', 'ad_data',
      'youtube.com/api/stats/qoe.*ad', '/pcs/activeview',
      'securepubads', 'pagead2.googlesyndication',
      '/generate_204', 'youtube.com/pagead/',
      'youtube.com/get_midroll', 'youtube.com/ptracking',
      'youtubei/v1/player/ad_break'
    ];
    return adPatterns.some(p => url.includes(p));
  }

  // ─── Main loop ────────────────────────────────────────────────
  function mainLoop() {
    handleAdShowing();
    removeAdOverlays();
    skipVideoAd();
  }

  // Run frequently to catch ads as they appear
  setInterval(mainLoop, 500);

  // Also observe DOM mutations for new ad elements
  const observer = new MutationObserver(() => {
    requestAnimationFrame(mainLoop);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Initial run
  mainLoop();
  window.addEventListener('yt-navigate-finish', mainLoop);
  window.addEventListener('load', () => { mainLoop(); setTimeout(mainLoop, 1500); });
})();
