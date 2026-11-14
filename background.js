/* background.js — NQiya service worker
 * Seeds defaults, keeps short-lived progress, and accepts messages only from
 * this extension. No network access, no remote calls.
 */

const KEYS = {
  settings: 'nqiya.settings',
  progress: 'nqiya.progress',
  results: 'nqiya.results',
  meta: 'nqiya.meta',
  simProgress: 'nqiya.simProgress'
};

const CURRENT_YEAR = new Date().getFullYear();

const DEFAULT_SETTINGS = {
  cutoffYear: Math.max(2005, CURRENT_YEAR - 2),
  cutoffDate: '',
  includeComments: true,
  includePosts: true,
  dryRun: true, // ON by default
  includeMedia: false, // OFF by default
  cap: 25
};

// Messages this worker is willing to act on.
const KNOWN_TYPES = new Set([
  'NQIYA_PROGRESS',
  'NQIYA_DONE',
  'NQIYA_SIM_PROGRESS',
  'NQIYA_SIM_DONE',
  'NQIYA_DELETE_PROGRESS',
  'NQIYA_DELETE_DONE',
  'NQIYA_DIALOG_HTML',
  'NQIYA_CLEAR_RESULTS'
]);

const STORAGE_TEST_DELETE = 'nqiya.testDelete';
const STORAGE_DELETE_PROGRESS = 'nqiya.deleteProgress';

function log(...args) {
  try {
    console.log('[NQiya background]', ...args);
  } catch (_) {
    /* ignore */
  }
}

function isTrustedSender(sender) {
  try {
    return !!(sender && sender.id === chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

async function ensureDefaults() {
  try {
    const stored = await chrome.storage.local.get([KEYS.settings]);
    const current = stored && stored[KEYS.settings];

    if (!current || typeof current !== 'object') {
      await chrome.storage.local.set({ [KEYS.settings]: DEFAULT_SETTINGS });
      return;
    }

    // Fill in only the keys that are missing, never overwrite user choices.
    const patch = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (current[key] === undefined) patch[key] = value;
    }
    if (Object.keys(patch).length) {
      await chrome.storage.local.set({ [KEYS.settings]: { ...current, ...patch } });
    }
  } catch (err) {
    log('ensureDefaults failed', err);
  }
}

// A single-item test only counts for the extension version that performed it.
async function resetTestFlagOnVersionChange() {
  try {
    const stored = await chrome.storage.local.get([STORAGE_TEST_DELETE]);
    const flag = stored && stored[STORAGE_TEST_DELETE];
    if (flag && flag.version !== chrome.runtime.getManifest().version) {
      await chrome.storage.local.remove([STORAGE_TEST_DELETE]);
    }
  } catch (err) {
    log('test flag reset failed', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  try {
    Promise.all([
      ensureDefaults(),
      resetTestFlagOnVersionChange(),
      chrome.storage.local.remove([KEYS.progress])
    ]).catch((err) => log('install init failed', err));
  } catch (err) {
    log('onInstalled failed', err);
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults();
  resetTestFlagOnVersionChange();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!isTrustedSender(sender)) return false;
    if (!message || typeof message.type !== 'string' || !KNOWN_TYPES.has(message.type)) return false;

    if (message.type === 'NQIYA_PROGRESS') {
      if (typeof message.count === 'number') {
        chrome.storage.local
          .set({ [KEYS.progress]: { count: message.count, at: Date.now(), done: false } })
          .catch(() => {});
      }
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'NQIYA_DONE') {
      chrome.storage.local
        .set({ [KEYS.progress]: { count: message.count || 0, at: Date.now(), done: true } })
        .catch(() => {});
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'NQIYA_DELETE_PROGRESS' || message.type === 'NQIYA_DELETE_DONE') {
      chrome.storage.local
        .set({
          [STORAGE_DELETE_PROGRESS]: {
            at: Date.now(),
            done: typeof message.done === 'number' ? message.done : 0,
            total: typeof message.total === 'number' ? message.total : 0,
            finished: message.type === 'NQIYA_DELETE_DONE',
            stopped: message.stopped === true,
            warning: message.warning === true
          }
        })
        .catch(() => {});
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'NQIYA_SIM_PROGRESS' || message.type === 'NQIYA_SIM_DONE') {
      chrome.storage.local
        .set({
          [KEYS.simProgress]: {
            at: Date.now(),
            done: message.type === 'NQIYA_SIM_DONE',
            index: typeof message.index === 'number' ? message.index : null,
            total: typeof message.total === 'number' ? message.total : null
          }
        })
        .catch(() => {});
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'NQIYA_CLEAR_RESULTS') {
      chrome.storage.local
        .remove([KEYS.results, KEYS.meta, KEYS.progress, KEYS.simProgress])
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          log('clear failed', err);
          sendResponse({ ok: false, error: 'CLEAR_FAILED' });
        });
      return true;
    }

    return false;
  } catch (err) {
    log('onMessage failed', err);
    return false;
  }
});
