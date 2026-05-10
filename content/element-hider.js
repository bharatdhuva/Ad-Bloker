/**
 * ShieldBlock — Universal Element Hider
 * Runs at document_idle to aggressively scan and hide any ad elements
 * that survived the script interceptor. Works on ANY website.
 */
(function() {
  'use strict';

  // ─── AD SELECTORS (universal across all sites) ────────────────
  const AD_SELECTORS = [
    // Google Ads
    'ins.adsbygoogle', 'div[id^="google_ads"]', 'div[id^="div-gpt-ad"]',
    'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
    'iframe[id*="google_ads"]', 'div[id^="google_ad"]',
    '.adsbygoogle', '#google_ads_frame', '[id^="aswift_"]',

    // Generic ad patterns by class/id
    '[class*="ad-container"]', '[class*="ad-wrapper"]', '[class*="ad-banner"]',
    '[class*="ad-slot"]', '[class*="ad-unit"]', '[class*="ad-block"]',
    '[class*="ad-placement"]', '[class*="ad-holder"]', '[class*="ad-zone"]',
    '[class*="advert-"]', '[class*="advertisement"]', '[class*="ad-space"]',
    '[id*="ad-container"]', '[id*="ad-wrapper"]', '[id*="ad-banner"]',
    '[id*="ad-slot"]', '[id*="ad_unit"]', '[id*="ad-placement"]',

    // Iframes
    'iframe[src*="ads"]', 'iframe[src*="adserver"]', 'iframe[src*="adnxs"]',
    'iframe[src*="taboola"]', 'iframe[src*="outbrain"]',
    'iframe[src*="amazon-adsystem"]', 'iframe[src*="criteo"]',

    // Taboola/Outbrain/MGID widgets
    '[id*="taboola"]', '[class*="taboola"]', '.trc_related_container',
    '[id*="outbrain"]', '[class*="outbrain"]', '.OUTBRAIN',
    '[id*="mgid"]', '[class*="mgid"]',

    // Sponsored content
    '[class*="sponsored"]', '[id*="sponsored"]',
    'article[class*="sponsored"]', '[data-ad]', '[data-ads]',
    '[data-ad-slot]', '[data-ad-client]', '[data-google-query-id]',

    // Popup/overlay ads
    '[class*="popup-ad"]', '[class*="modal-ad"]',
    '[class*="interstitial"]', '[id*="interstitial"]',

    // Aria labels
    '[aria-label="advertisement" i]', '[aria-label="sponsored" i]',
    '[aria-label="ad" i]',

    // Common ad frameworks
    '.ad-leaderboard', '.ad-sidebar', '.ad-footer', '.ad-header',
    '.dfp-ad', '.js-ad', '.ad-flex', '.ad-top', '.ad-bottom',
    '.ad-left', '.ad-right', '.ad-middle', '.ad-inline',
    '#ad-leaderboard', '#ad-sidebar', '#ad-footer', '#ad-header'
  ];

  // ─── SAFE ELEMENTS (never hide these) ─────────────────────────
  function isSafe(el) {
    const tag = el.tagName.toLowerCase();
    if (['body', 'html', 'head', 'main', 'nav', 'header', 'footer'].includes(tag)) return true;

    // Don't hide if it's a major layout container
    const rect = el.getBoundingClientRect();
    if (rect.width > window.innerWidth * 0.85 && rect.height > window.innerHeight * 0.7) return true;

    // Don't hide if it has lots of non-ad content
    const text = (el.textContent || '').trim();
    if (text.length > 3000 && el.children.length > 15) return true;

    return false;
  }

  // ─── HIDE AD ELEMENTS ────────────────────────────────────────
  function hideAds() {
    const selector = AD_SELECTORS.join(',');
    document.querySelectorAll(selector).forEach(el => {
      if (isSafe(el)) return;
      if (el.dataset.shieldblockHidden) return;

      el.dataset.shieldblockHidden = 'true';
      el.style.cssText = 'display:none!important;height:0!important;min-height:0!important;' +
        'max-height:0!important;overflow:hidden!important;opacity:0!important;' +
        'pointer-events:none!important;position:absolute!important;z-index:-9999!important;';
    });

    // Also hide empty ad iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      const src = (iframe.src || '').toLowerCase();
      if (src && (src.includes('ad') || src.includes('doubleclick') ||
          src.includes('googlesyndication') || src.includes('taboola'))) {
        if (!isSafe(iframe)) {
          iframe.style.cssText = 'display:none!important;height:0!important;';
        }
      }
    });

    // Collapse empty ad wrappers
    document.querySelectorAll('[class*="ad-"],[id*="ad-"],[class*="ad_"],[id*="ad_"]').forEach(el => {
      if (isSafe(el)) return;
      const rect = el.getBoundingClientRect();
      // Small empty containers that are likely ad placeholders
      if (rect.height < 5 && rect.width > 100) {
        el.style.display = 'none';
      }
    });
  }

  // ─── OBSERVER ─────────────────────────────────────────────────
  const observer = new MutationObserver(() => {
    requestAnimationFrame(hideAds);
  });

  hideAds();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => {
    hideAds();
    setTimeout(hideAds, 1500);
    setTimeout(hideAds, 4000);
  });
})();
