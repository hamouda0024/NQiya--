/* popup.js — NQiya (Phase 1: scan + preview + backup only) */

const STORAGE_RESULTS = 'nqiya.results';
const STORAGE_META = 'nqiya.meta';
const STORAGE_PROGRESS = 'nqiya.progress';
const STORAGE_SETTINGS = 'nqiya.settings';

const YEARS = [2019, 2018, 2017, 2016, 2015];
const DEFAULT_YEAR = 2018;
const POLL_INTERVAL = 1500;

const el = {
  beforeYear: document.getElementById('beforeYear'),
  optComments: document.getElementById('optComments'),
  optPosts: document.getElementById('optPosts'),
  scanBtn: document.getElementById('scanBtn'),
  stopBtn: document.getElementById('stopBtn'),
  status: document.getElementById('status'),
  counter: document.getElementById('counter'),
  results: document.getElementById('results'),
  backupBtn: document.getElementById('backupBtn'),
  debugBtn: document.getElementById('debugBtn')
};

let items = [];
let initialized = false;
let scanning = false;
let pollTimer = null;
let scanStartedAt = 0;

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */
function setStatus(message, kind) {
  el.status.textContent = message || '';
  el.status.classList.toggle('is-error', kind === 'error');
  el.status.classList.toggle('is-ok', kind === 'ok');
}

function setCounter(count) {
  el.counter.textContent = `لقينا ${count} عنصر`;
}

function setBusy(busy) {
  scanning = busy;
  el.scanBtn.disabled = busy;
  el.scanBtn.textContent = busy ? 'جاري الفحص…' : 'افحص حسابي الآن';
  el.stopBtn.hidden = !busy;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function todayStamp() {
  const now = new Date();
  return `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
}

/* ------------------------------------------------------------------ */
/* Results rendering                                                   */
/* ------------------------------------------------------------------ */
function renderResults(list) {
  items = Array.isArray(list) ? list : [];
  el.results.textContent = '';
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'item';

    const text = document.createElement('p');
    text.className = 'item-text';
    text.textContent = item.text || '';

    const meta = document.createElement('div');
    meta.className = 'item-meta';

    const date = document.createElement('span');
    date.textContent = item.date || 'بدون تاريخ';

    const link = document.createElement('a');
    link.className = 'item-link';
    link.href = item.link || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'فتح';

    meta.append(date, link);
    li.append(text, meta);
    fragment.append(li);
  }

  el.results.append(fragment);
  setCounter(items.length);
  el.backupBtn.disabled = items.length === 0;
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get([STORAGE_SETTINGS]);
    const settings = stored[STORAGE_SETTINGS] || {};
    const year = YEARS.includes(Number(settings.beforeYear)) ? Number(settings.beforeYear) : DEFAULT_YEAR;
    el.beforeYear.value = String(year);
    el.optComments.checked = settings.includeComments !== false;
    el.optPosts.checked = settings.includePosts !== false;
  } catch (err) {
    console.warn('[NQiya] loadSettings failed', err);
    el.beforeYear.value = String(DEFAULT_YEAR);
  }
}

async function saveSettings() {
  try {
    await chrome.storage.local.set({
      [STORAGE_SETTINGS]: {
        beforeYear: Number(el.beforeYear.value) || DEFAULT_YEAR,
        includeComments: el.optComments.checked,
        includePosts: el.optPosts.checked
      }
    });
  } catch (err) {
    console.warn('[NQiya] saveSettings failed', err);
  }
}

async function loadStoredResults() {
  try {
    const stored = await chrome.storage.local.get([STORAGE_RESULTS, STORAGE_META, STORAGE_PROGRESS]);
    if (Array.isArray(stored[STORAGE_RESULTS])) {
      renderResults(stored[STORAGE_RESULTS]);
      const meta = stored[STORAGE_META] || {};
      if (stored[STORAGE_RESULTS].length > 0) {
        setStatus(`آخر فحص: ${stored[STORAGE_RESULTS].length} عنصر قبل ${meta.beforeYear || '—'}.`, 'ok');
      }
    }
    const progress = stored[STORAGE_PROGRESS];
    if (progress && progress.done === false && typeof progress.count === 'number') {
      // A scan may still be running in the page after the popup was closed.
      setCounter(progress.count);
    }
  } catch (err) {
    console.warn('[NQiya] loadStoredResults failed', err);
  }
}

/* ------------------------------------------------------------------ */
/* Tabs / content script                                               */
/* ------------------------------------------------------------------ */
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

function isFacebookUrl(url) {
  return /^https?:\/\/([a-z0-9-]+\.)*facebook\.com\//i.test(url || '');
}

async function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function ensureContentScript(tabId) {
  try {
    const ping = await sendToTab(tabId, { type: 'NQIYA_PING' });
    if (ping && ping.ok) return ping;
  } catch (_) {
    /* content script is not there yet — inject it below */
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  return sendToTab(tabId, { type: 'NQIYA_PING' });
}

/* ------------------------------------------------------------------ */
/* Scan lifecycle                                                      */
/* ------------------------------------------------------------------ */
function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function finishScan() {
  stopPolling();
  setBusy(false);
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const stored = await chrome.storage.local.get([STORAGE_PROGRESS, STORAGE_RESULTS, STORAGE_META]);
      const progress = stored[STORAGE_PROGRESS];
      if (!progress) return;
      if (typeof progress.count === 'number') setCounter(progress.count);
      if (progress.done === true && (progress.at || 0) >= scanStartedAt) {
        finishScan();
        renderResults(stored[STORAGE_RESULTS]);
        const meta = stored[STORAGE_META] || {};
        setStatus(
          `انتهى الفحص: ${Array.isArray(stored[STORAGE_RESULTS]) ? stored[STORAGE_RESULTS].length : 0} عنصر قبل ${
            meta.beforeYear || el.beforeYear.value
          }.`,
          'ok'
        );
      }
    } catch (err) {
      console.warn('[NQiya] poll failed', err);
    }
  }, POLL_INTERVAL);
}

async function startScan() {
  if (scanning) return;

  const beforeYear = Number(el.beforeYear.value) || DEFAULT_YEAR;
  const includeComments = el.optComments.checked;
  const includePosts = el.optPosts.checked;

  if (!includeComments && !includePosts) {
    setStatus('اختر «تعليقاتي» أو «منشوراتي» على الأقل.', 'error');
    return;
  }

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      setStatus('ما لقينا التبويب الحالي. جرّب مرة ثانية.', 'error');
      return;
    }
    if (!isFacebookUrl(tab.url)) {
      setStatus('افتح فيسبوك أولاً، وبعدها افتح «سجل النشاط» يدوياً.', 'error');
      return;
    }

    setStatus('جاري تجهيز الفحص…');
    setBusy(true);
    el.backupBtn.disabled = true;
    renderResults([]);

    const ping = await ensureContentScript(tab.id);
    if (!ping || !ping.ok) {
      setBusy(false);
      setStatus('تعذّر تشغيل الفحص في هذه الصفحة. أعد تحميل الصفحة وجرّب.', 'error');
      return;
    }
    if (!ping.isActivityLog) {
      setBusy(false);
      setStatus('هذه الصفحة ليست «سجل النشاط». افتحه من ملفك الشخصي ثم اضغط الفحص.', 'error');
      return;
    }
    if (ping.scanning) {
      setBusy(true);
      setStatus('في فحص شغّال بالفعل في هذه الصفحة…');
      startPolling();
      return;
    }

    await saveSettings();

    scanStartedAt = Date.now();
    const response = await sendToTab(tab.id, {
      type: 'NQIYA_SCAN',
      options: { beforeYear, includeComments, includePosts }
    });

    if (!response || !response.ok) {
      setBusy(false);
      const code = response && response.error;
      if (code === 'NOT_ACTIVITY_LOG') {
        setStatus('هذه الصفحة ليست «سجل النشاط». افتحه من ملفك الشخصي ثم اضغط الفحص.', 'error');
      } else if (code === 'NO_TYPE_SELECTED') {
        setStatus('اختر «تعليقاتي» أو «منشوراتي» على الأقل.', 'error');
      } else {
        setStatus('ما قدرنا نبدأ الفحص. جرّب إعادة تحميل الصفحة.', 'error');
      }
      return;
    }

    setStatus('جاري الفحص… اسحب للأسفل يشتغل تلقائياً. لا تغلق الصفحة.', 'ok');
    startPolling();
  } catch (err) {
    console.warn('[NQiya] startScan failed', err);
    setBusy(false);
    stopPolling();
    setStatus('صار خطأ غير متوقع أثناء بدء الفحص. جرّب إعادة تحميل الصفحة.', 'error');
  }
}

async function stopScan() {
  try {
    const tab = await getActiveTab();
    if (tab && tab.id) {
      await sendToTab(tab.id, { type: 'NQIYA_STOP' });
    }
    setStatus('جاري الإيقاف… بنحفظ اللي لقيناه.', 'ok');
  } catch (err) {
    console.warn('[NQiya] stopScan failed', err);
    setStatus('ما قدرنا نوقف الفحص. انتظر لين ينتهي لحاله.', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Backup + debug                                                      */
/* ------------------------------------------------------------------ */
function downloadBackup() {
  try {
    if (!items.length) {
      setStatus('ما فيه نتائج بعد. افحص حسابك أولاً.', 'error');
      return;
    }
    const payload = items.map((item) => ({
      text: item.text || '',
      date: item.date || '',
      link: item.link || ''
    }));

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nqiya-backup-${todayStamp()}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    setStatus(`تم تجهيز النسخة الاحتياطية (${payload.length} عنصر).`, 'ok');
  } catch (err) {
    console.warn('[NQiya] downloadBackup failed', err);
    setStatus('تعذّر إنشاء النسخة الاحتياطية.', 'error');
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (err) {
      console.warn('[NQiya] copyText failed', err);
      return false;
    }
  }
}

async function copyDebugHtml() {
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id || !isFacebookUrl(tab.url)) {
      setStatus('افتح «سجل النشاط» على فيسبوك أولاً حتى ننسخ HTML.', 'error');
      return;
    }
    const ping = await ensureContentScript(tab.id);
    if (!ping || !ping.isActivityLog) {
      setStatus('هذه الصفحة ليست «سجل النشاط». افتحه ثم جرّب مرة ثانية.', 'error');
      return;
    }
    const response = await sendToTab(tab.id, { type: 'NQIYA_DEBUG_HTML' });
    if (!response || !response.ok || !response.html) {
      setStatus('ما لقينا عناصر ننسخها. تأكد إن سجل النشاط محمّل بالعناصر.', 'error');
      return;
    }
    const copied = await copyText(response.html);
    setStatus(copied ? 'تم نسخ HTML لأول 3 عناصر.' : 'تعذّر النسخ للحافظة.', copied ? 'ok' : 'error');
  } catch (err) {
    console.warn('[NQiya] copyDebugHtml failed', err);
    setStatus('تعذّر نسخ HTML للتشخيص.', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Messages from the content script                                    */
/* ------------------------------------------------------------------ */
chrome.runtime.onMessage.addListener((message) => {
  try {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'NQIYA_PROGRESS') {
      if (typeof message.count === 'number') setCounter(message.count);
      return;
    }
    if (message.type === 'NQIYA_DONE') {
      finishScan();
      renderResults(message.results);
      const year = message.meta && message.meta.beforeYear ? message.meta.beforeYear : el.beforeYear.value;
      const stopped = message.meta && message.meta.stopped;
      setStatus(
        `${stopped ? 'توقف الفحص' : 'انتهى الفحص'}: ${message.count || 0} عنصر قبل ${year}.`,
        'ok'
      );
      return;
    }
    if (message.type === 'NQIYA_ERROR') {
      finishScan();
      setStatus('صار خطأ أثناء الفحص. جرّب إعادة تحميل الصفحة.', 'error');
    }
  } catch (err) {
    console.warn('[NQiya] popup message failed', err);
  }
});

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */
function buildYearOptions() {
  const fragment = document.createDocumentFragment();
  for (const year of YEARS) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    fragment.append(option);
  }
  el.beforeYear.append(fragment);
}

async function init() {
  if (initialized) return;
  initialized = true;
  buildYearOptions();
  await loadSettings();
  await loadStoredResults();

  el.beforeYear.addEventListener('change', saveSettings);
  el.optComments.addEventListener('change', saveSettings);
  el.optPosts.addEventListener('change', saveSettings);
  el.scanBtn.addEventListener('click', startScan);
  el.stopBtn.addEventListener('click', stopScan);
  el.backupBtn.addEventListener('click', downloadBackup);
  el.debugBtn.addEventListener('click', copyDebugHtml);
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
