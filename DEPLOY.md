# نشر BC Portal على Railway

`railway.json` جاهز في الجذر — يبني بـ NIXPACKS ثم يشغّل `npm run release && npm start`. الـ `release` script يدفع الـ schema تلقائياً على كل نشر.

## المتطلبات

- حساب على [railway.app](https://railway.app)
- المستودع مرفوع على GitHub (لديك `im7md97/bc`)

## خطوات النشر — أول مرة

### 1) أنشئ مشروع Railway جديد

- افتح [railway.app/new](https://railway.app/new)
- **Deploy from GitHub repo** → اختر `im7md97/bc`
- Railway يقرأ `railway.json` ويبدأ البناء تلقائياً

### 2) أضف قاعدة بيانات Postgres

- من داخل المشروع: **+ New** → **Database** → **Add PostgreSQL**
- Railway يضيف `DATABASE_URL` كمتغيّر بيئة تلقائياً ويربطه بخدمتك

### 3) اضبط متغيّرات البيئة

من الخدمة (bc service) → **Variables** → أضف:

| المفتاح | القيمة |
|---------|--------|
| `SESSION_SECRET` | نص عشوائي طويل (32+ حرف). في PowerShell: `[Convert]::ToBase64String((1..32 \| %{[byte](Get-Random -Max 256)}))` |
| `OPENAI_API_KEY` | *(اختياري)* لتفعيل أنس — من [platform.openai.com](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | *(اختياري)* افتراضي `gpt-4o-mini` |

### 4) اضبط النطاق (Domain)

- من الخدمة → **Settings** → **Networking** → **Generate Domain**
- ستحصل على `https://<اسم-عشوائي>.up.railway.app`
- (اختياري) اربط نطاقك الخاص من نفس الصفحة

### 5) انتظر النشر

- بعد ~2-3 دقائق يكتمل البناء
- افتح الرابط → صفحة الدخول تظهر
- Admin افتراضي: `admin / admin123` (غيّرها فوراً من `/profile`)

## النشر التلقائي عند كل push

بمجرد ربط GitHub، أي push على `main` يعيد النشر تلقائياً. لا يوجد شيء للفعل.

## Health check

- المسار: `/api/auth/me`
- يرجع 401 (unauthenticated) إذا الجلسة غير موجودة — Railway يعتبر أي 2xx/4xx نجاحاً، فيمر الفحص.

## استكشاف الأخطاء

**البناء يفشل:**
- افحص الـ log في Railway
- ابن محلياً أولاً: `npm ci && npm run build` — لو يعمل، يعمل على Railway

**الموقع يعمل لكن الجلسة تُقطع:**
- تأكد `SESSION_SECRET` مضبوط
- Railway يشغّل خلف HTTPS proxy — الكود يستخدم secure cookies تلقائياً في production

**"database connection error":**
- تأكد Postgres plugin مربوط بالخدمة (Variables → يجب أن يظهر `DATABASE_URL`)

**Anas لا يعمل:**
- تأكد `OPENAI_API_KEY` مضبوط
- الويدجت يعرض رسالة واضحة إذا المفتاح ناقص

## Rollback

Railway يحتفظ بكل نشر. من **Deployments** → اختر النشر السابق → **Redeploy**.

## بدائل أخرى

نفس المشروع يعمل بلا تعديل على:
- **Render** — اربط الـ repo، ابن بـ `npm ci && npm run build`، شغّل `npm run release && npm start`، أضف Postgres add-on
- **Fly.io** — يحتاج `Dockerfile` (استخدم `Node 22-alpine`، انسخ dist وnode_modules production فقط)
- **DigitalOcean App Platform** — نفس الشكل، اربط repo واضبط متغيرات
