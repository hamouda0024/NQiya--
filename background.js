/* background.js — NQiya service worker (Phase 1: scan + preview + backup only) */

const STORAGE_SETTINGS = 'nqiya.settings';
const STORAGE_PROGRESS = 'nqiya.progress';
const STORAGE_RESULTS = 'nqiya.results';
const STORAGE_META = 'nqiya.meta';

const DEFAULT_SETTINGS = {
  beforeYear: 2018,
  includeComments: true,
  includePosts: true
};

function log(...args) {
  try {
    console.log('[NQiya background]', ...args);
  } catch (_) {
    /* ignore */
  }
}

// Seed default settings once, without overwriting the user's choices.
async function ensureDefaults() {
  try {
    const stored = await chrome.storage.local.get([STORAGE_SETTINGS]);
    if (!stored || !stored[STORAGE_SETTINGS]) {
      await chrome.storage.local.set({ [STORAGE_SETTINGS]: DEFAULT_SETTINGS });
    }
  } catch (err) {
    log('ensureDefaults failed', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  try {
    Promise.all([
      ensureDefaults(),
      chrome.storage.local.remove([STORAGE_PROGRESS])
    ]).catch((err) => log('install init failed', err));
  } catch (err) {
    log('onInstalled failed', err);
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults();
});

/* Relay scan lifecycle messages so the popup panel can recover state even if it
 * was closed while a scan was running. Results themselves live in storage. */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'NQIYA_PROGRESS') {
      if (typeof message.count === 'number') {
        chrome.storage.local
          .set({ [STORAGE_PROGRESS]: { count: message.count, at: Date.now(), done: false } })
          .catch(() => {});
      }
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'NQIYA_DONE') {
      chrome.storage.local
        .set({ [STORAGE_PROGRESS]: { count: message.count || 0, at: Date.now(), done: true } })
        .catch(() => {});
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'NQIYA_CLEAR_RESULTS') {
      chrome.storage.local
        .remove([STORAGE_RESULTS, STORAGE_META, STORAGE_PROGRESS])
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          log('clear failed', err);
          sendResponse({ ok: false, error: 'CLEAR_FAILED' });
        });
      return true; // async response
    }

    return false;
  } catch (err) {
    log('onMessage failed', err);
    return false;
  }
});
