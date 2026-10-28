# Jihoz.uz — Cloudflare qo'llanma

Cloudflare Jihoz.uz oldida "qalqon" vazifasini bajaradi: DDoS, botlar, zararli
so'rovlar va chegaradan oshgan trafikni serverga yetib borishidan oldin to'sadi.

> Bu hujjat **boshlang'ich sozlamalar** uchun. Loyihani Cloudflare'ga ulaganingizdan
> keyin quyidagi bosqichlarni bajarishingiz kerak.

---

## 1. Cloudflare'ga ulash

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a site** → `jihoz.uz`.
2. Free reja tanlang (Cloudflare Free — DDoS va asosiy WAF bepul).
3. DNS sozlamalarini Cloudflare bergan 2 ta nameserver bilan yangilang
   (`Registrar` → `Nameservers`).
4. **SSL/TLS** → `Full (strict)` (tavsiya etiladi) yoki kamida `Full`.
5. **Always Use HTTPS** — yoqiring.

DNS proxy (kulrang bulut) **yoqilgan** bo'lishi kerak — faqat DNS bilan emas, faqat
proxy bilan himoya ishlaydi.

---

## 2. DNS sozlamalari (Supabase bilan)

Supabase'ning o'z projekti `*.supabase.co` domenda bo'lib qoladi — undan to'g'ridan-to'g'ri
foydalanish mumkin. Lekin `jihoz.uz` orqali Supabase'ga (Edge Functions) murojaat qilish
uchun CNAME yozish tavsiya etiladi:

| Tur | Nomi | Maqsad | Proksi | TTL |
| --- | --- | --- | --- | --- |
| CNAME | `api` | `<project-ref>.supabase.co` | 🟡 Proxied | Auto |
| CNAME | `functions` | `<project-ref>.supabase.co` | 🟡 Proxied | Auto |

Natijada:

* API: `https://api.jihoz.uz/rest/v1/...`
* Edge Functions: `https://functions.jihoz.uz/functions/v1/...`

Cloudflare'da "Origin Certificate" (Full strict) ishlatish uchun Supabase'da
kutib bo'lmaydi — shu sababli **DNS only** (kulrang bulut o'chirilgan) variant ham
ishlaydi, lekin himoyasi kamroq. Tavsiya: **proxied + Full (strict)**, Origin CA
sertifikati esa Supabase'da emas, faqat Cloudflare'da bo'ladi — bu holda Supabase
TLS'ni Cloudflare'ga tekshirish uchun origin'da `Full` yetarli.

---

## 3. Firewall qoidalari (WAF)

**Security → WAF → Custom rules → Create rule**

### 3.1. API ratelimit (eng muhimi)

```
Rule name:  API — 100 so'rov / daqiqa / IP
Expression: (http.host eq "api.jihoz.uz" and http.request.uri.path starts_with "/rest/v1/")
Characteristic:  ip.src
Requests per period: 100
Period: 1 minute
Action: Block
```

### 3.2. Edge Function'lar ratelimit

```
Rule name:  Functions — 60 so'rov / daqiqa / IP
Expression: (http.host eq "functions.jihoz.uz")
Characteristic:  ip.src
Requests per period: 60
Period: 1 minute
Action: Block
```

### 3.3. Autentifikatsiya endpoint'larini himoyalash

```
Rule name:  Auth — brute force himoyasi
Expression: (http.host eq "api.jihoz.uz" and
             http.request.uri.path starts_with "/auth/v1/token")
Characteristic:  ip.src
Requests per period: 10
Period: 1 minute
Action: Block
```

### 3.4. Yomon "User-Agent" va bo'sh sarlavhalar

```
Rule name:  Yomon botlar
Expression: (http.user_agent matches "(?i)sqlmap|nikto|masscan|zgrab|dirbuster|wpscan|curl/7\\.\\d+")
Action: Block
```

```
Rule name:  Bo'sh Host sarlavhasi
Expression: (not http.host matches "^(api|functions|www)?\\.jihoz\\.uz$")
Action: Block
```

### 3.5. Skanlashga qarshi (fayl/yo'l)

```
Rule name:  Yo'l skanlash urinishlari
Expression: (http.request.uri.path matches "(?i)/\\.(env|git|aws|ssh|sql|bak)$")
Action: Block
```

---

## 4. Bot bilan kurash (Bot Fight Mode / Super Bot Fight Mode)

**Security → Bots → Bot Fight Mode**: `On` — arzon botlar va "yaxshi bot" deb
aniqlanmagan trafigi boshqaradi.

> Diqqat: Ba'zi crawler'lar (Googlebot) bot rejimida bloklanishi mumkin. "Allow" ro'yxatiga
> `Googlebot`, `bingbot`, `TelegramBot` (telegram webhook tekshiruvlari) qo'shing.

Telegram webhook so'rovlari uchun eng yaxshi yechim — IP bo'yicha emas, **secret token**
bo'yicha himoya ( allaqachon Edge Function ichida bor ✓), shuning uchun Cloudflare'da
Telegram IP'larini bloklash shart emas.

---

## 5. Rate Limiting (Cloudflare'da)

**Security → WAF → Rate Limiting Rules** — yuqoridagi custom rule'lardan tashqari
"mantiq" qoidalari:

| Nomi | Ifodasi | Limit | Davr | Action |
| --- | --- | --- | --- | --- |
| Chat RPC himoyasi | `http.request.uri.path contains "/rest/v1/rpc/send_chat_message"` | 30 | 1 min | Block |
| Yangi suhbat himoyasi | `http.request.uri.path contains "/rest/v1/rpc/start_conversation"` | 15 | 1 min | Block |
| E'lon yaratish | `http.request.uri.path contains "/functions/v1/listings-create"` | 10 | 1 min | Block |
| Buyurtma yaratish | `http.request.uri.path contains "/functions/v1/orders-create"` | 20 | 1 min | Block |
| Admin panel | `http.request.uri.path contains "/rest/v1/rpc/admin_"` | 30 | 1 min | Managed Challenge |

> "Response" har doim `429 Too Many Requests` bo'lishi kerak — mijozga aniq xabar
> ko'rsatilsin.

---

## 6. DDoS himoyasi

Cloudflare'da DDoS himoyasi avtomatik yoqilgan. Qo'shimcha:

* **Security → Settings → Security Level**: `Medium` (default) — oddiy saytlar uchun.
  API-only hostlar uchun `High` qo'yish mumkin.
* **Security → WAF → Managed Rules**: `Cloudflare Managed Ruleset` — yoqilgan.
* **Security → Traffic → Rate Limiting**: "Under Attack Mode" — faqat haqiqiy DDoS
  davomida qo'lda yoqing (oddiy foydalanuvchilarni ham bloklaydi).
* **Origin'ni Cloudflare'dan tashqariga yopish** — Supabase → Settings → Network →
  "Restrict access" bilan faqat Cloudflare IP'lariga ruxsat bering. Bu eng samarali
  qadam: origin IP'siz hujum qilinishi mumkin bo'lmaydi.

---

## 7. Cache qoidalari

**Caching → Configuration**

* Statik fayllar (`/assets/*`) — `Cache Everything`, TTL 1 yil (hash nomi bor).
* HTML sahifalar — `Cache Everything` **yoq**, faqat `Respect Existing Headers`
  (Supabase/CDN header'lariga ishonamiz).
* API (`/rest/v1/*`, `/auth/v1/*`) — hech qachon cache qilinmasin.
* Edge Functions javoblari — hech qachon cache qilinmasin (rate limit hisobiga to'g'ri kelishi kerak).

---

## 8. Botga xabar yuborish uchun Edge Function (ixtiyoriy)

Hozircha Telegram bot orqali xabar yuborish **o'chirilgan** holatda (tayyor).
Yoqishni xohlaganingizda:

1. Supabase secrets: `TELEGRAM_BOT_TOKEN`.
2. `supabase/functions/telegram-notify/index.ts` ni yaratish (hozir yo'q —
   `docs/security.md` §11 ga qarang).
3. Cloudflare'da bu path uchun cache'ni **o'chirish** shart.

---

## 9. Tekshirish ro'yxati

| # | Tekshiruv | Qayerda | Holat |
| --- | --- | --- | --- |
| 1 | DNS proxy yoqiq (kulrang bulut) | DNS → Records | 🔲 |
| 2 | SSL/TLS = Full (strict) | SSL/TLS → Overview | 🔲 |
| 3 | Always Use HTTPS | SSL/TLS → Edge Certificates | 🔲 |
| 4 | API rate limit (100/min) | WAF → Custom rules | 🔲 |
| 5 | Auth brute-force (10/min) | WAF → Custom rules | 🔲 |
| 6 | Bot Fight Mode | Security → Bots | 🔲 |
| 7 | Managed Ruleset | WAF → Managed rules | 🔲 |
| 8 | API cache qilinmaydi | Caching → Configuration | 🔲 |
| 9 | Origin IP faqat Cloudflare | Supabase → Network | 🔲 |
| 10 | `npm run security:scan` | terminal | ✅ |
