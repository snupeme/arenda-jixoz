# Telegram bot — Jihoz.uz akkaunt tasdiqlash

Bot: **@Jihoz_uz_bot** (Telegram'da `getMe` orqali tekshirilgan ✅)
Do'st havolasi: **https://t.me/Jihoz_uz_bot**

Bot faqat **akkount tasdiqlash** uchun ishlaydi: saytda havolani bosganingizda
`/start <token>` yuboriladi, bot sizga tasdiqlanganini xabar beradi.

---

## ⚠️ 0. MUHIM — bot tokenini darhol almashtiring

Bot tokeni **suhbat matni orqali ochiq ko'rib chiqilgan**. Shu sababli uni
**majburiy ravishda bekor qilib, yangisini olishingiz kerak** — aks holda botni
boshqalar ham boshqarishi mumkin.

**1-qadam — @BotFather'da tokenni bekor qiling:**

1. Telegram'da [@BotFather](https://t.me/BotFather) ni oching
2. `/revoke` yuboring
3. Botni tanlang (`@Jihoz_uz_bot`)
4. BotFather yangi token beradi — uni **darhol** `.env` faylga yozing

**2-qadam — `.env` faylni yangilang:**

```env
TELEGRAM_BOT_TOKEN=<yangi token>
```

**3-qadam — serverni qayta ishga tushiring** (`.env` o'zgarishi Vite'ni avtomatik
qayta yuklaydi; production'da `supabase secrets set TELEGRAM_BOT_TOKEN=<yangi token>`).

**4-qadam — webhook'ni yangi token bilan qayta o'rnating** (faqat Supabase/DB rejimida,
4-bo'limga qarang).

**5-qadam — tekshiring:**

```bash
npm run security:scan        # eski token kodda qolmaganini tekshiradi
curl "https://api.telegram.org/bot<YANGI_TOKEN>/getMe"
```

> Eski token o'rniga yangisini qo'ygach, `getMe` "Unauthorized" qaytarmasligi kerak.

---

## 1. Hozirgi holat (lokal rejim)

Bot tokeni `.env` faylida saqlanadi (`.gitignore`ga qo'shilgan, kodga yozilmaydi):

```env
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_BOT_USERNAME=Jihoz_uz_bot
TELEGRAM_WEBHOOK_SECRET=<64 ta random belgi>
TELEGRAM_VERIFICATION_REQUIRED=false
```

Server ishlayotgan rejim:

| Rejim | Qachon | Qanday ishlaydi |
|---|---|---|
| **Lokal** | Supabase kalitlari yo'q | Server bot bilan **long polling** orqali bog'lanadi (`getUpdates`). Webhook kerak emas. |
| **Supabase** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` bor | Token bazada yaratiladi, `/start` **Supabase Edge Function** (`telegram-webhook`) orqali qabul qilinadi. |

Ikkalasi ham **bir martalik** token ishlatadi (10 daqiqa, bir marta).

---

## 2. Qanday ishlaydi (1 daqiqada)

1. **Kabinet → Profil → "Telegram'ni tasdiqlash"** tugmasi bosiladi.
2. Server bitta martalik token yaratadi (48 belgi, 10 daqiqa muddatli) va
   `https://t.me/Jihoz_uz_bot?start=<token>` havolasini qaytaradi.
3. Havola Telegram'da ochiladi → botga `/start <token>` yuboriladi.
4. Server (long polling yoki Edge Function) tokenni tekshiradi:
   - token muddati o'tgan → *"Token muddati o'tgan (10 daqiqa)…"*
   - token allaqachon ishlatilgan → *"Bu token allaqachon ishlatilgan…"*
   - token topilmadi → *"Token topilmadi yoki muddati o'tgan…"*
   - bitta Telegram ID allaqachon boshqa akkauntga bog'langan →
     *"Bu Telegram akkaunti allaqachon boshqa Jihoz.uz akkauntiga bog'langan."*
   - hammasi joyida → **"Akkaunt tasdiqlandi!"**
5. Sayt 3 soniyada bir marta holatni tekshiradi (polling) → profil va
   e'lonlarda **"Tasdiqlangan"** belgisi paydo bo'ladi.

---

## 3. Server route'lar

| Route | Vazifasi |
|---|---|
| `GET /api/telegram/verify` | Tasdiqlash holati (`configured`, `mode`, `verified`, `telegramUsername`) |
| `POST /api/telegram/verify` | Bir martalik token yaratadi → deep link qaytaradi |
| `POST /api/telegram/bot-update` | Telegram webhook qabulchi (`x-telegram-bot-api-secret-token` sarlavhasi tekshiriladi, boshqasi → **403**) |

---

## 4. Supabase (production) ga o'tish

1. **Secret**:
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=<token> TELEGRAM_BOT_USERNAME=Jihoz_uz_bot TELEGRAM_WEBHOOK_SECRET=<secret>
   ```
2. **Edge Function**ni joylashtirish:
   ```bash
   supabase functions deploy telegram-webhook
   ```
   (`supabase/config.toml` da `verify_jwt = false` — Telegram JWT yubormaydi.)
3. **Webhook**ni o'rnatish (Telegram'ga aynan shu `secret_token` beriladi):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<project-ref>.supabase.co/functions/v1/telegram-webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
4. Tekshirish: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` → `url` to'g'ri, `last_error_message` bo'sh bo'lishi kerak.

> Muhim: **webhook va long polling bir vaqtda ishlamaydi.** Webhook o'rnatilganda
> serverdagi long polling avtomatik to'xtaydi (Telegram 409 xatosi) — bu normal.

---

## 5. Xavfsizlik

- Bot tokeni **faqat** serverda (`.env` / Edge Function secrets) saqlanadi, frontend kodida yo'q.
- Webhook `x-telegram-bot-api-secret-token` sarlavhasini tekshiradi — boshqa so'rovlar rad etiladi.
- Token **bir martalik** (replay mumkin emas), 10 daqiqa muddatli.
- Bitta Telegram ID → bitta Jihoz.uz akkaunti (`profiles.telegram_id` unique).
- Soatiga 5 marta token so'rash chegarasi (bazadagi `create_telegram_token`).
- `.env` `.gitignore`da — repo'ga tushmaydi.

### Bot tokenini almashtirish (zarur bo'lsa)
1. @BotFather → `/revoke` → yangi token.
2. `.env` va Edge Function secret'ini yangilash:
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=<yangi token>
   ```
3. Yangi token bilan webhook'ni qayta o'rnatish (yuqoridagi 3-bosqich).
