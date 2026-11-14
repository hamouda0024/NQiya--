/* popup.js — NQiya
 * Scan, dynamic cutoff, backup, dry-run simulation and calibration tools.
 * Real deletion is added in the next commit; this file never triggers it.
 */

const KEYS = {
  results: 'nqiya.results',
  meta: 'nqiya.meta',
  progress: 'nqiya.progress',
  settings: 'nqiya.settings',
  excluded: 'nqiya.excluded',
  backup: 'nqiya.backup',
  deleted: 'nqiya.deleted',
  deleteProgress: 'nqiya.deleteProgress',
  testDelete: 'nqiya.testDelete'
};

const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر'
];

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2005;
const DEFAULT_YEAR = Math.max(MIN_YEAR, CURRENT_YEAR - 2);
const POLL_INTERVAL = 1500;
const MAX_CAP = 100;

const el = {
  beforeYear: document.getElementById('beforeYear'),
  cutoffDate: document.getElementById('cutoffDate'),
  clearDate: document.getElementById('clearDate'),
  cutoffHint: document.getElementById('cutoffHint'),
  cutoffLine: document.getElementById('cutoffLine'),
  recentWarning: document.getElementById('recentWarning'),
  optComments: document.getElementById('optComments'),
  optPosts: document.getElementById('optPosts'),
  scanBtn: document.getElementById('scanBtn'),
  stopBtn: document.getElementById('stopBtn'),
  status: document.getElementById('status'),
  counter: document.getElementById('counter'),
  toggleDist: document.getElementById('toggleDist'),
  distribution: document.getElementById('distribution'),
  results: document.getElementById('results'),
  backupBtn: document.getElementById('backupBtn'),
  debugBtn: document.getElementById('debugBtn'),
  dryRun: document.getElementById('dryRun'),
  includeMedia: document.getElementById('includeMedia'),
  capInput: document.getElementById('capInput'),
  simBtn: document.getElementById('simBtn'),
  calMenuBtn: document.getElementById('calMenuBtn'),
  calDialogBtn: document.getElementById('calDialogBtn'),
  simLog: document.getElementById('simLog'),
  gateList: document.getElementById('gateList'),
  testDeleteBtn: document.getElementById('testDeleteBtn'),
  deleteBtn: document.getElementById('deleteBtn'),
  progressWrap: document.getElementById('progressWrap'),
  progressFill: document.getElementById('progressFill'),
  progressLabel: document.getElementById('progressLabel'),
  deleteStopBtn: document.getElementById('deleteStopBtn'),
  modal: document.getElementById('modal'),
  modalBody: document.getElementById('modalBody'),
  confirmWord: document.getElementById('confirmWord'),
  modalConfirm: document.getElementById('modalConfirm'),
  modalCancel: document.getElementById('modalCancel')
};

let items = [];
let excluded = {};
let meta = {};
let backup = null;
let testDelete = null;
let deletedItems = {};
let initialized = false;
let scanning = false;
let simulating = false;
let deleting = false;
let deleteMode = 'batch';
let dialogCaptureArmed = false;
let lastDialogHtml = '';
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

function pad2(value) {
  return String(value).padStart(2, '0');
}

function todayStamp() {
  const now = new Date();
  return `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
}

function formatDateAr(iso) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS_AR[month - 1]} ${year}`;
}

function clampCap() {
  const value = Number(el.capInput.value);
  if (!Number.isFinite(value) || value < 1) return 25;
  return Math.min(MAX_CAP, Math.round(value));
}

/* ------------------------------------------------------------------ */
/* Cutoff                                                              */
/* ------------------------------------------------------------------ */
function cutoffLimitIso() {
  return `${CURRENT_YEAR}-01-01`;
}

function computeCutoff() {
  const limitIso = cutoffLimitIso();
  const rawDate = el.cutoffDate.value;
  let iso;
  let clamped = false;

  if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    iso = rawDate > limitIso ? limitIso : rawDate;
    clamped = rawDate > limitIso;
  } else {
    const year = Number(el.beforeYear.value) || DEFAULT_YEAR;
    const safeYear = Math.min(CURRENT_YEAR, Math.max(MIN_YEAR, year));
    iso = `${safeYear}-01-01`;
  }

  return { iso, label: formatDateAr(iso), year: Number(iso.slice(0, 4)), clamped };
}

function renderCutoff() {
  const cutoff = computeCutoff();
  el.cutoffLine.textContent = `كل شيء قبل ${cutoff.label}`;
  el.cutoffHint.textContent = cutoff.clamped
    ? `ما نقدر نختار تاريخ بعد 1 يناير ${CURRENT_YEAR} — تم ضبطه على الحد الأقصى.`
    : 'إذا تركت التاريخ فاضي، يُستخدم 1 يناير من السنة المختارة.';

  const isRecent = cutoff.year >= CURRENT_YEAR - 1;
  el.recentWarning.hidden = !isRecent;
  if (isRecent) {
    el.recentWarning.textContent =
      'تحذير: القطع في السنة الحالية أو السابقة. هذا النطاق يشمل عناصر حديثة، وأي حذف فيه يحتاج تأكيداً ثانياً يعرض أحدث عنصر قبل التنفيذ.';
  }

  updateButtons();
  return cutoff;
}

function buildYearOptions(selectedYear) {
  const fragment = document.createDocumentFragment();
  for (let year = CURRENT_YEAR; year >= MIN_YEAR; year -= 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    fragment.append(option);
  }
  el.beforeYear.append(fragment);
  el.cutoffDate.min = `${MIN_YEAR}-01-01`;
  el.cutoffDate.max = cutoffLimitIso();
  el.beforeYear.value = String(selectedYear || DEFAULT_YEAR);
}

/* ------------------------------------------------------------------ */
/* Results rendering                                                   */
/* ------------------------------------------------------------------ */
function renderDistribution() {
  const counts = new Map();
  for (const item of items) {
    const year = String(item.date || '').slice(0, 4);
    if (!/^\d{4}$/.test(year)) continue;
    counts.set(year, (counts.get(year) || 0) + 1);
  }

  el.distribution.textContent = '';
  const years = Array.from(counts.keys()).sort((a, b) => Number(b) - Number(a));
  const fragment = document.createDocumentFragment();
  for (const year of years) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = year;
    const value = document.createElement('b');
    value.textContent = String(counts.get(year));
    li.append(label, value);
    fragment.append(li);
  }
  el.distribution.append(fragment);
}

function selectedItems() {
  return items.filter((item) => item && item.id && !excluded[item.id] && !deletedItems[item.id]);
}

function updateCounter() {
  const selected = selectedItems().length;
  el.counter.textContent =
    selected === items.length
      ? `لقينا ${items.length} عنصر`
      : `لقينا ${items.length} عنصر · محدد ${selected}`;
}

function renderResults(list) {
  items = Array.isArray(list) ? list : [];
  el.results.textContent = '';
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'item';
    if (excluded[item.id]) li.classList.add('is-excluded');

    const checkLabel = document.createElement('label');
    checkLabel.className = 'item-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !excluded[item.id] && !deletedItems[item.id];
    checkbox.disabled = !!deletedItems[item.id];
    checkbox.setAttribute('aria-label', 'تضمين العنصر في الحذف');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) delete excluded[item.id];
      else excluded[item.id] = true;
      li.classList.toggle('is-excluded', !checkbox.checked);
      updateCounter();
      saveExcluded();
    });
    checkLabel.append(checkbox);

    const body = document.createElement('div');
    body.className = 'item-body';

    const text = document.createElement('p');
    text.className = 'item-text';
    text.textContent = item.text || '';

    const metaRow = document.createElement('div');
    metaRow.className = 'item-meta';

    const left = document.createElement('span');
    left.textContent = item.date || 'بدون تاريخ';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'badge';
    typeBadge.textContent =
      item.type === 'comment' ? 'تعليق' : item.type === 'post' ? 'منشور' : 'غير محدد';
    left.append(typeBadge);

    if (item.media) {
      const mediaBadge = document.createElement('span');
      mediaBadge.className = 'badge badge-media';
      mediaBadge.textContent = 'صور/فيديو';
      left.append(mediaBadge);
    }

    if (deletedItems[item.id]) {
      const deletedBadge = document.createElement('span');
      deletedBadge.className = 'badge';
      deletedBadge.textContent = 'تم حذفه';
      left.append(deletedBadge);
    }

    const link = document.createElement('a');
    link.className = 'item-link';
    link.href = item.link || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'فتح';

    metaRow.append(left, link);
    body.append(text, metaRow);
    li.append(checkLabel, body);
    fragment.append(li);
  }

  el.results.append(fragment);
  updateCounter();
  renderDistribution();
  el.backupBtn.disabled = items.length === 0;
  updateButtons();
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get([KEYS.settings]);
    const settings = stored[KEYS.settings] || {};

    const year = Number(settings.cutoffYear);
    buildYearOptions(Number.isInteger(year) && year >= MIN_YEAR && year <= CURRENT_YEAR ? year : DEFAULT_YEAR);

    el.cutoffDate.value = typeof settings.cutoffDate === 'string' ? settings.cutoffDate : '';
    el.optComments.checked = settings.includeComments !== false;
    el.optPosts.checked = settings.includePosts !== false;
    el.dryRun.checked = settings.dryRun !== false; // ON by default
    el.includeMedia.checked = settings.includeMedia === true; // OFF by default
    el.capInput.value = String(
      Number.isInteger(Number(settings.cap)) ? Math.min(MAX_CAP, Math.max(1, Number(settings.cap))) : 25
    );
  } catch (err) {
    console.warn('[NQiya] loadSettings failed', err);
    buildYearOptions(DEFAULT_YEAR);
  }
  renderCutoff();
}

async function saveSettings() {
  try {
    await chrome.storage.local.set({
      [KEYS.settings]: {
        cutoffYear: Number(el.beforeYear.value) || DEFAULT_YEAR,
        cutoffDate: el.cutoffDate.value || '',
        includeComments: el.optComments.checked,
        includePosts: el.optPosts.checked,
        dryRun: el.dryRun.checked,
        includeMedia: el.includeMedia.checked,
        cap: clampCap()
      }
    });
  } catch (err) {
    console.warn('[NQiya] saveSettings failed', err);
  }
}

async function saveExcluded() {
  try {
    await chrome.storage.local.set({ [KEYS.excluded]: excluded });
  } catch (err) {
    console.warn('[NQiya] saveExcluded failed', err);
  }
}

async function loadStoredState() {
  try {
    const stored = await chrome.storage.local.get([
      KEYS.results,
      KEYS.meta,
      KEYS.progress,
      KEYS.excluded,
      KEYS.backup,
      KEYS.testDelete,
      KEYS.deleted,
      KEYS.deleteProgress
    ]);

    excluded = stored[KEYS.excluded] && typeof stored[KEYS.excluded] === 'object' ? stored[KEYS.excluded] : {};
    meta = stored[KEYS.meta] || {};
    backup = stored[KEYS.backup] || null;
    testDelete = stored[KEYS.testDelete] || null;
    deletedItems = stored[KEYS.deleted] && typeof stored[KEYS.deleted] === 'object' ? stored[KEYS.deleted] : {};

    const lastDelete = stored[KEYS.deleteProgress];
    if (lastDelete && typeof lastDelete.done === 'number' && typeof lastDelete.total === 'number') {
      showProgress(lastDelete.done, lastDelete.total, lastDelete.finished ? 'آخر جلسة' : '');
    }

    if (Array.isArray(stored[KEYS.results])) {
      renderResults(stored[KEYS.results]);
      if (stored[KEYS.results].length > 0) {
        const cutoffText = meta.cutoffLabel ? ` قبل ${meta.cutoffLabel}` : '';
        setStatus(`آخر فحص: ${stored[KEYS.results].length} عنصر${cutoffText}.`, 'ok');
      }
    }

    const progress = stored[KEYS.progress];
    if (progress && progress.done === false && typeof progress.count === 'number') {
      el.counter.textContent = `لقينا ${progress.count} عنصر`;
    }
  } catch (err) {
    console.warn('[NQiya] loadStoredState failed', err);
  }
}

async function loadDeletedState() {
  try {
    const stored = await chrome.storage.local.get([
      KEYS.deleted,
      KEYS.testDelete,
      KEYS.deleteProgress,
      KEYS.backup
    ]);
    deletedItems = stored[KEYS.deleted] && typeof stored[KEYS.deleted] === 'object' ? stored[KEYS.deleted] : {};
    testDelete = stored[KEYS.testDelete] || null;
    backup = stored[KEYS.backup] || backup;

    const progress = stored[KEYS.deleteProgress];
    if (progress && typeof progress.done === 'number' && typeof progress.total === 'number' && progress.total > 0) {
      showProgress(progress.done, progress.total, progress.finished ? 'آخر جلسة' : '');
    }
  } catch (err) {
    console.warn('[NQiya] loadDeletedState failed', err);
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

// Shared front-door check for every action that drives the page.
async function requireActivityLogTab() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return { ok: false, tab: null, reason: 'no-tab' };
  if (!isFacebookUrl(tab.url)) return { ok: false, tab, reason: 'not-facebook' };

  const ping = await ensureContentScript(tab.id);
  if (!ping || !ping.ok) return { ok: false, tab, reason: 'no-content' };
  if (!ping.isActivityLog) return { ok: false, tab, reason: 'not-activity-log' };
  return { ok: true, tab, ping };
}

const ACTIVITY_LOG_ERRORS = {
  'no-tab': 'ما لقينا التبويب الحالي. جرّب مرة ثانية.',
  'not-facebook': 'افتح فيسبوك أولاً، وبعدها افتح «سجل النشاط» يدوياً.',
  'no-content': 'تعذّر تشغيل الأدوات في هذه الصفحة. أعد تحميل الصفحة وجرّب.',
  'not-activity-log': 'هذه الصفحة ليست «سجل النشاط». افتحه من ملفك الشخصي ثم جرّب.'
};

function reportActivityTabError(reason) {
  setStatus(ACTIVITY_LOG_ERRORS[reason] || 'هذه الصفحة غير مناسبة لهذا الإجراء.', 'error');
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

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const stored = await chrome.storage.local.get([KEYS.progress, KEYS.results, KEYS.meta]);
      const progress = stored[KEYS.progress];
      if (!progress) return;
      if (typeof progress.count === 'number') {
        el.counter.textContent = `لقينا ${progress.count} عنصر`;
      }
      if (progress.done === true && (progress.at || 0) >= scanStartedAt) {
        stopPolling();
        scanning = false;
        el.scanBtn.disabled = false;
        el.scanBtn.textContent = 'افحص حسابي الآن';
        el.stopBtn.hidden = true;

        meta = stored[KEYS.meta] || {};
        renderResults(stored[KEYS.results]);
        const count = Array.isArray(stored[KEYS.results]) ? stored[KEYS.results].length : 0;
        const cutoffText = meta.cutoffLabel ? ` قبل ${meta.cutoffLabel}` : '';
        setStatus(`انتهى الفحص: ${count} عنصر${cutoffText}.`, 'ok');
      }
    } catch (err) {
      console.warn('[NQiya] poll failed', err);
    }
  }, POLL_INTERVAL);
}

function setScanningState(busy) {
  scanning = busy;
  el.scanBtn.disabled = busy;
  el.scanBtn.textContent = busy ? 'جاري الفحص…' : 'افحص حسابي الآن';
  el.stopBtn.hidden = !(busy || simulating);
  updateButtons();
}

async function startScan() {
  if (scanning || simulating) return;

  const cutoff = computeCutoff();
  const includeComments = el.optComments.checked;
  const includePosts = el.optPosts.checked;

  if (!includeComments && !includePosts) {
    setStatus('اختر «تعليقاتي» أو «منشوراتي» على الأقل.', 'error');
    return;
  }

  try {
    const target = await requireActivityLogTab();
    if (!target.ok) {
      reportActivityTabError(target.reason);
      return;
    }
    if (target.ping.scanning) {
      setScanningState(true);
      startPolling();
      setStatus('في فحص شغّال بالفعل في هذه الصفحة…');
      return;
    }

    await saveSettings();
    setStatus(`جاري تجهيز الفحص… ${cutoff.label}`);
    setScanningState(true);
    el.backupBtn.disabled = true;
    renderResults([]);

    scanStartedAt = Date.now();
    const response = await sendToTab(target.tab.id, {
      type: 'NQIYA_SCAN',
      options: {
        cutoffIso: cutoff.iso,
        cutoffLabel: cutoff.label,
        includeComments,
        includePosts
      }
    });

    if (!response || !response.ok) {
      setScanningState(false);
      setStatus('ما قدرنا نبدأ الفحص. جرّب إعادة تحميل الصفحة.', 'error');
      return;
    }

    setStatus(`جاري الفحص… القطع: قبل ${cutoff.label}. لا تغلق الصفحة.`, 'ok');
    startPolling();
  } catch (err) {
    console.warn('[NQiya] startScan failed', err);
    setScanningState(false);
    stopPolling();
    setStatus('صار خطأ غير متوقع أثناء بدء الفحص.', 'error');
  }
}

async function stopEverything() {
  try {
    const tab = await getActiveTab();
    if (tab && tab.id) await sendToTab(tab.id, { type: 'NQIYA_STOP' });
    setStatus('جاري الإيقاف…', 'ok');
  } catch (err) {
    console.warn('[NQiya] stop failed', err);
    setStatus('ما قدرنا نوقف. انتظر لين ينتهي لحاله.', 'error');
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
      link: item.link || '',
      type: item.type || 'unknown'
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

    chrome.storage.local
      .set({
        [KEYS.backup]: {
          at: Date.now(),
          scannedAt: meta.scannedAt || null,
          count: payload.length,
          cutoffIso: meta.cutoffIso || null
        }
      })
      .catch(() => {});

    setStatus(`تم تجهيز النسخة الاحتياطية (${payload.length} عنصر).`, 'ok');
    updateButtons();
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
    const target = await requireActivityLogTab();
    if (!target.ok) {
      reportActivityTabError(target.reason);
      return;
    }
    const response = await sendToTab(target.tab.id, { type: 'NQIYA_DEBUG_HTML' });
    if (!response || !response.ok || !response.html) {
      setStatus('ما لقينا عناصر ننسخها. تأكد إن سجل النشاط محمّل.', 'error');
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
/* Dry-run simulation                                                  */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Safe deletion                                                       */
/* ------------------------------------------------------------------ */
function showProgress(done, total, message) {
  el.progressWrap.hidden = false;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressLabel.textContent = `تم حذف ${done} من ${total}${message ? ` — ${message}` : ''}`;
}

function setDeletingState(busy) {
  deleting = busy;
  if (busy) el.stopBtn.hidden = false;
  else if (!scanning && !simulating) el.stopBtn.hidden = true;
  el.deleteStopBtn.hidden = !busy;
  el.testDeleteBtn.textContent = busy ? 'جاري التنفيذ…' : 'جرّب حذف عنصر واحد';
  updateButtons();
}

function openConfirmModal(mode) {
  const gates = gateState();
  const selected = selectedItems().slice(0, clampCap());

  if (!selected.length) {
    setStatus('ما فيه عناصر محددة.', 'error');
    return;
  }
  // Belt and braces: refuse to open if any gate is still closed.
  if (!(gates.hasResults && gates.backupOk && gates.dryRunOff)) return;
  if (mode === 'batch' && !gates.testOk) return;

  const newest = selected[0];
  el.modalBody.textContent = '';

  const addLine = (label, value) => {
    const p = document.createElement('p');
    p.className = 'modal-line';
    p.textContent = `${label}: ${value}`;
    el.modalBody.append(p);
  };

  addLine('عدد العناصر', String(selected.length));
  addLine('القطع', `قبل ${gates.cutoff.label}`);
  addLine('أحدث عنصر', `${newest.date || 'بدون تاريخ'} — ${String(newest.text || '').slice(0, 90)}`);
  if (mode === 'single') addLine('الوضع', 'حذف عنصر واحد للتجربة');

  if (gates.recent) {
    const warn = document.createElement('p');
    warn.className = 'modal-warn';
    warn.textContent =
      'تحذير: القطع في السنة الحالية أو السابقة. «أحدث عنصر» أعلاه هو أول ما سيُحذف — راجعه قبل التأكيد.';
    el.modalBody.append(warn);

    const ackLabel = document.createElement('label');
    ackLabel.className = 'switch';
    const ack = document.createElement('input');
    ack.type = 'checkbox';
    ack.id = 'recentAck';
    const ackText = document.createElement('span');
    ackText.textContent = 'أفهم أن هذا النطاق حديث وأريد المتابعة';
    ackLabel.append(ack, ackText);
    el.modalBody.append(ackLabel);
    ack.addEventListener('change', updateModalConfirm);
  }

  el.modal.dataset.mode = mode;
  el.modal.dataset.recent = gates.recent ? '1' : '0';
  el.confirmWord.value = '';
  updateModalConfirm();
  el.modal.hidden = false;
  el.confirmWord.focus();
}

function closeModal() {
  el.modal.hidden = true;
  el.confirmWord.value = '';
}

function updateModalConfirm() {
  const typed = el.confirmWord.value.trim() === 'احذف';
  const recent = el.modal.dataset.recent === '1';
  const ack = document.getElementById('recentAck');
  const ackOk = !recent || !!(ack && ack.checked);
  el.modalConfirm.disabled = !(typed && ackOk);
}

async function startDeletion(mode) {
  if (deleting || scanning || simulating) return;

  const selected = selectedItems().slice(0, clampCap());
  const ids = mode === 'single' ? selected.slice(0, 1).map((item) => item.id) : selected.map((item) => item.id);
  if (!ids.length) {
    setStatus('ما فيه عناصر محددة للحذف.', 'error');
    return;
  }

  try {
    const target = await requireActivityLogTab();
    if (!target.ok) {
      reportActivityTabError(target.reason);
      return;
    }
    if (target.ping.deleting) {
      setStatus('في عملية حذف شغّالة بالفعل في هذه الصفحة.', 'error');
      return;
    }

    await saveSettings();
    lastDialogHtml = '';
    dialogCaptureArmed = mode === 'single';
    deleteMode = mode;
    setDeletingState(true);
    showProgress(0, ids.length, '');

    const response = await sendToTab(target.tab.id, {
      type: 'NQIYA_DELETE',
      options: {
        ids,
        cap: ids.length,
        includeMedia: el.includeMedia.checked,
        captureDialog: mode === 'single',
        mode
      }
    });

    if (!response || !response.ok) {
      setDeletingState(false);
      const code = response && response.error;
      if (code === 'NOT_ACTIVITY_LOG') setStatus('هذه الصفحة ليست «سجل النشاط».', 'error');
      else if (code === 'ALREADY_RUNNING') setStatus('في عملية شغّالة بالفعل.', 'error');
      else setStatus('ما قدرنا نبدأ الحذف.', 'error');
      return;
    }

    setStatus(
      mode === 'single' ? 'جاري حذف عنصر واحد للتجربة…' : `جاري الحذف… ${ids.length} عنصر.`,
      'ok'
    );
  } catch (err) {
    console.warn('[NQiya] startDeletion failed', err);
    setDeletingState(false);
    setStatus('صار خطأ غير متوقع أثناء بدء الحذف.', 'error');
  }
}

async function armDialogCapture() {
  if (!(deleting && deleteMode === 'single')) {
    setStatus('التقاط نافذة التأكيد متاح فقط أثناء تجربة حذف عنصر واحد.', 'error');
    return;
  }
  dialogCaptureArmed = true;
  if (lastDialogHtml) {
    const copied = await copyText(lastDialogHtml);
    dialogCaptureArmed = false;
    setStatus(copied ? 'تم نسخ HTML لنافذة التأكيد.' : 'تعذّر النسخ للحافظة.', copied ? 'ok' : 'error');
  } else {
    setStatus('جاهز: بننسخ نافذة التأكيد أول ما تظهر.', 'ok');
  }
}

function appendSimLog(message) {
  if (!message) return;
  const li = document.createElement('li');
  li.textContent = message;
  el.simLog.append(li);
  el.simLog.scrollTop = el.simLog.scrollHeight;
}

function setSimulatingState(busy) {
  simulating = busy;
  el.stopBtn.hidden = !(busy || scanning);
  el.simBtn.textContent = busy ? 'جاري المحاكاة…' : 'تشغيل المحاكاة';
  updateButtons();
}

async function startSimulation() {
  if (scanning || simulating) return;

  if (!items.length) {
    setStatus('ما فيه نتائج. افحص حسابك أولاً.', 'error');
    return;
  }

  const ids = selectedItems()
    .slice(0, clampCap())
    .map((item) => item.id)
    .filter((id) => typeof id === 'string');

  if (!ids.length) {
    setStatus('كل العناصر مستثناة. فعّل عنصراً واحداً على الأقل.', 'error');
    return;
  }

  try {
    const target = await requireActivityLogTab();
    if (!target.ok) {
      reportActivityTabError(target.reason);
      return;
    }

    await saveSettings();
    el.simLog.textContent = '';
    appendSimLog(`محاكاة ${ids.length} عنصر — بدون أي حذف.`);
    setSimulatingState(true);

    const response = await sendToTab(target.tab.id, {
      type: 'NQIYA_SIMULATE',
      options: { ids, includeMedia: el.includeMedia.checked }
    });

    if (!response || !response.ok) {
      setSimulatingState(false);
      if (response && response.error === 'ALREADY_RUNNING') {
        setStatus('في عملية شغّالة بالفعل في الصفحة.', 'error');
      } else {
        setStatus('ما قدرنا نبدأ المحاكاة.', 'error');
      }
      return;
    }

    setStatus('جاري المحاكاة… لا تنقر شيء في الصفحة.', 'ok');
  } catch (err) {
    console.warn('[NQiya] startSimulation failed', err);
    setSimulatingState(false);
    setStatus('صار خطأ غير متوقع أثناء بدء المحاكاة.', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Calibration                                                         */
/* ------------------------------------------------------------------ */
const CALIBRATION_ERRORS = {
  NO_ROWS: 'ما لقينا صفوف في سجل النشاط.',
  NO_MENU_BUTTON: 'ما لقينا زر القائمة (3 نقاط) في أول صف.',
  MENU_NOT_FOUND: 'زر القائمة انضغط لكن القائمة ما فتحت.',
  CLICK_FAILED: 'ما قدرنا نضغط زر القائمة.',
  NOT_ACTIVITY_LOG: 'هذه الصفحة ليست «سجل النشاط».',
  ALREADY_RUNNING: 'في عملية شغّالة الآن. انتظر لين تنتهي.'
};

async function captureMenu() {
  try {
    const target = await requireActivityLogTab();
    if (!target.ok) {
      reportActivityTabError(target.reason);
      return;
    }

    setStatus('جاري التقاط القائمة…');
    const response = await sendToTab(target.tab.id, { type: 'NQIYA_CALIBRATE_MENU' });

    if (!response || !response.ok || !response.html) {
      const code = response && response.error;
      setStatus(CALIBRATION_ERRORS[code] || 'تعذّر التقاط القائمة.', 'error');
      return;
    }

    const copied = await copyText(response.html);
    setStatus(
      copied ? 'تم نسخ HTML القائمة (منقّح) للحافظة.' : 'القائمة انقرأت لكن تعذّر النسخ للحافظة.',
      copied ? 'ok' : 'error'
    );
  } catch (err) {
    console.warn('[NQiya] captureMenu failed', err);
    setStatus('تعذّر التقاط القائمة.', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Buttons / gates                                                     */
/* ------------------------------------------------------------------ */
function gateState() {
  const version = chrome.runtime.getManifest().version;
  const hasResults = items.length > 0 && !!meta.scannedAt;
  const backupOk = !!(
    backup &&
    meta.scannedAt &&
    backup.scannedAt === meta.scannedAt &&
    backup.count === items.length
  );
  const dryRunOff = !el.dryRun.checked;
  const testOk = !!(testDelete && testDelete.ok === true && testDelete.version === version);
  const cutoff = computeCutoff();
  const recent = cutoff.year >= CURRENT_YEAR - 1;
  return { hasResults, backupOk, dryRunOff, testOk, recent, cutoff, version };
}

function renderGates() {
  const gates = gateState();
  const rows = [
    ['فحص منتهي وفيه نتائج', gates.hasResults],
    ['نسخة احتياطية محمّلة في هذه الجلسة', gates.backupOk],
    ['وضع المحاكاة مُطفأ', gates.dryRunOff],
    ['تم تجربة حذف عنصر واحد بنجاح', gates.testOk]
  ];

  el.gateList.textContent = '';
  for (const [label, ok] of rows) {
    const li = document.createElement('li');
    if (ok) li.className = 'ok';
    const mark = document.createElement('span');
    mark.className = 'gate-mark';
    mark.textContent = ok ? '✓' : '✕';
    const text = document.createElement('span');
    text.textContent = label;
    li.append(mark, text);
    el.gateList.append(li);
  }
}

function updateButtons() {
  const busy = scanning || simulating || deleting;
  const gates = gateState();

  el.simBtn.disabled = busy || items.length === 0;
  el.calMenuBtn.disabled = busy;
  el.calDialogBtn.disabled = !(deleting && deleteMode === 'single');
  el.scanBtn.disabled = busy;

  // The real delete button stays disabled until every gate is open.
  el.testDeleteBtn.disabled = busy || !gates.hasResults || !gates.backupOk || !gates.dryRunOff;
  el.deleteBtn.disabled = busy || !(gates.hasResults && gates.backupOk && gates.dryRunOff && gates.testOk);
  el.deleteStopBtn.hidden = !deleting;

  renderGates();
}

/* ------------------------------------------------------------------ */
/* Messages from the content script                                    */
/* ------------------------------------------------------------------ */
chrome.runtime.onMessage.addListener((message) => {
  try {
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'NQIYA_PROGRESS') {
      if (typeof message.count === 'number') el.counter.textContent = `لقينا ${message.count} عنصر`;
      return;
    }

    if (message.type === 'NQIYA_DONE') {
      stopPolling();
      setScanningState(false);
      meta = message.meta || meta;
      renderResults(message.results);
      const cutoffText = meta.cutoffLabel ? ` قبل ${meta.cutoffLabel}` : '';
      setStatus(
        `${meta.stopped ? 'توقف الفحص' : 'انتهى الفحص'}: ${message.count || 0} عنصر${cutoffText}.`,
        'ok'
      );
      return;
    }

    if (message.type === 'NQIYA_ERROR') {
      stopPolling();
      setScanningState(false);
      setStatus('صار خطأ أثناء الفحص. جرّب إعادة تحميل الصفحة.', 'error');
      return;
    }

    if (message.type === 'NQIYA_SIM_PROGRESS') {
      appendSimLog(`${message.index}/${message.total} — ${message.message}`);
      return;
    }

    if (message.type === 'NQIYA_SIM_DONE') {
      setSimulatingState(false);
      appendSimLog(message.message || '');
      setStatus(
        message.stopped ? 'توقفت المحاكاة. ما انحذف أي شيء.' : 'انتهت المحاكاة. ما انحذف أي شيء.',
        'ok'
      );
      return;
    }

    if (message.type === 'NQIYA_DELETE_PROGRESS') {
      showProgress(message.done || 0, message.total || 0, message.message || '');
      setStatus(`تم حذف ${message.done || 0} من ${message.total || 0}.`, 'ok');
      return;
    }

    if (message.type === 'NQIYA_DELETE_DONE') {
      setDeletingState(false);
      showProgress(message.done || 0, message.total || 0, message.message || '');
      loadDeletedState().then(() => renderResults(items));
      if (message.warning) {
        setStatus('فيسبوك طلب منك التوقف، استراحة 10 دقائق.', 'error');
      } else {
        setStatus(
          `انتهى الحذف: ${message.done || 0} من ${message.total || 0}` +
            (message.failed ? ` · فشل ${message.failed}` : '') +
            (message.skipped ? ` · تخطي ${message.skipped}` : ''),
          'ok'
        );
      }
      return;
    }

    if (message.type === 'NQIYA_DIALOG_HTML') {
      lastDialogHtml = typeof message.html === 'string' ? message.html : '';
      if (dialogCaptureArmed && lastDialogHtml) {
        copyText(lastDialogHtml).then((ok) => {
          dialogCaptureArmed = false;
          setStatus(ok ? 'تم نسخ HTML لنافذة التأكيد.' : 'تعذّر النسخ للحافظة.', ok ? 'ok' : 'error');
        });
      }
    }
  } catch (err) {
    console.warn('[NQiya] popup message failed', err);
  }
});

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */
function wireEvents() {
  el.beforeYear.addEventListener('change', () => {
    renderCutoff();
    saveSettings();
  });
  el.cutoffDate.addEventListener('change', () => {
    renderCutoff();
    saveSettings();
  });
  el.clearDate.addEventListener('click', () => {
    el.cutoffDate.value = '';
    renderCutoff();
    saveSettings();
  });
  el.optComments.addEventListener('change', saveSettings);
  el.optPosts.addEventListener('change', saveSettings);
  el.dryRun.addEventListener('change', () => {
    saveSettings();
    updateButtons();
  });
  el.includeMedia.addEventListener('change', saveSettings);
  el.capInput.addEventListener('change', () => {
    el.capInput.value = String(clampCap());
    saveSettings();
  });
  el.scanBtn.addEventListener('click', startScan);
  el.stopBtn.addEventListener('click', stopEverything);
  el.backupBtn.addEventListener('click', downloadBackup);
  el.debugBtn.addEventListener('click', copyDebugHtml);
  el.simBtn.addEventListener('click', startSimulation);
  el.calMenuBtn.addEventListener('click', captureMenu);
  el.calDialogBtn.addEventListener('click', armDialogCapture);
  el.testDeleteBtn.addEventListener('click', () => openConfirmModal('single'));
  el.deleteBtn.addEventListener('click', () => openConfirmModal('batch'));
  el.deleteStopBtn.addEventListener('click', stopEverything);
  el.modalCancel.addEventListener('click', closeModal);
  el.confirmWord.addEventListener('input', updateModalConfirm);
  el.modalConfirm.addEventListener('click', () => {
    const mode = el.modal.dataset.mode === 'single' ? 'single' : 'batch';
    closeModal();
    startDeletion(mode);
  });
  el.toggleDist.addEventListener('click', () => {
    el.distribution.hidden = !el.distribution.hidden;
    el.toggleDist.textContent = el.distribution.hidden ? 'توزيع السنوات' : 'إخفاء التوزيع';
  });
}

async function init() {
  if (initialized) return;
  initialized = true;

  wireEvents();
  await loadSettings();
  await loadStoredState();
  await loadDeletedState();
  renderCutoff();
  updateButtons();
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
