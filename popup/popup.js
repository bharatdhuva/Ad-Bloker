/**
 * ShieldBlock — Popup Controller
 * Handles UI state, messaging with background worker, and user interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ─── DOM Elements ────────────────────────────────────────────
  const toggleInput = document.getElementById('toggle-input');
  const toggleState = document.getElementById('toggle-state');
  const statusText = document.getElementById('status-text');
  const totalBlocked = document.getElementById('total-blocked');
  const siteBlocked = document.getElementById('site-blocked');
  const siteHostname = document.getElementById('site-hostname');
  const siteStatus = document.getElementById('site-status');
  const whitelistBtn = document.getElementById('whitelist-btn');
  const whitelistText = document.getElementById('whitelist-text');
  const resetBtn = document.getElementById('reset-btn');

  let currentHostname = null;
  let currentState = null;

  // ─── Initialize ──────────────────────────────────────────────
  async function init() {
    // Get extension state
    currentState = await sendMessage({ type: 'GET_STATE' });
    updateToggleUI(currentState.enabled);
    updateStats(currentState);

    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      try {
        const url = new URL(tab.url);
        currentHostname = url.hostname;
        siteHostname.textContent = currentHostname;

        // Get site-specific stats
        const siteStats = await sendMessage({
          type: 'GET_SITE_STATS',
          hostname: currentHostname
        });

        siteBlocked.textContent = formatNumber(siteStats.blocked);
        updateWhitelistUI(siteStats.isWhitelisted);

        if (currentState.enabled) {
          siteStatus.textContent = siteStats.isWhitelisted ? 'Whitelisted' : 'Protected';
          siteStatus.style.color = siteStats.isWhitelisted ? '#ffd93d' : '#00cec9';
        } else {
          siteStatus.textContent = 'Protection off';
          siteStatus.style.color = '#ff6b6b';
        }
      } catch (e) {
        siteHostname.textContent = 'N/A';
        siteStatus.textContent = 'Internal page';
        siteStatus.style.color = '#6c6c80';
      }
    }
  }

  // ─── Toggle Handler ──────────────────────────────────────────
  toggleInput.addEventListener('change', async () => {
    const enabled = toggleInput.checked;
    currentState = await sendMessage({ type: 'TOGGLE_ENABLED', enabled });
    updateToggleUI(enabled);

    if (currentHostname) {
      siteStatus.textContent = enabled ? 'Protected' : 'Protection off';
      siteStatus.style.color = enabled ? '#00cec9' : '#ff6b6b';
    }
  });

  // ─── Whitelist Handler ───────────────────────────────────────
  whitelistBtn.addEventListener('click', async () => {
    if (!currentHostname) return;

    const isCurrentlyWhitelisted = whitelistBtn.classList.contains('active');

    if (isCurrentlyWhitelisted) {
      currentState = await sendMessage({
        type: 'REMOVE_WHITELIST',
        hostname: currentHostname
      });
      updateWhitelistUI(false);
      siteStatus.textContent = 'Protected';
      siteStatus.style.color = '#00cec9';
    } else {
      currentState = await sendMessage({
        type: 'ADD_WHITELIST',
        hostname: currentHostname
      });
      updateWhitelistUI(true);
      siteStatus.textContent = 'Whitelisted';
      siteStatus.style.color = '#ffd93d';
    }
  });

  // ─── Reset Stats ─────────────────────────────────────────────
  resetBtn.addEventListener('click', async () => {
    currentState = await sendMessage({ type: 'RESET_STATS' });
    updateStats(currentState);
    siteBlocked.textContent = '0';

    // Brief visual feedback
    resetBtn.textContent = '✓ Reset';
    resetBtn.style.color = '#00cec9';
    setTimeout(() => {
      resetBtn.textContent = 'Reset Stats';
      resetBtn.style.color = '';
    }, 1200);
  });

  // ─── UI Updaters ─────────────────────────────────────────────
  function updateToggleUI(enabled) {
    toggleInput.checked = enabled;
    toggleState.textContent = enabled ? 'Enabled' : 'Disabled';
    toggleState.className = 'toggle-state ' + (enabled ? 'on' : 'off');
    statusText.textContent = enabled ? 'active' : 'paused';
    statusText.className = enabled ? 'status-active' : 'status-inactive';
    document.body.classList.toggle('disabled', !enabled);
  }

  function updateStats(state) {
    totalBlocked.textContent = formatNumber(state.totalBlocked || 0);
  }

  function updateWhitelistUI(isWhitelisted) {
    whitelistBtn.classList.toggle('active', isWhitelisted);
    whitelistText.textContent = isWhitelisted ? 'Whitelisted' : 'Whitelist';
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
  }

  // ─── Messaging ───────────────────────────────────────────────
  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response || {});
      });
    });
  }

  // Start
  init();
});
