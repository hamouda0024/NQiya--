<div align="center">

# 🌿 NQiya | نقية

**Review and clean your own old Facebook activity, safely and locally.**
**راجع نشاطك القديم على فيسبوك ونظّفه بأمان، وبشكل محلي بالكامل.**



![Manifest V3](https://img.shields.io/badge/Manifest-V3-00a651?style=for-the-badge)




![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-f7df1e?style=for-the-badge&logo=javascript&logoColor=black)




![Privacy](https://img.shields.io/badge/100%25-Client--side-00a651?style=for-the-badge)




![Status](https://img.shields.io/badge/Status-Phase%201-orange?style=for-the-badge)



[English](#-english) · [العربية](#-العربية)

<!-- Replace with a real banner/screenshot -->
<img src="docs/screenshots/banner.png" alt="NQiya banner" width="720">

</div>

---

## 🇬🇧 English

### Overview
NQiya is a Chrome extension (Manifest V3) that helps you **review your own old Facebook comments and posts** before a chosen year, and export a **JSON backup** of them. Everything runs in your browser: no servers, no external APIs, no tracking.

### Features
| Feature | Status |
|---|---|
| Scan your Activity Log for old comments and posts | ✅ Phase 1 |
| Filter by year (2015–2019) and by type | ✅ Phase 1 |
| Preview text, date and link for each item | ✅ Phase 1 |
| Download a backup `nqiya-backup-DD-MM-YYYY.json` | ✅ Phase 1 |
| Arabic / French / English date parsing | ✅ Phase 1 |
| Safe deletion with confirmation and rate limiting | 🛠️ Planned |

### Screenshots
| Popup | Scan results | Backup |
|:---:|:---:|:---:|
| 

![popup](docs/screenshots/popup.png)

 | 

![results](docs/screenshots/results.png)

 | 

![backup](docs/screenshots/backup.png)

 |

### Installation
1. Download this repository (**Code → Download ZIP**) and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the project folder (the one containing `manifest.json`).
4. Pin the extension to the toolbar.

### Usage
1. Open Facebook on desktop and go to **Settings → Activity Log**.
2. Click the NQiya icon, choose the year and item types.
3. Press **"افحص حسابي الآن"** (Scan my account).
4. Review the list, then download the JSON backup.

### Privacy & Safety
- 🔒 No network requests of its own, no external libraries, no analytics.
- 💾 Data stays in your browser (`chrome.storage.local`) and in the files you download.
- 👤 Designed to work only on **your own** activity.
- ⚠️ Phase 1 contains **no deletion code**.

### Project Structure
```
NQiya/
├── manifest.json     # Extension config (MV3)
├── background.js     # Service worker, message relay
├── content.js        # Scanning logic + SELECTORS config
├── popup.html        # Popup UI (Arabic, RTL)
├── popup.css
├── popup.js
└── docs/screenshots/ # Images used in this README
```

### Known Limitations
- Facebook changes its DOM frequently; the `SELECTORS` object at the top of `content.js` may need updates.
- The scan needs the Activity Log tab to stay open and in the foreground.
- Distinguishing comments from posts relies on link patterns and may be imperfect.

### Roadmap
- [x] Phase 1: scan, preview, backup
- [ ] Selector tuning from real Activity Log HTML
- [ ] Phase 2: review screen and single-item deletion test
- [ ] Phase 3: safe batch deletion (confirmation, delays, STOP button)

### Disclaimer
This is an independent project, not affiliated with or endorsed by Meta/Facebook. Use it at your own risk and always keep a backup. Automated interaction may be restricted by Facebook's terms.

---

<div dir="rtl">

## 🇩🇿 العربية

### نظرة عامة
«نقية» إضافة لمتصفح كروم (Manifest V3) تساعدك على **مراجعة تعليقاتك ومنشوراتك القديمة على فيسبوك** قبل سنة تختارها، وتصدير **نسخة احتياطية بصيغة JSON**. كل شيء يعمل داخل متصفحك: بدون خوادم، وبدون واجهات برمجية خارجية، وبدون تتبّع.

### المزايا
| الميزة | الحالة |
|---|---|
| فحص سجل النشاط بحثاً عن التعليقات والمنشورات القديمة | ✅ المرحلة 1 |
| التصفية حسب السنة (2015–2019) وحسب النوع | ✅ المرحلة 1 |
| معاينة النص والتاريخ والرابط لكل عنصر | ✅ المرحلة 1 |
| تنزيل نسخة احتياطية `nqiya-backup-DD-MM-YYYY.json` | ✅ المرحلة 1 |
| قراءة التواريخ بالعربية والفرنسية والإنجليزية | ✅ المرحلة 1 |
| حذف آمن مع تأكيد وتأخير بين العمليات | 🛠️ مخطط له |

### التثبيت
1. نزّل المستودع (**Code ← Download ZIP**) وفك الضغط.
2. افتح `chrome://extensions` وفعّل **وضع المطوّر (Developer mode)**.
3. اضغط **Load unpacked** واختر المجلد الذي فيه `manifest.json`.
4. ثبّت الإضافة في شريط الأدوات.

### الاستخدام
1. افتح فيسبوك من الحاسوب، ثم **الإعدادات ← سجل النشاط**.
2. اضغط أيقونة «نقية» واختر السنة ونوع العناصر.
3. اضغط **«افحص حسابي الآن»**.
4. راجع القائمة ثم نزّل النسخة الاحتياطية.

### الخصوصية والأمان
- 🔒 لا طلبات شبكة خاصة بالإضافة، ولا مكتبات خارجية، ولا تحليلات.
- 💾 تبقى البيانات في متصفحك (`chrome.storage.local`) وفي الملفات التي تنزّلها.
- 👤 مصمّمة للعمل على **نشاطك أنت** فقط.
- ⚠️ المرحلة 1 **لا تحتوي أي كود حذف**.

### حدود معروفة
- فيسبوك يغيّر بنية الصفحة باستمرار، وقد يلزم تحديث `SELECTORS` في أعلى `content.js`.
- يحتاج الفحص إلى بقاء صفحة سجل النشاط مفتوحة في المقدمة.
- التمييز بين التعليق والمنشور يعتمد على شكل الرابط وقد لا يكون دقيقاً دائماً.

### خارطة الطريق
- [x] المرحلة 1: فحص ومعاينة ونسخ احتياطي
- [ ] ضبط الـ selectors على HTML حقيقي من سجل النشاط
- [ ] المرحلة 2: شاشة مراجعة وتجربة حذف عنصر واحد
- [ ] المرحلة 3: حذف جماعي آمن (تأكيد، تأخير، زر إيقاف)

### إخلاء مسؤولية
مشروع مستقل، غير تابع لشركة Meta/فيسبوك ولا مدعوم منها. استخدمه على مسؤوليتك واحتفظ دائماً بنسخة احتياطية. قد تقيّد شروط فيسبوك التفاعل الآلي مع منصتها.

</div>

---

<div align="center">

Built with ❤️ in Algeria 🇩🇿 · صُنع بحب في الجزائر

</div>
