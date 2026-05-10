/**
 * ShieldBlock — Content Script
 * Performs cosmetic filtering: hides ad elements from the DOM
 * without affecting legitimate website content.
 */

(function ShieldBlockContentScript() {
  'use strict';

  // ─── Ad Element Selectors ────────────────────────────────────────
  const AD_SELECTORS = [
    // Google Ads
    'ins.adsbygoogle',
    'div[id^="google_ads"]',
    'div[id^="div-gpt-ad"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[id*="google_ads"]',

    // Generic ad containers
    'div[class*="ad-container"]',
    'div[class*="ad-wrapper"]',
    'div[class*="ad-banner"]',
    'div[class*="ad-slot"]',
    'div[class*="ad-unit"]',
    'div[class*="advert-"]',
    'div[class*="advertisement"]',
    'div[id*="ad-container"]',
    'div[id*="ad-wrapper"]',
    'div[id*="ad-banner"]',
    'section[class*="ad-"]',
    'aside[class*="ad-"]',

    // Common ad iframes
    'iframe[src*="ads"]',
    'iframe[src*="adserver"]',
    'iframe[src*="adnxs.com"]',
    'iframe[src*="taboola"]',
    'iframe[src*="outbrain"]',

    // Sponsored content
    'div[class*="sponsored"]',
    'div[id*="sponsored"]',
    'article[class*="sponsored"]',
    'a[href*="sponsored"]',

    // Taboola/Outbrain widgets
    'div[id*="taboola"]',
    'div[class*="taboola"]',
    'div[id*="outbrain"]',
    'div[class*="outbrain"]',
    'div.OUTBRAIN',

    // Popup/overlay ads
    'div[class*="popup-ad"]',
    'div[class*="modal-ad"]',
    'div[class*="interstitial"]',
    'div[id*="interstitial"]',

    // Social media ads
    'div[data-ad-slot]',
    'div[data-ad-client]',
    'div[data-google-query-id]',

    // Amazon ads
    'div[class*="a-ad"]',
    'div[id*="ape_Detail_ad"]',

    // Generic patterns
    '[aria-label="advertisement"]',
    '[aria-label="Advertisement"]',
    '[aria-label="Sponsored"]',
    '[data-testid*="ad"]',
    '[data-ad]',
    '[data-ads]',
    '[data-adunit]'
  ];

  // Selectors that should NOT be hidden (safeguard against false positives)
  const SAFE_SELECTORS = [
    'nav', 'header:not([class*="ad"])', 'footer:not([class*="ad"])',
    'main', 'article:not([class*="sponsored"])',
    '#content', '.content', '.main-content',
    'form', 'input', 'button:not([class*="ad"])',
    'video:not([class*="ad"])', 'audio'
  ];

  // ─── Core Hiding Logic ──────────────────────────────────────────
  function hideAdElements() {
    const selectorString = AD_SELECTORS.join(', ');
    const adElements = document.querySelectorAll(selectorString);

    adElements.forEach(el => {
      // Don't hide if it matches a safe selector or is too large (likely a layout container)
      if (isSafeElement(el)) return;

      // Apply hiding via attribute for CSS rule
      if (!el.hasAttribute('data-shieldblock-hidden')) {
        el.setAttribute('data-shieldblock-hidden', 'true');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('height', '0', 'important');
        el.style.setProperty('min-height', '0', 'important');
        el.style.setProperty('max-height', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      }
    });
  }

  function isSafeElement(el) {
    // Don't hide elements that are critical to page structure
    const tag = el.tagName.toLowerCase();
    if (['body', 'html', 'head', 'main', 'nav'].includes(tag)) return true;

    // Don't hide very large containers (likely not just ads)
    const rect = el.getBoundingClientRect();
    if (rect.width > window.innerWidth * 0.9 && rect.height > window.innerHeight * 0.8) {
      return true;
    }

    // Check if element contains significant non-ad content
    const textLength = (el.textContent || '').trim().length;
    const childCount = el.children.length;
    if (textLength > 2000 && childCount > 10) return true;

    return false;
  }

  // ─── Mutation Observer ──────────────────────────────────────────
  // Watch for dynamically inserted ad elements
  const observer = new MutationObserver((mutations) => {
    let hasNewNodes = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) {
      requestAnimationFrame(hideAdElements);
    }
  });

  // ─── Initialize ─────────────────────────────────────────────────
  function init() {
    // Check if this site is whitelisted
    chrome.runtime?.sendMessage(
      { type: 'GET_SITE_STATS', hostname: location.hostname },
      (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.isWhitelisted) return; // Don't filter whitelisted sites

        // Run initial pass
        hideAdElements();

        // Observe DOM changes
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true
        });

        // Run again after page load
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', hideAdElements);
        }
        window.addEventListener('load', () => {
          hideAdElements();
          // Delayed pass for lazy-loaded ads
          setTimeout(hideAdElements, 2000);
          setTimeout(hideAdElements, 5000);
        });
      }
    );
  }

  init();
})();
