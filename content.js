/* content.js — NQiya (Phase 1)
 * Scans the user's OWN Facebook Activity Log, previews old items and prepares a backup.
 * There is NO deletion code here, and nothing clicks Facebook menus or buttons.
 */
(() => {
  'use strict';

  // Guard against double injection (manifest content script + popup re-injection).
  if (window.__nqiyaContentLoaded) return;
  window.__nqiyaContentLoaded = true;

  /* =========================================================================
   * SELECTORS — the ONLY place that knows about Facebook's DOM.
   * Edit these arrays when Facebook changes its markup. Every entry is a
   * fallback: they are tried in order and the first one that yields items wins.
   *
   * Row anatomy of the Arabic Activity Log (desktop):
   *   row div
   *     +- header (h3)                        group/heading line
   *     +- label > input[type=checkbox]       row checkbox; aria-label holds date + time
   *     +- content
   *          +- text line (span[dir=auto])    the comment/post text
   *          +- a[role=link][aria-label^="عرض"]   per-item permalink ("view" link)
   *          +- div[role=button][aria-haspopup=dialog]   3-dots menu (read-only here)
   * ========================================================================= */
  const SELECTORS = {
    activityPage: {
      // URL fragments that identify the Activity Log page.
      urlHints: ['/allactivity', 'activity_log', 'activitylog', 'sk=allactivity'],
      // Headings that identify the Activity Log page (AR / EN / FR / DE).
      headingSelectors: ['h1', 'h2', '[role="heading"]'],
      headingTexts: [
        'سجل النشاط',
        'سجل النشاطات',
        'activity log',
        "journal d'activité",
        'aktivitätsprotokoll'
      ]
    },
    // One row = the wrapper that owns the row checkbox (and, when present, the 3-dots button).
    // `:has()` keeps the match on the smallest wrapper instead of the whole page.
    itemContainers: [
      'div[role="main"] div:has(> div > label > input[type="checkbox"][aria-label])',
      'div[role="main"] div:has(> div > div > input[type="checkbox"][aria-label])',
      'div[role="main"] div:has(input[type="checkbox"][aria-label]):has(div[role="button"][aria-haspopup="dialog"])',
      'div[role="main"] div[data-pagelet^="ActivityLog"]'
    ],
    // Row checkbox: its aria-label is the authoritative date source.
    rowCheckbox: ['input[type="checkbox"][aria-label]'],
    // Row 3-dots button. Declared for reference only — nothing here clicks it.
    rowMenuButton: [
      'div[role="button"][aria-haspopup="dialog"][aria-label^="خيارات إضافية"]',
      'div[role="button"][aria-haspopup="menu"][aria-label^="خيارات إضافية"]'
    ],
    // Anchors that point at an item permalink (used by the fallback strategy).
    itemLinkAnchors: [
      'a[role="link"][aria-label^="عرض"][href]',
      'a[href*="comment_id="]',
      'a[href*="/posts/"]',
      'a[href*="permalink"]',
      'a[href*="story_fbid"]',
      'a[href*="/photo"]',
      'a[href*="fbid="]'
    ],
    // The row's "عرض" (view) link — this is the per-item permalink.
    viewLink: ['a[role="link"][aria-label^="عرض"]'],
    // Candidate elements that hold the item's text.
    textCandidates: ['span[dir="auto"]', 'div[dir="auto"]', 'p', '[data-ad-preview="message"]'],
    // Date sources, in priority order:
    // 1) row checkbox aria-label (numeric date + time)
    // 2) row heading h3 (date written with a month name, hence unambiguous)
    // 3) legacy Facebook date elements
    dateCandidates: [
      'input[type="checkbox"][aria-label]',
      'h3',
      'abbr',
      'time',
      'a[role="link"] span',
      'span[aria-label]',
      '[title]'
    ],
    // Scrollable containers to try when loading more items.
    scrollContainers: ['div[role="main"]', 'div[role="feed"]', 'div[data-pagelet="root"]'],
    // Fallback: how many ancestors to climb from a permalink anchor to find the item.
    anchorClimbLevels: 10,
    // Debug: how many raw items to copy for diagnostics.
    firstItemsForDebug: 3
  };

  /* =========================================================================
   * DELETE_SELECTORS — selectors and UI strings for the dry-run / deletion
   * pipeline. Nothing in this file clicks a menu option unless its label is in
   * `deleteOptionTexts`, and nothing clicks a dialog button unless its label is
   * in `confirmTexts`.
   * ========================================================================= */
  const DELETE_SELECTORS = {
    // Row 3-dots button (label starts with the Arabic for "more options for").
    rowMenuButton: [
      'div[role="button"][aria-label^="خيارات إضافية من أجل"]',
      'div[role="button"][aria-haspopup="dialog"][aria-label^="خيارات إضافية"]',
      'div[role="button"][aria-haspopup="menu"][aria-label^="خيارات إضافية"]',
      'div[role="button"][aria-haspopup]'
    ],
    // Menu that opens after clicking the 3-dots button (rendered in a portal).
    menuContainers: [
      'div[role="menu"]',
      'div[role="dialog"] div[role="menu"]',
      'div[role="dialog"]',
      'div[role="listbox"]'
    ],
    // A clickable menu option, whatever element Facebook used for it.
    menuOptions: ['[role="menuitem"]', '[role="menuitemradio"]', 'a[role="menuitem"]', 'div[role="button"]'],
    // Facebook's confirmation dialog and its buttons.
    dialog: ['div[role="dialog"]', 'div[aria-modal="true"]'],
    dialogButtons: [
      'div[role="dialog"] [role="button"]',
      'div[role="dialog"] button',
      'div[aria-modal="true"] [role="button"]'
    ],
    // The ONLY menu option labels that may ever be treated as deletion.
    deleteOptionTexts: [
      'نقل إلى سلة المهملات',
      'نقل الى سلة المهملات',
      'حذف',
      'Move to Trash',
      'Delete',
      'Supprimer',
      'Déplacer vers la corbeille'
    ],
    // The ONLY dialog button labels that may ever be clicked to confirm.
    confirmTexts: [
      'حذف',
      'نقل إلى سلة المهملات',
      'تأكيد',
      'موافق',
      'نعم',
      'Delete',
      'Move to Trash',
      'Confirm',
      'OK',
      'Supprimer',
      'Déplacer vers la corbeille'
    ],
    // Labels that are never deletion, even if they contain a delete-looking word.
    forbiddenOptionTexts: [
      'إخفاء',
      'الإبلاغ',
      'حظر',
      'إلغاء',
      'hide',
      'report',
      'block',
      'cancel',
      'masquer',
      'signaler',
      'bloquer',
      'annuler'
    ],
    // Warning / rate-limit phrases (Arabic, French, English).
    warningTexts: [
      'تم تقييد',
      'حاول مرة أخرى لاحق',
      'طلبات كثيرة',
      'استخدمت كل',
      'temporarily blocked',
      'temporarily restricted',
      'slow down',
      'try again later',
      'too many requests',
      'temporairement bloqué',
      'réessayez plus tard',
      'trop de demandes'
    ],
    // Media activity phrases: these rows can remove real photos/videos.
    mediaTexts: [
      'تمت إضافة صورة',
      'تمت إضافة فيديو',
      'صورة جديدة',
      'صور جديدة',
      'فيديو جديد',
      'تمت مشاركة',
      'ألبوم',
      'added a photo',
      'added a video',
      'added photos',
      'added videos',
      'shared a photo',
      'shared a video',
      'a ajouté une photo',
      'a ajouté une vidéo',
      'a partagé une photo',
      'a partagé une vidéo'
    ],
    // Regions Facebook uses to announce problems.
    liveRegionSelectors: ['div[role="alert"]', 'div[role="status"]'],
    // UI strings shown in the popup log (Arabic).
    ui: {
      rowNotFound: 'ما لقينا الصف في الصفحة — تم التخطي',
      menuButtonNotFound: 'ما لقينا زر القائمة — تم التخطي',
      menuNotFound: 'ما فتحت القائمة — تم التخطي',
      notDeletable: 'غير قابل للحذف — تم التخطي',
      skippedMedia: 'صور/فيديو — تم التخطي',
      wouldClick: 'كان بينقر',
      menuOpened: 'فتحنا القائمة',
      dryRunDone: 'انتهت المحاكاة بدون أي حذف',
      stoppedByUser: 'توقف بناءً على طلبك',
      warningDetected: 'فيسبوك طلب منك التوقف، استراحة 10 دقائق'
    }
  };

  /* =========================================================================
   * Scan limits
   * ========================================================================= */
  const MAX_ITEMS = 300;          // hard cap per scan
  const MAX_ITERATIONS = 90;      // hard cap on scroll rounds
  const NO_NEW_LIMIT = 4;         // stop after N scroll rounds with no new items
  const SCROLL_DELAY_MIN = 1500;  // ms
  const SCROLL_DELAY_MAX = 3000;  // ms
  const MAX_TEXT_LENGTH = 420;    // chars kept per preview

  const STORAGE_RESULTS = 'nqiya.results';
  const STORAGE_META = 'nqiya.meta';
  const STORAGE_PROGRESS = 'nqiya.progress';

  const state = { running: false, simulating: false, stopRequested: false };

  /* =========================================================================
   * Small helpers
   * ========================================================================= */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function log(...args) {
    try {
      console.log('[NQiya]', ...args);
    } catch (_) {
      /* ignore */
    }
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\u200b|\u200e|\u200f|\u202a-\u202e|\ufeff/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

  function toLatinDigits(value) {
    return String(value || '').replace(/[٠-٩۰-۹]/g, (ch) => {
      const arabic = ARABIC_DIGITS.indexOf(ch);
      if (arabic >= 0) return String(arabic);
      const persian = PERSIAN_DIGITS.indexOf(ch);
      return persian >= 0 ? String(persian) : ch;
    });
  }

  // Normalize a word for month lookup: strip diacritics, unify alef/ya/ta-marbuta, lowercase.
  function normalizeWord(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[ؤئ]/g, 'ي')
      .replace(/[.،,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /* =========================================================================
   * Months — Arabic (standard + Levantine), French, English.
   * Keys are already normalized (see normalizeWord).
   * ========================================================================= */
  const MONTHS = {
    // Arabic — standard Gregorian names
    'يناير': 1,
    'فبراير': 2,
    'مارس': 3,
    'ابريل': 4,
    'مايو': 5,
    'يونيو': 6,
    'يوليو': 7,
    'اغسطس': 8,
    'سبتمبر': 9,
    'اكتوبر': 10,
    'نوفمبر': 11,
    'ديسمبر': 12,
    // Arabic — Levantine names
    'كانون الثاني': 1,
    'شباط': 2,
    'اذار': 3,
    'نيسان': 4,
    'ايار': 5,
    'حزيران': 6,
    'تموز': 7,
    'اب': 8,
    'ايلول': 9,
    'تشرين الاول': 10,
    'تشرين الثاني': 11,
    'كانون الاول': 12,
    // French — full and common abbreviations
    'janvier': 1,
    'fevrier': 2,
    'mars': 3,
    'avril': 4,
    'mai': 5,
    'juin': 6,
    'juillet': 7,
    'aout': 8,
    'septembre': 9,
    'octobre': 10,
    'novembre': 11,
    'decembre': 12,
    'janv': 1,
    'fevr': 2,
    'avr': 4,
    'juil': 7,
    'sept': 9,
    'oct': 10,
    'nov': 11,
    'dec': 12,
    // English — full and common abbreviations
    'january': 1,
    'february': 2,
    'march': 3,
    'april': 4,
    'may': 5,
    'june': 6,
    'july': 7,
    'august': 8,
    'september': 9,
    'october': 10,
    'november': 11,
    'december': 12,
    'jan': 1,
    'feb': 2,
    'mar': 3,
    'apr': 4,
    'jun': 6,
    'jul': 7,
    'aug': 8,
    'sep': 9
  };

  // Look up a month name inside a short token group, dropping filler words
  // such as "de"/"of" and Portuguese/Spanish style connectors.
  function lookupMonth(token) {
    const normalized = normalizeWord(token);
    if (!normalized) return null;
    if (MONTHS[normalized]) return MONTHS[normalized];

    const words = normalized.split(' ').filter((w) => w && !['de', 'du', 'of', 'the', 'el', 'la', 'del'].includes(w));
    if (!words.length) return null;
    // Try every word / pair of adjacent words, longest pair first.
    if (words.length >= 2) {
      const pair = MONTHS[words.slice(-2).join(' ')];
      if (pair) return pair;
      const pairStart = MONTHS[words.slice(0, 2).join(' ')];
      if (pairStart) return pairStart;
    }
    for (let i = words.length - 1; i >= 0; i -= 1) {
      if (MONTHS[words[i]]) return MONTHS[words[i]];
    }
    return null;
  }

  function buildDate(year, month, day, matched) {
    if (!Number.isInteger(year) || year < 2006 || year > 2100) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      return null; // e.g. 31 February
    }
    const pad = (n) => String(n).padStart(2, '0');
    return { iso: `${year}-${pad(month)}-${pad(day)}`, year, month, day, matched: matched || '' };
  }

  // "12 مارس 2018" / "12 de mars 2018" / "March 12, 2018" / "2018-03-12" / "17/04/2018"
  // Returns null when the date is not certain (never guess).
  function parseDate(raw) {
    try {
      if (!raw) return null;
      const text = toLatinDigits(String(raw)).replace(/[\u200b-\u200f\u202a-\u202e]/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length < 6) return null;
      if (!/(19|20)\d{2}/.test(text)) return null; // a year is mandatory for certainty

      // 1) day + month name + year  ("12 مارس 2018", "12 de mars 2018", "12 March 2018")
      const dayFirst = /(\d{1,2})\s+(?:de\s+|of\s+)?([\p{L}][\p{L}\s.]{0,24}?)\s*,?\s+((?:19|20)\d{2})/gu;
      for (const match of text.matchAll(dayFirst)) {
        const day = Number(match[1]);
        const month = lookupMonth(match[2]);
        const year = Number(match[3]);
        const parsed = month ? buildDate(year, month, day, match[0]) : null;
        if (parsed) return parsed;
      }

      // 2) month name + day + year  ("March 12, 2018", "12 mars, 2018" handled above)
      const monthFirst = /([\p{L}][\p{L}\s.]{0,24}?)\s+(\d{1,2})\s*,?\s+((?:19|20)\d{2})/gu;
      for (const match of text.matchAll(monthFirst)) {
        const month = lookupMonth(match[1]);
        const day = Number(match[2]);
        const year = Number(match[3]);
        const parsed = month ? buildDate(year, month, day, match[0]) : null;
        if (parsed) return parsed;
      }

      // 3) numeric dates
      const numeric = text.match(/(\d{1,4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,4})/);
      if (numeric) {
        const first = numeric[1];
        const second = numeric[2];
        const third = numeric[3];
        if (first.length === 4) {
          // YYYY-MM-DD is unambiguous
          return buildDate(Number(first), Number(second), Number(third), numeric[0]);
        }
        if (third.length === 4) {
          const a = Number(first);
          const b = Number(second);
          if (a > 12 && b <= 12) return buildDate(Number(third), b, a, numeric[0]); // DD-MM-YYYY
          if (b > 12 && a <= 12) return buildDate(Number(third), a, b, numeric[0]); // MM-DD-YYYY
          return null; // both <= 12 → day/month order is ambiguous: never guess
        }
        return null; // two-digit year is ambiguous
      }

      return null;
    } catch (err) {
      log('parseDate failed', err);
      return null;
    }
  }

  /* =========================================================================
   * Page detection
   * ========================================================================= */
  function isActivityLogPage() {
    try {
      const url = (location.href || '').toLowerCase();
      if (SELECTORS.activityPage.urlHints.some((hint) => url.includes(hint))) return true;

      const headings = [];
      for (const selector of SELECTORS.activityPage.headingSelectors) {
        headings.push(...Array.from(document.querySelectorAll(selector)));
        if (headings.length > 40) break;
      }
      for (const node of headings.slice(0, 40)) {
        const text = cleanText(node.innerText || node.textContent).toLowerCase();
        if (!text || text.length > 60) continue;
        if (SELECTORS.activityPage.headingTexts.some((hint) => text.includes(hint.toLowerCase()))) return true;
      }
      return false;
    } catch (err) {
      log('isActivityLogPage failed', err);
      return false;
    }
  }

  /* =========================================================================
   * Item discovery
   * ========================================================================= */
  function getRoot() {
    return document.querySelector('div[role="main"]') || document.body;
  }

  function isLikelyItem(element) {
    try {
      if (!element || element.nodeType !== 1) return false;
      const text = element.innerText || element.textContent || '';
      const trimmed = text.trim();
      if (trimmed.length < 10 || trimmed.length > 2500) return false;
      return element.querySelector('a[href]') !== null;
    } catch (_) {
      return false;
    }
  }

  function findItemsByAnchors(root) {
    const anchorSelector = SELECTORS.itemLinkAnchors.join(',');
    const anchors = Array.from(root.querySelectorAll(anchorSelector)).slice(0, 600);
    const found = [];
    const seen = new Set();

    for (const anchor of anchors) {
      let node = anchor.parentElement;
      for (let level = 0; level < SELECTORS.anchorClimbLevels && node; level += 1) {
        if (isLikelyItem(node) && !seen.has(node)) {
          // Prefer the smallest ancestor that still contains the anchor and a date.
          const hasDate = extractDate(node) !== null;
          if (hasDate) {
            seen.add(node);
            found.push(node);
            break;
          }
        }
        node = node.parentElement;
      }
    }
    return found;
  }

  function findItemContainers() {
    const root = getRoot();
    for (const selector of SELECTORS.itemContainers) {
      const nodes = Array.from(root.querySelectorAll(selector)).filter(isLikelyItem);
      if (nodes.length) return nodes;
    }
    return findItemsByAnchors(root);
  }

  /* =========================================================================
   * Item field extraction
   * ========================================================================= */
  function extractDate(element) {
    const candidates = [];
    try {
      for (const selector of SELECTORS.dateCandidates) {
        const nodes = Array.from(element.querySelectorAll(selector)).slice(0, 12);
        for (const node of nodes) {
          const raw = node.getAttribute('title') || node.getAttribute('aria-label') || node.textContent;
          if (raw) candidates.push(raw);
        }
        if (candidates.length > 12) break;
      }
      // Last resort: the tail of the item's own text.
      candidates.push((element.innerText || element.textContent || '').slice(-400));
    } catch (err) {
      log('extractDate failed', err);
    }

    for (const candidate of candidates) {
      const parsed = parseDate(candidate);
      if (parsed) return parsed;
    }
    return null;
  }

  function looksLikeDateOnly(text) {
    const value = cleanText(text);
    return value.length > 0 && value.length < 60 && parseDate(value) !== null;
  }

  function extractText(element, dateInfo) {
    let best = '';
    try {
      for (const selector of SELECTORS.textCandidates) {
        for (const node of Array.from(element.querySelectorAll(selector)).slice(0, 30)) {
          const value = cleanText(node.innerText || node.textContent);
          if (value.length > best.length && !looksLikeDateOnly(value)) best = value;
          if (best.length > MAX_TEXT_LENGTH * 2) break;
        }
        if (best.length > 20) break;
      }
      if (best.length < 8) best = cleanText(element.innerText || element.textContent);
    } catch (err) {
      log('extractText failed', err);
    }

    if (dateInfo && dateInfo.matched) best = best.split(dateInfo.matched).join(' ');

    // Drop date-only fragments and collapse the rest.
    best = best
      .split('\n')
      .map((line) => cleanText(line))
      .filter((line) => line && !looksLikeDateOnly(line))
      .join(' · ');

    return best.slice(0, MAX_TEXT_LENGTH).trim();
  }

  function cleanUrl(href) {
    try {
      const url = new URL(href, location.href);
      const junk = ['__cft__', '__tn__', 'hc_ref', 'fref', 'ref', 'rdr'];
      for (const key of junk) url.searchParams.delete(key);
      return url.toString();
    } catch (_) {
      return href;
    }
  }

  function extractLink(element) {
    try {
      const anchors = Array.from(element.querySelectorAll('a[href]'));
      let best = null;
      let bestScore = 0;
      for (const anchor of anchors) {
        const href = anchor.href || '';
        if (!href) continue;
        let score = 0;
        if (/comment_id=/.test(href)) score += 60;
        if (/permalink/.test(href)) score += 50;
        if (/\/posts\//.test(href)) score += 45;
        if (/story_fbid/.test(href)) score += 40;
        if (/\/photo/.test(href)) score += 35;
        if (/fbid=/.test(href)) score += 20;
        if (!/facebook\.com/i.test(href)) score -= 100;
        if (score > bestScore) {
          bestScore = score;
          best = href;
        }
      }
      if (!best) return { link: cleanUrl(location.href), type: 'unknown' };
      const type = /comment_id=|reply_comment|comment_/i.test(best) ? 'comment' : 'post';
      return { link: cleanUrl(best), type };
    } catch (err) {
      log('extractLink failed', err);
      return { link: cleanUrl(location.href), type: 'unknown' };
    }
  }

  // Stable identifier derived from the item's own link/IDs, or a hash of its
  // date + text when the link carries no usable ID.
  function makeItemId(link, dateIso, text) {
    const parts = [];
    try {
      const url = new URL(link, location.href);
      for (const key of ['story_fbid', 'comment_id', 'fbid']) {
        const value = url.searchParams.get(key);
        if (value && /^[\w.-]{3,}$/.test(value)) parts.push(`${key}:${value}`);
      }
      const pfbid = url.pathname.match(/pfbid[\w]+/);
      if (pfbid) parts.push(pfbid[0]);
    } catch (_) {
      /* ignore malformed URLs */
    }
    if (parts.length) return `fb-${parts.join('_')}`;

    let hash = 5381;
    const seed = `${dateIso}|${text.slice(0, 80)}`;
    for (let i = 0; i < seed.length; i += 1) {
      hash = ((hash << 5) + hash + seed.charCodeAt(i)) >>> 0;
    }
    return `h-${hash.toString(36)}`;
  }

  function isMediaItem(text) {
    const value = normalizeUiText(text);
    return DELETE_SELECTORS.mediaTexts.some((phrase) => value.includes(normalizeUiText(phrase)));
  }

  function collectItems(options) {
    const items = [];
    const containers = findItemContainers();
    for (const container of containers) {
      try {
        const dateInfo = extractDate(container);
        if (!dateInfo) continue; // date unknown → excluded, never guessed
        if (!(dateInfo.iso < options.cutoffIso)) continue; // strictly before the cutoff

        const text = extractText(container, dateInfo);
        if (!text) continue;

        const { link, type } = extractLink(container);

        items.push({
          id: makeItemId(link, dateInfo.iso, text),
          key: `${dateInfo.iso}|${text.slice(0, 60)}`,
          text,
          date: dateInfo.iso,
          link,
          type,
          media: isMediaItem(text)
        });
      } catch (err) {
        log('collectItems item failed', err);
      }
    }
    return items;
  }

  function keepItem(item, options) {
    if (item.type === 'unknown') return true; // unknown type is still the user's own item
    if (item.type === 'comment') return options.includeComments;
    return options.includePosts;
  }

  /* =========================================================================
   * Scroll
   * ========================================================================= */
  function scrollDown() {
    try {
      let scrolled = false;
      for (const selector of SELECTORS.scrollContainers) {
        const node = document.querySelector(selector);
        if (!node || node.scrollHeight <= node.clientHeight + 40) continue;
        const before = node.scrollTop;
        node.scrollTop = node.scrollHeight;
        if (node.scrollTop !== before) scrolled = true;
      }
      const beforeWindow = window.scrollY;
      window.scrollTo(0, document.body.scrollHeight);
      if (window.scrollY !== beforeWindow) scrolled = true;
      if (!scrolled) window.scrollBy(0, 800);
    } catch (err) {
      log('scrollDown failed', err);
    }
  }

  /* =========================================================================
   * Messaging / storage
   * ========================================================================= */
  function sendToRuntime(message) {
    try {
      chrome.runtime.sendMessage(message, () => {
        // Reading lastError prevents noisy "Receiving end does not exist" logs.
        const _ = chrome.runtime.lastError;
      });
    } catch (err) {
      log('sendToRuntime failed', err);
    }
  }

  function saveProgress(count) {
    try {
      chrome.storage.local.set({ [STORAGE_PROGRESS]: { count, at: Date.now() } }).catch(() => {});
    } catch (err) {
      log('saveProgress failed', err);
    }
  }

  async function saveResults(results, meta) {
    try {
      await chrome.storage.local.set({
        [STORAGE_RESULTS]: results,
        [STORAGE_META]: meta,
        [STORAGE_PROGRESS]: { count: results.length, at: Date.now(), done: true }
      });
    } catch (err) {
      log('saveResults failed', err);
    }
  }

  /* =========================================================================
   * Scan loop
   * ========================================================================= */
  async function runScan(options) {
    if (state.running) return { ok: false, error: 'ALREADY_RUNNING' };
    if (!isActivityLogPage()) return { ok: false, error: 'NOT_ACTIVITY_LOG' };
    if (!options.includeComments && !options.includePosts) return { ok: false, error: 'NO_TYPE_SELECTED' };

    const settings = {
      cutoffIso: /^\d{4}-\d{2}-\d{2}$/.test(String(options.cutoffIso || ''))
        ? String(options.cutoffIso)
        : `${Number(options.beforeYear) || new Date().getFullYear()}-01-01`,
      cutoffLabel: typeof options.cutoffLabel === 'string' ? options.cutoffLabel.slice(0, 60) : '',
      includeComments: options.includeComments !== false,
      includePosts: options.includePosts !== false
    };

    state.running = true;
    state.stopRequested = false;

    const found = new Map();
    let noNewRounds = 0;
    let iteration = 0;

    try {
      while (iteration < MAX_ITERATIONS && !state.stopRequested && found.size < MAX_ITEMS) {
        iteration += 1;

        const items = collectItems(settings);
        let added = 0;
        for (const item of items) {
          if (!keepItem(item, settings)) continue;
          if (found.has(item.key)) continue;
          found.set(item.key, {
            id: item.id,
            text: item.text,
            date: item.date,
            link: item.link,
            type: item.type,
            media: item.media
          });
          added += 1;
          if (found.size >= MAX_ITEMS) break;
        }

        noNewRounds = added === 0 ? noNewRounds + 1 : 0;
        sendToRuntime({ type: 'NQIYA_PROGRESS', count: found.size, iteration, scanning: true });
        saveProgress(found.size);

        if (found.size >= MAX_ITEMS) break;
        if (noNewRounds >= NO_NEW_LIMIT) break;

        scrollDown();
        await sleep(randomBetween(SCROLL_DELAY_MIN, SCROLL_DELAY_MAX));
      }
    } catch (err) {
      log('runScan failed', err);
      sendToRuntime({ type: 'NQIYA_ERROR', error: 'SCAN_FAILED' });
    } finally {
      state.running = false;
    }

    const results = Array.from(found.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const meta = {
      count: results.length,
      cutoffIso: settings.cutoffIso,
      cutoffLabel: settings.cutoffLabel,
      includeComments: settings.includeComments,
      includePosts: settings.includePosts,
      scannedAt: new Date().toISOString(),
      stopped: state.stopRequested
    };

    await saveResults(results, meta);
    sendToRuntime({ type: 'NQIYA_DONE', count: results.length, results, meta });
    return { ok: true, count: results.length, stopped: state.stopRequested };
  }

  /* =========================================================================
   * Debug helper — raw HTML of the first few activity items
   * ========================================================================= */
  function debugHtml() {
    try {
      const containers = findItemContainers().slice(0, SELECTORS.firstItemsForDebug);
      if (!containers.length) {
        return { ok: false, error: 'NO_ITEMS', html: '' };
      }
      const parts = containers.map((node, index) => {
        const html = node.outerHTML || '';
        return `<!-- ===== item ${index + 1} (${node.tagName.toLowerCase()}) ===== -->\n${
          html.length > 12000 ? `${html.slice(0, 12000)}\n<!-- truncated -->` : html
        }`;
      });
      return { ok: true, html: parts.join('\n\n') };
    } catch (err) {
      log('debugHtml failed', err);
      return { ok: false, error: 'DEBUG_FAILED', html: '' };
    }
  }

  /* =========================================================================
   * Shared UI helpers (seconds, clicks on MENU BUTTONS ONLY, sanitizing)
   * ========================================================================= */
  function normalizeUiText(value) {
    return cleanText(value)
      .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isTrustedSender(sender) {
    try {
      return !!(sender && sender.id === chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  // Sleep that rejects immediately when STOP is requested, even mid-delay.
  function abortableSleep(ms) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (state.stopRequested) {
          reject(new Error('ABORTED'));
          return;
        }
        if (Date.now() - started >= ms) {
          resolve();
          return;
        }
        setTimeout(tick, 150);
      };
      tick();
    });
  }

  function findMenuButton(row) {
    try {
      for (const selector of DELETE_SELECTORS.rowMenuButton) {
        const node = row.querySelector(selector);
        if (node) return node;
      }
    } catch (err) {
      log('findMenuButton failed', err);
    }
    return null;
  }

  function visibleMenus() {
    const menus = [];
    try {
      for (const selector of DELETE_SELECTORS.menuContainers) {
        for (const node of document.querySelectorAll(selector)) {
          if (node.getClientRects().length === 0) continue;
          if (!menus.includes(node)) menus.push(node);
        }
      }
    } catch (err) {
      log('visibleMenus failed', err);
    }
    return menus;
  }

  async function waitForMenus(timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const menus = visibleMenus().filter(
        (menu) => menu.querySelector('[role="menuitem"], [role="menuitemradio"], [role="button"]') !== null
      );
      if (menus.length) return menus;
      if (state.stopRequested) return [];
      await sleep(200);
    }
    return [];
  }

  // Returns the allowlisted option inside the open menu, or null.
  function findMenuOption(menus) {
    const wanted = DELETE_SELECTORS.deleteOptionTexts.map(normalizeUiText).filter(Boolean);
    const forbidden = DELETE_SELECTORS.forbiddenOptionTexts.map(normalizeUiText).filter(Boolean);
    const candidates = [];

    try {
      for (const menu of menus) {
        for (const selector of DELETE_SELECTORS.menuOptions) {
          for (const node of menu.querySelectorAll(selector)) {
            if (node.getClientRects().length === 0) continue;
            const label = normalizeUiText(node.innerText || node.textContent);
            if (!label || label.length > 80) continue;
            if (candidates.some((c) => c.node === node)) continue;
            candidates.push({ node, label });
          }
        }
      }
    } catch (err) {
      log('findMenuOption failed', err);
    }

    const isForbidden = (label) => forbidden.some((bad) => label === bad || label.startsWith(bad));

    for (const pass of ['exact', 'prefix', 'contains']) {
      for (const candidate of candidates) {
        if (isForbidden(candidate.label)) continue;
        for (const want of wanted) {
          if (pass === 'exact' && candidate.label === want) return { node: candidate.node, label: candidate.label };
          if (pass === 'prefix' && want.length >= 5 && candidate.label.startsWith(want)) {
            return { node: candidate.node, label: candidate.label };
          }
          if (pass === 'contains' && want.length >= 10 && candidate.label.includes(want)) {
            return { node: candidate.node, label: candidate.label };
          }
        }
      }
    }
    return null;
  }

  // The only DOM click helper in this file: used for the row 3-dots button.
  // It is never given a delete option or a confirm button as an argument.
  function activateMenuButton(button) {
    try {
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      button.click();
      return true;
    } catch (err) {
      log('activateMenuButton failed', err);
      return false;
    }
  }

  function closeMenu() {
    try {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true })
      );
      document.body.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true })
      );
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    } catch (err) {
      log('closeMenu failed', err);
    }
  }

  /* =========================================================================
   * Diagnostics: sanitized HTML (no class/style, no raw URLs, other text masked)
   * ========================================================================= */
  function sanitizeCapture(root) {
    const skipTags = new Set(['script', 'style', 'svg', 'path', 'noscript', 'link', 'meta', 'img', 'i']);
    const keepTextSelector = '[role="menuitem"], [role="menuitemradio"], [role="button"], button';

    function walk(node, depth) {
      if (!node || depth > 16) return '';
      if (node.nodeType === 3) {
        const value = cleanText(node.nodeValue);
        if (!value) return '';
        const parent = node.parentElement;
        // Keep text only where it is a UI label (menu option / dialog button).
        if (parent && parent.closest(keepTextSelector)) return escapeHtml(value.slice(0, 120));
        return 'TEXT';
      }
      if (node.nodeType !== 1) return '';

      const tag = node.tagName.toLowerCase();
      if (skipTags.has(tag)) return '';

      const attrs = [];
      for (const attr of Array.from(node.attributes || [])) {
        const name = attr.name.toLowerCase();
        if (!/^(role|aria-[a-z-]+|dir|tabindex|type|checked|disabled|title|href)$/.test(name)) continue;
        if (name === 'href') {
          attrs.push('href="URL"');
          continue;
        }
        attrs.push(`${name}="${escapeHtml(String(attr.value).replace(/\s+/g, ' ').slice(0, 60))}"`);
      }

      let inner = '';
      for (const child of Array.from(node.childNodes || [])) inner += walk(child, depth + 1);
      inner = inner.replace(/(?:TEXT\s*){2,}/g, 'TEXT ').trim();
      if (!inner) return '';
      return `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>${inner}</${tag}>`;
    }

    try {
      return walk(root, 0).slice(0, 20000);
    } catch (err) {
      log('sanitizeCapture failed', err);
      return '';
    }
  }

  /* =========================================================================
   * Calibration: open the FIRST row's 3-dots menu, capture it, close it.
   * Never clicks an option.
   * ========================================================================= */
  async function captureMenuDiagnostics() {
    if (!isActivityLogPage()) return { ok: false, error: 'NOT_ACTIVITY_LOG' };
    if (state.running || state.simulating) return { ok: false, error: 'ALREADY_RUNNING' };

    const rows = findItemContainers();
    if (!rows.length) return { ok: false, error: 'NO_ROWS' };

    const row = rows[0];
    const button = findMenuButton(row);
    if (!button) return { ok: false, error: 'NO_MENU_BUTTON' };

    try {
      row.scrollIntoView({ block: 'center' });
      if (!activateMenuButton(button)) return { ok: false, error: 'CLICK_FAILED' };

      const menus = await waitForMenus(4000);
      if (!menus.length) {
        closeMenu();
        return { ok: false, error: 'MENU_NOT_FOUND' };
      }

      const html = sanitizeCapture(menus[menus.length - 1]);
      closeMenu();
      return { ok: true, html };
    } catch (err) {
      log('captureMenuDiagnostics failed', err);
      closeMenu();
      return { ok: false, error: 'CALIBRATION_FAILED' };
    }
  }

  /* =========================================================================
   * Dry run (commit 1): opens the menu, reports the option it WOULD click,
   * closes with Escape. It never clicks a delete option or a dialog button.
   * ========================================================================= */
  function rowItemId(row) {
    try {
      const dateInfo = extractDate(row);
      if (!dateInfo) return null;
      const link = extractLink(row).link;
      const text = extractText(row, dateInfo);
      return makeItemId(link, dateInfo.iso, text);
    } catch (err) {
      log('rowItemId failed', err);
      return null;
    }
  }

  async function findRowById(id, attempts) {
    const tries = Number(attempts) > 0 ? Number(attempts) : 14;
    for (let i = 0; i < tries; i += 1) {
      if (state.stopRequested) return null;
      const rows = findItemContainers();
      for (const row of rows) {
        if (rowItemId(row) === id) return row;
      }
      scrollDown();
      try {
        await abortableSleep(600 + Math.floor(Math.random() * 600));
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  function sendSimProgress(payload) {
    sendToRuntime({
      type: 'NQIYA_SIM_PROGRESS',
      index: payload.index,
      total: payload.total,
      done: payload.done,
      message: payload.message
    });
  }

  async function simulateDeletion(rawOptions) {
    const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
    const ids = Array.isArray(options.ids) ? options.ids.filter((id) => typeof id === 'string').slice(0, 100) : [];
    const includeMedia = options.includeMedia === true;

    if (!isActivityLogPage()) return { ok: false, error: 'NOT_ACTIVITY_LOG' };
    if (!ids.length) return { ok: false, error: 'NO_IDS' };
    if (state.running || state.simulating) return { ok: false, error: 'ALREADY_RUNNING' };

    state.simulating = true;
    state.stopRequested = false;
    const total = ids.length;
    let processed = 0;

    try {
      for (const id of ids) {
        if (state.stopRequested) break;
        processed += 1;

        const row = await findRowById(id, 10);
        if (!row) {
          sendSimProgress({ index: processed, total, done: false, message: DELETE_SELECTORS.ui.rowNotFound });
          continue;
        }

        const rowText = extractText(row, extractDate(row));
        if (!includeMedia && isMediaItem(rowText)) {
          sendSimProgress({ index: processed, total, done: false, message: DELETE_SELECTORS.ui.skippedMedia });
          continue;
        }

        const button = findMenuButton(row);
        if (!button) {
          sendSimProgress({ index: processed, total, done: false, message: DELETE_SELECTORS.ui.menuButtonNotFound });
          continue;
        }

        if (!activateMenuButton(button)) {
          sendSimProgress({ index: processed, total, done: false, message: DELETE_SELECTORS.ui.menuButtonNotFound });
          continue;
        }

        const menus = await waitForMenus(4000);
        if (!menus.length) {
          closeMenu();
          sendSimProgress({ index: processed, total, done: false, message: DELETE_SELECTORS.ui.menuNotFound });
          continue;
        }

        const option = findMenuOption(menus);
        closeMenu();

        sendSimProgress({
          index: processed,
          total,
          done: false,
          message: option
            ? `${DELETE_SELECTORS.ui.wouldClick}: ${option.label}`
            : DELETE_SELECTORS.ui.notDeletable
        });

        if (processed < total) {
          try {
            await abortableSleep(1200 + Math.floor(Math.random() * 800));
          } catch (_) {
            break;
          }
        }
      }
    } catch (err) {
      log('simulateDeletion failed', err);
    } finally {
      closeMenu();
      state.simulating = false;
    }

    const stopped = state.stopRequested;
    state.stopRequested = false;
    sendToRuntime({
      type: 'NQIYA_SIM_DONE',
      ok: true,
      processed,
      total,
      stopped,
      message: stopped ? DELETE_SELECTORS.ui.stoppedByUser : DELETE_SELECTORS.ui.dryRunDone
    });
    return { ok: true, processed, total, stopped };
  }

  /* =========================================================================
   * Message handling
   * ========================================================================= */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      // Only this extension may drive the page.
      if (!isTrustedSender(sender)) return false;
      if (!message || typeof message.type !== 'string') return false;

      switch (message.type) {
        case 'NQIYA_PING':
          sendResponse({
            ok: true,
            isActivityLog: isActivityLogPage(),
            scanning: state.running,
            simulating: state.simulating
          });
          return false;

        case 'NQIYA_SCAN': {
          if (state.running) {
            sendResponse({ ok: false, error: 'ALREADY_RUNNING' });
            return false;
          }
          // Start in the background: a scan can outlive the popup.
          runScan(message.options || {});
          sendResponse({ ok: true, started: true });
          return false;
        }

        case 'NQIYA_STOP':
          state.stopRequested = true;
          sendResponse({ ok: true, stopping: true });
          return false;

        case 'NQIYA_SIMULATE': {
          if (state.running || state.simulating) {
            sendResponse({ ok: false, error: 'ALREADY_RUNNING' });
            return false;
          }
          // Runs in the background so a long simulation can outlive the popup.
          simulateDeletion(message.options || {});
          sendResponse({ ok: true, started: true });
          return false;
        }

        case 'NQIYA_CALIBRATE_MENU': {
          captureMenuDiagnostics()
            .then((result) => sendResponse(result))
            .catch((err) => {
              log('calibration failed', err);
              sendResponse({ ok: false, error: 'CALIBRATION_FAILED' });
            });
          return true; // async response
        }

        case 'NQIYA_DEBUG_HTML': {
          const result = debugHtml();
          sendResponse(result);
          return false;
        }

        default:
          return false;
      }
    } catch (err) {
      log('onMessage failed', err);
      try {
        sendResponse({ ok: false, error: 'MESSAGE_FAILED' });
      } catch (_) {
        /* ignore */
      }
      return false;
    }
  });

  // Exposed for manual debugging in the DevTools console.
  window.__nqiyaParseDate = parseDate;

  log('content script ready');
})();
