/**
 * ShieldBlock — Background Service Worker
 * Handles ad blocking stats, whitelist management, and badge updates.
 */

const DEFAULT_STATE = {
  enabled: true,
  totalBlocked: 0,
  sessionBlocked: 0,
  whitelist: [],
  statsPerSite: {}
};

let state = { ...DEFAULT_STATE };

// ─── Initialization ───────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  const stored = await chrome.storage.local.get('shieldblock');
  if (stored.shieldblock) {
    state = { ...DEFAULT_STATE, ...stored.shieldblock, sessionBlocked: 0 };
  }
  await chrome.storage.local.set({ shieldblock: state });
  updateBadge();

  if (details.reason === 'install') {
    console.log('[ShieldBlock] Extension installed — all ad rules active.');
  }
});

// Restore state on service worker startup
chrome.storage.local.get('shieldblock', (result) => {
  if (result.shieldblock) {
    state = { ...DEFAULT_STATE, ...result.shieldblock, sessionBlocked: 0 };
  }
  updateBadge();
});

// ─── Track blocked requests ──────────────────────────────────────
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener((info) => {
  if (!state.enabled) return;

  state.totalBlocked++;
  state.sessionBlocked++;

  // Track per-site stats
  const tabId = info.request.tabId;
  if (tabId > 0) {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab?.url) return;
      try {
        const hostname = new URL(tab.url).hostname;
        if (!state.statsPerSite[hostname]) {
          state.statsPerSite[hostname] = 0;
        }
        state.statsPerSite[hostname]++;
        persistState();
        updateBadgeForTab(tabId, state.statsPerSite[hostname]);
      } catch (e) { /* ignore invalid URLs */ }
    });
  }

  persistState();
});

// Fallback: count matched rules periodically if debug listener not available
if (!chrome.declarativeNetRequest.onRuleMatchedDebug) {
  // Use session rule tracking as an alternative
  setInterval(async () => {
    try {
      const rules = await chrome.declarativeNetRequest.getMatchedRules();
      if (rules?.rulesMatchedInfo?.length) {
        const newCount = rules.rulesMatchedInfo.length;
        if (newCount > state.sessionBlocked) {
          state.totalBlocked += (newCount - state.sessionBlocked);
          state.sessionBlocked = newCount;
          persistState();
          updateBadge();
        }
      }
    } catch (e) { /* API may not be available */ }
  }, 5000);
}

// ─── Whitelist Management ────────────────────────────────────────
async function addToWhitelist(hostname) {
  if (!state.whitelist.includes(hostname)) {
    state.whitelist.push(hostname);
    await updateWhitelistRules();
    await persistState();
  }
}

async function removeFromWhitelist(hostname) {
  state.whitelist = state.whitelist.filter(h => h !== hostname);
  await updateWhitelistRules();
  await persistState();
}

async function updateWhitelistRules() {
  // Remove all existing dynamic allow rules
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules
    .filter(r => r.id >= 90000)
    .map(r => r.id);

  // Create allow rules for whitelisted domains
  const addRules = state.whitelist.map((hostname, index) => ({
    id: 90000 + index,
    priority: 10,
    action: { type: 'allow' },
    condition: {
      initiatorDomains: [hostname],
      resourceTypes: [
        'script', 'image', 'xmlhttprequest', 'sub_frame',
        'media', 'font', 'stylesheet', 'other', 'main_frame'
      ]
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: addRules
  });
}

// ─── Toggle Extension ────────────────────────────────────────────
async function toggleExtension(enabled) {
  state.enabled = enabled;

  // Enable/disable all static rulesets
  const rulesetIds = ['ads_rules', 'tracker_rules', 'annoyance_rules'];

  if (enabled) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: rulesetIds
    });
  } else {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: rulesetIds
    });
  }

  await persistState();
  updateBadge();
}

// ─── Message Handling ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'GET_STATE':
        return state;

      case 'TOGGLE_ENABLED':
        await toggleExtension(message.enabled);
        return state;

      case 'ADD_WHITELIST':
        await addToWhitelist(message.hostname);
        return state;

      case 'REMOVE_WHITELIST':
        await removeFromWhitelist(message.hostname);
        return state;

      case 'GET_SITE_STATS': {
        const hostname = message.hostname;
        return {
          blocked: state.statsPerSite[hostname] || 0,
          isWhitelisted: state.whitelist.includes(hostname)
        };
      }

      case 'RESET_STATS':
        state.totalBlocked = 0;
        state.sessionBlocked = 0;
        state.statsPerSite = {};
        await persistState();
        updateBadge();
        return state;

      default:
        return { error: 'Unknown message type' };
    }
  };

  handler().then(sendResponse);
  return true; // keep message channel open for async response
});

// ─── Badge ───────────────────────────────────────────────────────
function updateBadge() {
  const text = state.enabled ? '' : 'OFF';
  const color = state.enabled ? '#6C5CE7' : '#636e72';

  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

function updateBadgeForTab(tabId, count) {
  if (!state.enabled) return;
  const text = count > 999 ? '999+' : String(count);
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#6C5CE7', tabId });
}

// ─── Persistence ─────────────────────────────────────────────────
let persistTimer = null;
function persistState() {
  // Debounce writes to storage
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    chrome.storage.local.set({ shieldblock: state });
  }, 1000);
}

// ─── Tab Updates ─────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const hostname = new URL(tab.url).hostname;
      const count = state.statsPerSite[hostname] || 0;
      if (count > 0 && state.enabled) {
        updateBadgeForTab(tabId, count);
      }
    } catch (e) { /* ignore */ }
  }
});
