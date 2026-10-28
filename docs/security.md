# Jihoz.uz — Xavfsizlik hujjati

Ushbu hujjat Jihoz.uz sayti uchun qo'llanilgan xavfsizlik choralarini, chegaralarni
va zaifliklarni qanday xabar berishni tushuntiradi.

> Versiya: 1.0 · Oxirgi yangilanish: 2026-01-01

---

## 1. Arxitektura va ishonch chegaralari

| Qatlam | Ishonch darajasi | Mas'ul |
| --- | --- | --- |
| Brauzer (frontend, Vite/React) | Ishonchsiz | Foydalanuvchi |
| Supabase REST/RPC (`authenticated` rol) | Ishonchsiz — RLS + validatsiya bilan himoyalangan | Foydalanuvchi |
| Supabase Edge Functions (JWT bilan) | O'rtacha — JWT tekshiriladi, service_role ichida | Server |
| Edge Functions (service_role) | Ishonchli — hech qanday foydalanuvchi kirishi mumkin emas | Server |
| `SECURITY DEFINER` SQL funksiyalar | Ishonchli — `search_path` qat'iy belgilangan | Server |
| Telegram webhook | O'rtacha — `secret_token` sarlavhasi bilan himoyalangan | Telegram |

**Asosiy qoida:** frontend hech qachon maxfiy kalitga ega bo'lmaydi. Bot tokeni,
`service_role` kaliti va webhook maxfiy kaliti — faqat server muhitida (`Deno.env`,
Supabase secrets) saqlanadi.

---

## 2. Autentifikatsiya va avtorizatsiya

### 2.1. Rol modeli

| Rol | Kim | Imkoniyatlar |
| --- | --- | --- |
| `anon` | Ko'chib chiqqan mehmon | Faqat ochiq ma'lumot (katalog, e'lon) |
| `authenticated` | Ro'yxatdan o'tgan foydalanuvchi | O'z ma'lumotlari, chat, buyurtma, e'lon yaratish |
| `service_role` | Edge Function'lar | Barcha ma'lumot (RLS dan o'tib ketadi) |
| `admin` | `user_roles.role = 'admin'` | Statistika, foydalanuvchi boshqaruvi, shikoyatlar, audit log |

`is_admin()` — `SECURITY DEFINER` funksiya, `search_path = public` bilan:

```sql
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;
```

### 2.2. Birinchi admin

Avtomatik ravishda hech kim admin bo'lmaydi — bu ishonchli "Security by default" yechimi.
Birinchi admin qo'lda belgilanadi (batafsil [`docs/admin.md`](./admin.md)).

### 2.3. Admin huquqlari chegarasi

Muhim: admin foydalanuvchilar **barcha** suhbatlarni o'qiy olmaydi. Faqat **shikoyat
qilingan** xabarlar ko'rinadi (`admin_list_reports`). Boshqa suhbatlar admin uchun ham
yopiq — bu mijozlar maxfiyligini kafolatlaydi.

---

## 3. RLS (Row Level Security) matritsasi

Barcha foydalanuvchi ma'lumotlari saqlanadigan jadvallarda RLS yoqilgan.

### 3.1. Chat (4-migration)

| Jadval | `select` | `insert` | `update` | `delete` |
| --- | --- | --- | --- | --- |
| `conversations` | ishtirokchi (`owner_id` yoki `renter_id` = `auth.uid()`) | `renter_id = auth.uid()` | ishtirokchi | ❌ yo'q |
| `messages` | suhbat ishtirokchisi | `sender_id = auth.uid()` | faqat qabul qiluvchi `read_at` ni o'zgartiradi | ❌ yo'q |
| `conversation_blocks` | o'z qatorlari | o'z qatorlari | — | o'z qatorlari |
| `message_reports` | o'z qatorlari | o'z qatorlari | — | — |

Qo'shimcha kafolatlar:

* `messages` jadvalida **UPDATE va DELETE umuman yo'q** — `prevent_message_edit` trigger'i
  ham qo'yilgan (hatto service_role ham o'zgartirmaydi).
* `read_at` faqat **qabul qiluvchi** tomonidan yoziladi (`sender_id <> auth.uid()`).
* Xabar yozish faqat `send_chat_message` / `send_booking_request` **SECURITY DEFINER**
  RPC'lar orqali — to'g'ridan-to'g'ri `INSERT` qilinmaydi.
* `validate_chat_message` trigger'i xabar matnini saqlashdan oldin tekshiradi.

### 3.2. Profil, e'lon, buyurtma

| Jadval | Kim ko'radi | Kim yozadi |
| --- | --- | --- |
| `profiles` | o'zi + admin | o'zi (FAQAT o'z qatorlari, `id = auth.uid()`) |
| `listings` | hamma (ochiq ma'lumot) | o'zi (`user_id = auth.uid()`) |
| `orders` | buyurtmachi va e'lon egasi | buyurtmachi |
| `user_roles` | o'z roli | admin (RPC orqali) |
| `audit_log` | admin | admin (RPC orqali, avtomatik) |
| `telegram_update_ids` | admin | faqat `service_role` |

### 3.3. Tekshirish

```sql
-- barcha jadvallarda RLS yoqilganmi?
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and not rowsecurity;

-- policy'lar
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, cmd;
```

---

## 4. Tezlik chegaralari (rate limits)

### 4.1. Chat (bazadagi RPC'lar orqali)

| Amal | Chegara | Xabar |
| --- | --- | --- |
| Xabar yuborish | 20 ta / daqiqa / foydalanuvchi | "Juda tez xabar yuborilmoqda. Bir oz kutib turing." |
| Yangi suhbat ochish | 10 ta / soat / foydalanuvchi | "Juda ko'p suhbat ochdingiz. Birozdan keyin urinib ko'ring." |
| Xabar uzunligi | 1000 belgi | "Xabar 1000 belgidan uzun bo'lishi mumkin emas." |
| Bo'sh xabar | rad etiladi | "Xabar bo'sh bo'lmasligi kerak." |

Chegaralar `public.check_rate_limit(bucket, subject, limit, window_seconds)` orqali
hisoblanadi. Bu funksiya **faqat `service_role`** va `SECURITY DEFINER` RPC'lar ichida
chaqiriladi — `authenticated` roliga ochiq emas, aks holda foydalanuvchi boshqa
foydalanuvchining kvotasini "burn" qila olardi.

### 4.2. Edge Function'lar

| Funksiya | Chegara | Natija |
| --- | --- | --- |
| `listings-create` | 5 ta / soat / foydalanuvchi | `429` + "Soatiga 5 ta e'lon qo'shish mumkin." |
| `orders-create` | 10 ta / soat / foydalanuvchi | `429` + "Soatiga 10 ta buyurtma yaratish mumkin." |

### 4.3. Cloudflare darajasida

Qo'shimcha chegara — [`docs/cloudflare.md`](./cloudflare.md).

---

## 5. Server tomonidagi validatsiya

Klient validatsiyasi — qulaylik uchun. Haqiqiy tekshiruv **doim serverda**:

* **Edge Functions** — `supabase/functions/_shared/validate.ts`:
  `requireString`, `requireInt`, `requireBoolean`, `requireUuid`, `requireDate`,
  `requirePhone`, `requireTelegram`, `optionalUrl`.
* **SQL RPC'lar** — `validate_chat_message` trigger'i (bo'sh matn, uzunlik, tur).
* **Rasmiy URL** — faqat `http:`/`https:`; `javascript:`, `data:` rad etiladi
  (XSS vektoriga qarshi).
* **Telegram username** — `^[A-Za-z0-9_]{5,32}$`.

### 5.1. XSS va havola xavfsizligi

Xabarlar faqat **oddiy matn** sifatida render qilinadi (`dangerouslySetInnerHTML`
ishlatilmaydi). Havolalar `rel="noopener noreferrer nofollow"` bilan ochiladi —
yangi oynada saytning `window.opener` obyektiga kirish bloklanadi.

---

## 6. Telegram bot xavfsizligi

### 6.1. Webhook himoyasi

1. **Secret token** — `setWebhook` da `secret_token` beriladi; Telegram har bir
   so'rovda `X-Telegram-Bot-Api-Secret-Token` sarlavhasini yuboradi. Edge Function
   bu sarlavhani solishtiradi; mos kelmasa `403`.
2. **Replay himoyasi** — `telegram_update_ids` jadvali va `claim_telegram_update(bigint)`
   RPC'si. Har bir `update_id` faqat bir marta "band" qilinadi. Takrorlangan update
   `{"ok": true, "status": "duplicate"}` bilan rad etiladi (boshqa ta'sir ko'rsatilmaydi).
3. **JWT o'chirilgan** — `supabase/config.toml` da `verify_jwt = false` (Telegram JWT
   yubormaydi), himoya secret_token orqali.

### 6.2. Bot tokenini almashish (rotatsiya)

Token chatda ko'rib chiqilgani uchun **majburiy ravishda almashtirilishi kerak**:

1. @BotFather → `/revoke` → botni tanlang (yoki `/token` bilan yangi token oling).
2. Yangi tokenni `.env` faylga yozing:
   ```
   TELEGRAM_BOT_TOKEN=<yangi token>
   ```
3. Vite/server ni qayta ishga tushiring (`.env` o'zgarishi avtomatik HMR beradi).
4. `docs/telegram-bot.md` bo'yicha webhook'ni qayta o'rnating (agar DB rejimida ishlatilsa).
5. `npm run security:scan` bilan tekshiring — eski token kodda qolmasin.

> `.env` fayl `.gitignore` da turadi va hech qachon gitga qo'shilmaydi.

---

## 7. Maxfiy kalitlarni boshqarish

### 7.1. Qayerda saqlanadi

| Kalit | Qayerda | Frontendda |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | `.env` (lokal) / Supabase secrets (server) | ❌ |
| `TELEGRAM_WEBHOOK_SECRET` | `.env` / Supabase secrets | ❌ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets | ❌ |
| `SUPABASE_ANON_KEY` | `.env` (`VITE_` prefiksi bilan) | ✅ (faqat ochiq kalit) |
| `VITE_SUPABASE_URL` | `.env` | ✅ (URL — maxfiy emas) |

### 7.2. Avtomatik skan

```bash
npm run security:scan
```

Skript `scripts/secret-scan.mjs` bo'lib, quyidagilarni topadi:

* Telegram bot tokenlari
* `service_role` / JWT kalitlari
* AWS Access Key ID
* maxfiy kalitlar (private key bloklari)
* Google API / Slack / npm tokenlari
* `api_key = "..."` ko'rinishidagi qiymatlar

Topilgan kalitni chiqarishda faqat birinchi 6 va oxirgi 4 belgi ko'rsatiladi
(to'liq kalit logda yozilmaydi). CI'da `npm run security:scan` qizil bo'lishi kerak
(`exit code 1`).

### 7.3. Xavfsiz foydalanish qoidalari

* Maxfiy kalitni hech qachon `git add -A` orqali tasodifan yubormang.
* Yangi kalit qo'yishda avvalgisini darhol bekor qiling.
* Kalit komanda tarixiga tushmasin (`history`ni tozalang yoki `.env` fayl orqali).
* CI/CD da `.env` faylni `secrets` dan o'qing (repo ichida saqlamang).

---

## 8. Audit log

Barcha admin amallari `public.audit_log` jadvaliga yoziladi:

| `action` | Nimani bildiradi |
| --- | --- |
| `set_role` | Foydalanuvchi roli o'zgartirildi |
| `block_user` / `unblock_user` | Akkaunt bloklandi / blokdan chiqarildi |
| `listing_state` | E'lon tasdiqlandi yoki faolligi o'zgartirildi |
| `order_status` | Buyurtma holati o'zgartirildi |

Audit log'ga `actor_id`, `actor_email`, `action`, `target_table`, `target_id`,
`details` (JSONB) yoziladi. Panelda `/admin` → "Audit log" orqali ko'riladi.

---

## 9. Xavfsizlik testi (qo'lda checklist)

Har bir deploy'dan oldin:

```bash
npm run security:scan      # maxfiy kalitlar yo'qmi
npx tsc --noEmit           # tiplar to'g'ri
npm test                   # testlar o'tadi
```

Qo'shimcha manual tekshiruv:

- [ ] Oddiy foydalanuvchi `/admin` ni ochsa — "Ruxsat yo'q" chiqadi
- [ ] Oddiy foydalanuvchi `admin_stats` RPC'sini chaqirsa — xato
- [ ] Boshqa suhbatga `chat_messages` chaqirilsa — xato
- [ ] Xabar `UPDATE`/`DELETE` qilinganda — xato (trigger)
- [ ] Bo'sh xabar yuborilsa — "Xabar bo'sh bo'lmasligi kerak"
- [ ] 1000+ belgili xabar — rad etiladi
- [ ] 21-xabar (1 daqiqada) — "Juda tez xabar yuborilmoqda"
- [ ] 11-suhbat (1 soatda) — "Juda ko'p suhbat ochdingiz"
- [ ] Bloklangan foydalanuvchi xabar yuborolmaydi
- [ ] Webhook'ga noto'g'ri secret token bilan so'rov — `403`
- [ ] Bir xil `update_id` ni qayta yuborish — `duplicate`

---

## 10. Zaiflik xabar berish (responsible disclosure)

Zaiflik topsangiz — **avval xabar bering, keyin e'lon qiling.**

**Qayerga:**

* E-mail: `security@jihoz.uz`
* Telegram: [@Jihoz_uz_bot](https://t.me/Jihoz_uz_bot) (botga "security" yozing)

**Nima yuborish kerak:**

1. Zaiflik tavsifi (qanday takrorlanadi)
2. Ta'sir darajasi (qaysi ma'lumotlar xavf ostida)
3. Reproduksiya bosqichlari (agar mumkin bo'lsa)
4. Aloqa ma'lumotlari

**Bizning vaqtinchalik chora-tadbirlarimiz (SLAs):**

| Daraja | Ta'sir | Javob vaqti |
| --- | --- | --- |
| Kritik | Ma'lumot sizib chiqishi, autentifikatsiya buzilishi | 24 soat ichida |
| Yuqori | Xavfli xato, ma'lumotni o'zgartirish | 3 kun ichida |
| O'rtacha | Xavfni kuchaytiruvchi xato | 7 kun ichida |
| Past | Kam ta'sirli muammo | keyingi versiya |

Zaiflikni tuzatganimizdan keyin sizga xabar beramiz. Tuzatishni jamoatchilikka
ochilishini kutmasdan, avval xabar berish vaqtida to'liq ma'lumot berishni tavsiya qilamiz.

**Xavfsizlikni tekshirishga ruxsat:**

* O'zingizning akkauntingiz bilan, boshqalarga zarar yetkazmasdan.
* Ma'lumotlarni o'chirish / o'zgartirishdan oldin zaxira nusxa olish.
* Brute-force, DDoS, DoS, ijtimoiy muhandislik usullari (social engineering) — **yo'q**.
* Topilgan zaiflikni ochiq joyda (Twitter, Telegram kanal) e'lon qilishdan oldin
  bizga xabar bering.

---

## 11. Tavsiya etilgan keyingi qadamlar

| # | Vazifa | Holat |
| --- | --- | --- |
| 1 | Cloudflare WAF + rate limiting | 🔲 hujjat tayyor ([`docs/cloudflare.md`](./cloudflare.md)) |
| 2 | Supabase Point-in-Time Recovery yoqish | 🔲 |
| 3 | 2FA (TOTP) admin akkauntlari uchun | 🔲 |
| 4 | Loglarni tashqi servisga yuborish (Sentry/Cloudflare) | 🔲 |
| 5 | `npm audit` va dependabot yoqish | 🔲 |
| 6 | Yangi xabar yuborilganda Telegram bot orqali ogohlantirish | 🔲 tayyor, o'chirilgan holatda ([`src/lib/chat.tsx`](../src/lib/chat.tsx)) |
