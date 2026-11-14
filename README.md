<div align="center">

# 🌿 NQiya | نقية

**Review and clean your own old Facebook activity, safely and locally.**
**راجع نشاطك القديم على فيسبوك ونظّفه بأمان، وبشكل محلي بالكامل.**



![Manifest V3](https://img.shields.io/badge/Manifest-V3-00a651?style=for-the-badge)




![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-f7df1e?style=for-the-badge&logo=javascript&logoColor=black)




![Privacy](https://img.shields.io/badge/100%25-Client--side-00a651?style=for-the-badge)




![Status](https://img.shields.io/badge/Status-Phase%202-orange?style=for-the-badge)



[English](#-english) · [العربية](#-العربية)

<!-- Replace with a real banner/screenshot -->
<img src="docs/screenshots/banner.png" alt="NQiya banner" width="720">

</div>

---

## 🇬🇧 English

### Overview
NQiya is a Chrome/Edge extension (Manifest V3) that helps you **review your own old Facebook comments and posts**, export a **JSON backup**, and — only after several explicit safety steps — **delete them from your own Activity Log**. Everything runs in your browser: no servers, no external APIs, no libraries, no tracking.

### Features
| Feature | Status |
|---|---|
| Scan your Activity Log for old comments and posts | ✅ |
| Dynamic cutoff: any year down to 2005, or an exact date | ✅ |
| Per-year counts of what the scan found | ✅ |
| Preview text, date, link and type for each item | ✅ |
| Per-item checkbox to exclude items from deletion | ✅ |
| Download a backup `nqiya-backup-DD-MM-YYYY.json` | ✅ |
| Arabic / French / English date parsing (ambiguous dates excluded) | ✅ |
| Dry-run simulation (opens menus, clicks no delete control) | ✅ |
| Menu / confirm-dialog HTML calibration tools | ✅ |
| Safe deletion behind 5 gates, allowlisted clicks, verified per item | ✅ |

### Cutoff
- The year list is generated from the **current year down to 2005** — no hardcoded years.
- Meaning: *everything before 1 January of the selected year*.
- Optional **exact date** (`before DD/MM/YYYY`) overrides the year.
- A cutoff later than **1 January of the current year** is never allowed; it is clamped and the UI says so.
- The status line always states the exact cutoff, e.g. `كل شيء قبل 1 يناير 2019`.
- If the cutoff falls in the **current or previous year**, a red warning appears. Deletion in that window additionally requires an extra acknowledgement checkbox in the confirmation dialog, which shows the **newest item** (date + text preview) that would be deleted.

### Safe deletion — the five gates
The delete button stays **disabled** until all of these are true:

1. A scan finished and the list is non-empty.
2. The JSON backup was downloaded **in this scan session** (matching `scannedAt`, same item count).
3. **Dry-run is OFF** (it is ON by default).
4. A **single-item test deletion** succeeded and was verified. This flag is tied to the extension version and is cleared when the version changes.
5. In the confirmation dialog: you type the word **«احذف»**, having seen the item count, the cutoff and the newest item.

### How an item is deleted
1. The row is located by its id, scrolled into view.
2. Its **3-dots button** is clicked (label starts with `خيارات إضافية من أجل`).
3. The menu is searched for an option whose label matches **only** this allowlist:
   `نقل إلى سلة المهملات`, `حذف`, `Move to Trash`, `Delete`, `Supprimer`, `Déplacer vers la corbeille`.
   If no allowlisted option exists (e.g. only "hide from profile"), the item is **skipped** and logged as `غير قابل للحذف`. Hiding is never done automatically.
4. If a confirmation dialog appears, only a button matching this allowlist is clicked:
   `حذف`, `نقل إلى سلة المهملات`, `تأكيد`, `موافق`, `نعم`, `Delete`, `Move to Trash`, `Confirm`, `OK`, `Supprimer`, `Déplacer vers la corbeille`.
5. Success is **verified**: the row must disappear from the DOM within ~8 s. Otherwise it counts as failed and is **not retried**.
6. Items run **sequentially** with a random 2.5–5 s delay, and a 20–40 s pause every 10 items.
7. Default cap is 25 items per session (adjustable up to 100), the run stops after **3 consecutive failures**, and STOP halts instantly even mid-delay.
8. If Facebook warns or rate-limits (`تقييد`, `temporarily blocked`, `slow down`, `réessayez plus tard`, …), everything stops immediately with: `فيسبوك طلب منك التوقف، استراحة 10 دقائق`.
9. Progress is persisted per item id in `chrome.storage.local`, so closing the popup does not lose it and deleted items are never retried.

### Calibration tools
The real menu/dialog markup was never sampled, so two diagnostic buttons exist:
- **التقاط القائمة (تشخيص)** — opens the 3-dots menu of the **first row only**, copies a sanitized HTML snapshot (no `class`/`style`, no raw URLs, `role`/`aria-*` kept, visible option labels kept, other text replaced with `TEXT`), then closes it with **Escape**. It never clicks an option.
- **التقاط نافذة التأكيد** — works only during the single-item test; copies the sanitized confirmation dialog before it is confirmed.

All selectors and Arabic UI strings live in two objects at the top of `content.js`: `SELECTORS` and `DELETE_SELECTORS` (with fallbacks). No selectors are scattered through the code.

### Media warning
Activity rows such as "added a photo/video" may delete the **actual media**. The `تضمين عناصر الصور والفيديو` checkbox is **OFF by default**; while it is off those rows are skipped.

> Posts moved to Trash may be restorable for a limited time. **Deleted comments are permanent.**

### Privacy & safety
- 🔒 No network requests, no external libraries, no analytics.
- 💾 Data stays in `chrome.storage.local` and in the backup file you download.
- 🧱 All scanned text is rendered with `textContent` — never `innerHTML`.
- ✅ `background.js` and `content.js` verify `sender.id === chrome.runtime.id` and validate message types before acting.
- 🔑 Permissions are unchanged: `storage`, `activeTab`, `scripting`, and `*://*.facebook.com/*`.
- 🚫 Deletion only runs on URLs containing `/allactivity`, and only touches rows already collected by the scan.
- 🧪 Phase 1 remains available: scan, preview, backup and dry run never delete anything.

### Installation
1. Download this repository (**Code → Download ZIP**) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select the project folder (the one containing `manifest.json`).
4. Pin the extension to the toolbar.

### Usage
1. Open Facebook on desktop and go to **Settings → Activity Log** (`facebook.com/me/allactivity`).
2. Choose the cutoff year or an exact date, and the item types.
3. Press **«افحص حسابي الآن»**, review the list and untick anything you want to keep.
4. Download the **JSON backup**.
5. Run the **dry run** to confirm the menu options are recognised.
6. Turn dry-run **off**, run **«جرّب حذف عنصر واحد»**, verify it worked.
7. Only then is the delete button enabled; confirm by typing «احذف».

### Known limitations
- Facebook changes its DOM often; the bundled selectors were derived from real Activity Log HTML but the **menu and dialog markup has not been sampled yet** — that is what the calibration buttons are for.
- Deletion has **not been executed against a live Facebook session** in this repository's checks; only static checks and dry-run logic were verified.
- Rows whose date cannot be parsed with certainty are **never** included.
- Items are matched by link/ID; if Facebook re-renders a row between scan and delete, the row may not be found and is skipped.
- Deleting may be limited or blocked by Facebook at any time; the extension stops rather than retrying.
- There is **no undo** inside the extension, and deleted comments cannot be restored.

### Roadmap
- [x] Phase 1: scan, preview, backup
- [x] Phase 2: dynamic cutoff, dry run, calibration
- [x] Phase 2: safe deletion behind gates
- [ ] Selector calibration from a real menu/dialog sample
- [ ] Optional resume-after-reload scheduling

### Disclaimer
This is an independent project, not affiliated with or endorsed by Meta/Facebook. Use it at your own risk, always keep a backup, and note that automated interaction may be restricted by Facebook's terms.

---

<div dir="rtl">

## 🇩🇿 العربية

### نظرة عامة
«نقية» إضافة لمتصفح كروم/إيدج (Manifest V3) تساعدك على **مراجعة تعليقاتك ومنشوراتك القديمة على فيسبوك**، وتصدير **نسخة احتياطية بصيغة JSON**، ثم — بعد خطوات أمان صريحة فقط — **حذفها من سجل نشاطك**. كل شيء يعمل داخل متصفحك: بدون خوادم، وبدون واجهات برمجية خارجية، وبدون مكتبات، وبدون تتبّع.

### المزايا
| الميزة | الحالة |
|---|---|
| فحص سجل النشاط بحثاً عن التعليقات والمنشورات القديمة | ✅ |
| قطع ديناميكي: أي سنة حتى 2005، أو تاريخ محدد | ✅ |
| عدّاد لكل سنة لما لقاه الفحص | ✅ |
| معاينة النص والتاريخ والرابط والنوع لكل عنصر | ✅ |
| مربع اختيار لكل عنصر لاستثنائه من الحذف | ✅ |
| تنزيل نسخة احتياطية `nqiya-backup-DD-MM-YYYY.json` | ✅ |
| قراءة التواريخ بالعربية والفرنسية والإنجليزية (التواريخ الغامضة تُستثنى) | ✅ |
| محاكاة كاملة بدون أي حذف | ✅ |
| أدوات تشخيص لالتقاط HTML القائمة ونافذة التأكيد | ✅ |
| حذف آمن خلف 5 بوابات، ونقرات من قوائم مسموحة فقط، وتحقق لكل عنصر | ✅ |

### القطع (Cutoff)
- قائمة السنوات تُبنى **من السنة الحالية نزولاً إلى 2005** — بدون قائمة ثابتة.
- المعنى: *كل شيء قبل 1 يناير من السنة المختارة*.
- حقل **تاريخ محدد** اختياري يتجاوز السنة.
- **لا يُسمح** بقطع بعد 1 يناير من السنة الحالية؛ يُضبط تلقائياً والواجهة توضح ذلك.
- سطر الحالة يذكر القطع دائماً، مثال: `كل شيء قبل 1 يناير 2019`.
- إذا وقع القطع في **السنة الحالية أو السابقة** يظهر تحذير أحمر، والحذف في هذا النطاق يحتاج مربع إقرار إضافي داخل نافذة التأكيد، مع عرض **أحدث عنصر** (التاريخ + مقتطف النص) قبل التنفيذ.

### بوابات الحذف الخمس
زر الحذف يبقى **معطّلاً** حتى تتحقق كل هذه الشروط:

1. انتهى فحص وفيه نتائج غير فارغة.
2. تم تنزيل **النسخة الاحتياطية** في نفس جلسة الفحص (نفس `scannedAt` ونفس العدد).
3. **وضع المحاكاة مُطفأ** (وهو مفعّل افتراضياً).
4. نجح **حذف عنصر واحد للتجربة** وتم التحقق منه. هذا العلم مرتبط بإصدار الإضافة ويُمسح عند تغيير الإصدار.
5. في نافذة التأكيد: تكتب كلمة **«احذف»** بعد رؤية عدد العناصر والقطع وأحدث عنصر.

### كيف يُحذف العنصر
1. يُحدَّد الصف بمعرّفه ويُمرَّر إلى مجال الرؤية.
2. يُنقر زر **النقاط الثلاث** (وصفه يبدأ بـ `خيارات إضافية من أجل`).
3. تُبحث القائمة عن خيار يطابق **فقط** هذه القائمة المسموحة:
   `نقل إلى سلة المهملات`, `حذف`, `Move to Trash`, `Delete`, `Supprimer`, `Déplacer vers la corbeille`.
   إذا ما فيه خيار مسموح (مثلاً «إخفاء من الملف الشخصي») يُتخطى العنصر ويُسجّل `غير قابل للحذف`. الإخفاء لا يُنفَّذ تلقائياً أبداً.
4. إذا ظهرت نافذة تأكيد، يُنقر زر يطابق هذه القائمة المسموحة فقط:
   `حذف`, `نقل إلى سلة المهملات`, `تأكيد`, `موافق`, `نعم`, `Delete`, `Move to Trash`, `Confirm`, `OK`, `Supprimer`, `Déplacer vers la corbeille`.
5. **التحقق من النجاح**: يجب أن يختفي الصف من الصفحة خلال ~8 ثوانٍ، وإلا يُحسب فشلاً **ولا يُعاد**.
6. التنفيذ **متسلسل** بتأخير عشوائي 2.5–5 ثوانٍ، واستراحة 20–40 ثانية كل 10 عناصر.
7. الحد الافتراضي 25 عنصراً في الجلسة (قابل للتعديل حتى 100)، والتوقف التلقائي بعد **3 إخفاقات متتالية**، وزر الإيقاف يوقف فوراً حتى أثناء الانتظار.
8. إذا أرسل فيسبوك تحذيراً أو تقييداً (`تقييد`, `temporarily blocked`, `slow down`, `réessayez plus tard`…) يتوقف كل شيء فوراً مع رسالة: `فيسبوك طلب منك التوقف، استراحة 10 دقائق`.
9. التقدّم محفوظ لكل عنصر في `chrome.storage.local`، فإغلاق النافذة لا يضيّعه، والعناصر المحذوفة لا تُعاد.

### أدوات التشخيص
لم يتم أخذ عيّنة من DOM القائمة أو نافذة التأكيد الحقيقية، لذلك يوجد زرّان:
- **التقاط القائمة (تشخيص)** — يفتح قائمة النقاط الثلاث في **أول صف فقط**، وينسخ نسخة HTML منظّفة (بدون `class`/`style`، بدون روابط حقيقية، مع الحفاظ على `role`/`aria-*` ونصوص خيارات القائمة، واستبدال بقية النصوص بـ `TEXT`)، ثم يغلقها بـ **Escape**. لا ينقر أي خيار.
- **التقاط نافذة التأكيد** — يعمل فقط أثناء تجربة حذف عنصر واحد، وينسخ نافذة التأكيد المنظّفة قبل التأكيد.

كل المحدّدات والنصوص موجودة في كائنين في أعلى `content.js`: `SELECTORS` و`DELETE_SELECTORS` (مع بدائل متعددة)، ولا توجد محدّدات مبعثرة في الكود.

### تحذير الوسائط
عناصر مثل «تمت إضافة صورة/فيديو» قد تحذف **الوسائط نفسها**. خيار `تضمين عناصر الصور والفيديو` **مُطفأ افتراضياً**، وطالما هو مطفأ تُتخطى هذه العناصر.

> المنشورات المنقولة إلى سلة المهملات قد تكون قابلة للاسترجاع لمدة محدودة، أما **التعليقات المحذوفة فحذفها نهائي**.

### الخصوصية والأمان
- 🔒 لا طلبات شبكة، ولا مكتبات خارجية، ولا تحليلات.
- 💾 البيانات تبقى في `chrome.storage.local` وفي الملف الذي تنزّله.
- 🧱 كل النصوص تُعرض بـ `textContent` فقط — أبداً `innerHTML`.
- ✅ `background.js` و`content.js` يتحققان من `sender.id === chrome.runtime.id` ومن شكل الرسائل قبل التنفيذ.
- 🔑 الصلاحيات كما هي: `storage`, `activeTab`, `scripting`, و`*://*.facebook.com/*`.
- 🚫 الحذف يعمل فقط على روابط تحتوي `/allactivity`، وفقط على الصفوف التي جمعها الفحص.
- 🧪 المرحلة الأولى باقية: الفحص والمعاينة والنسخة الاحتياطية والمحاكاة لا تحذف شيئاً.

### التثبيت
1. نزّل المستودع (**Code ← Download ZIP**) وفك الضغط.
2. افتح `chrome://extensions` (أو `edge://extensions`) وفعّل **وضع المطوّر**.
3. اضغط **Load unpacked** واختر المجلد الذي فيه `manifest.json`.
4. ثبّت الإضافة في شريط الأدوات.

### الاستخدام
1. افتح فيسبوك من الحاسوب ثم **الإعدادات ← سجل النشاط** (`facebook.com/me/allactivity`).
2. اختر سنة القطع أو تاريخاً محدداً، ونوع العناصر.
3. اضغط **«افحص حسابي الآن»**، راجع القائمة وأزل التحديد عمّا تريد الاحتفاظ به.
4. نزّل **النسخة الاحتياطية (JSON)**.
5. شغّل **المحاكاة** لتتأكد أن خيارات القائمة مفهومة.
6. أطفئ المحاكاة، ثم **«جرّب حذف عنصر واحد»** وتأكد من نجاحه.
7. بعدها فقط يُفعّل زر الحذف، وأكّد بكتابة «احذف».

### حدود معروفة
- فيسبوك يغيّر بنية الصفحة باستمرار؛ المحدّدات الحالية مبنية على HTML حقيقي لسجل النشاط، لكن **DOM القائمة ونافذة التأكيد لم يُؤخذ منه عيّنة بعد** — ولهذا وُجدت أدوات التشخيص.
- الحذف **لم يُنفَّذ على جلسة فيسبوك حقيقية** ضمن فحوص هذا المستودع؛ ما تم التحقق منه هو الفحص الساكن ومنطق المحاكاة.
- العناصر التي لا يُقرأ تاريخها بيقين **لا تُضمَّن** أبداً.
- المطابقة تعتمد على الرابط/المعرّف؛ إذا أعاد فيسبوك رسم الصف بين الفحص والحذف فقد لا نجده ويُتخطى.
- قد يحدّ فيسبوك من الحذف أو يمنعه في أي وقت؛ الإضافة تتوقف بدل إعادة المحاولة.
- **لا يوجد تراجع** داخل الإضافة، والتعليقات المحذوفة لا يمكن استرجاعها.

### خارطة الطريق
- [x] المرحلة 1: فحص ومعاينة ونسخ احتياطي
- [x] المرحلة 2: قطع ديناميكي ومحاكاة وأدوات تشخيص
- [x] المرحلة 2: حذف آمن خلف بوابات
- [ ] معايرة المحدّدات من عيّنة قائمة/نافذة تأكيد حقيقية
- [ ] استئناف تلقائي بعد إعادة تحميل الصفحة (اختياري)

### إخلاء مسؤولية
مشروع مستقل، غير تابع لشركة Meta/فيسبوك ولا مدعوم منها. استخدمه على مسؤوليتك، واحتفظ دائماً بنسخة احتياطية، وقد تقيّد شروط فيسبوك التفاعل الآلي مع منصتها.

</div>

---

<div align="center">

Built with ❤️ in Algeria 🇩🇿 · صُنع بحب في الجزائر

</div>
