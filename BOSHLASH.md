# Jihoz.uz — ishga tushirish qo'llanmasi

Bu arxiv Jihoz.uz loyihasining to'liq manba kodi (TanStack Start + React + Supabase).

---

## 1. Talablar

| Dastur | Versiya |
| --- | --- |
| Node.js | 20+ |
| npm (yoki bun) | — |
| Supabase CLI (bazaga migratsiya uchun) | 1.x |

---

## 2. O'rnatish

```bash
# 1) paketlarni o'rnatish
npm install

# 2) muhit o'zgaruvchilarini tayyorlash
cp .env.example .env
# .env faylni tahrirlang (quyida)

# 3) dev serverni ishga tushirish
npm run dev
```

Sayt: http://localhost:5173

---

## 3. `.env` fayli

Arxivda `.env` **yo'q** (maxfiy kalitlar — bot tokeni, service_role kaliti). Uni o'zingiz
yarating:

```env
# Frontend (ochiq)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# Server (maxfiy)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Telegram bot
TELEGRAM_BOT_TOKEN=<botfather-token>
TELEGRAM_BOT_USERNAME=Jihoz_uz_bot
TELEGRAM_WEBHOOK_SECRET=<random-64-hex-chars>
TELEGRAM_NOTIFY_SECRET=<random-64-hex-chars>

TELEGRAM_VERIFICATION_REQUIRED=false
```

> `.env` `.gitignore` da — hech qachon gitga qo'shmang.

---

## 4. Bazani tayyorlash (Supabase)

Supabase loyihasida **SQL Editor** orqali `supabase/migrations/` papkasidagi fayllarni
**ketma-ket** bajarish:

| # | Fayl | Nima qiladi |
| --- | --- | --- |
| 1 | `20260101000000_init.sql` | Jadvalar (profiles, listings, orders) |
| 2 | `20260101000100_telegram_verification.sql` | Telegram tasdiqlash tokenlari |
| 3 | `20260101000200_orders_and_admin.sql` | Buyurtmalar, `user_roles`, `has_role`, `audit_log` |
| 4 | `20260101000300_rate_limits_and_storage.sql` | `check_rate_limit`, storage bucket |
| 5 | `20260101000400_chat.sql` | Chat jadvallari, RPC'lar, trigger'lar, RLS |
| 6 | `20260101000500_admin_panel.sql` | Admin RPC'lar, `telegram_update_ids` |
| 7 | `20260101000600_telegram_notify.sql` | Telegram bildirishnomasi (trigger **o'shirilmagan**) |

Yoki CLI bilan:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

---

## 5. Birinchi admin

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users
where email = 'sizning@email.com'
on conflict (user_id) do update set role = 'admin';
```

Keyin: http://localhost:5173/admin

---

## 6. Edge Function'lar (faqat Supabase/DB rejimi)

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<token> \
                   TELEGRAM_WEBHOOK_SECRET=<secret> \
                   TELEGRAM_NOTIFY_SECRET=<secret>

supabase functions deploy telegram-webhook
supabase functions deploy orders-create
supabase functions deploy listings-create
# telegram-notify — hozir o'chirilgan, yoqish kerak bo'lsa:
# supabase functions deploy telegram-notify
```

Webhook'ni o'rnatish:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<project-ref>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

> Supabase kalitlari yo'q bo'lsa, bot **lokal rejimda** (long polling) ishlaydi —
> webhook kerak emas.

---

## 7. Tekshirish

```bash
npm run security:scan     # maxfiy kalitlar yo'qmi
npx tsc --noEmit          # tiplar
npm test                  # testlar
npm run build             # production build
```

---

## 8. Hujjatlar

| Fayl | Mazmuni |
| --- | --- |
| `docs/security.md` | Xavfsizlik arxitekturasi, RLS matritsasi, zaiflik xabar berish |
| `docs/cloudflare.md` | Cloudflare WAF, rate limiting, DNS/SSL |
| `docs/admin.md` | Admin panel, rollar, audit log |
| `docs/telegram-bot.md` | Bot va akkaunt tasdiqlash |

---

## 9. Tuzilma

```
src/
  components/chat/    ChatWindow · ChatPanel · MessageBubble · BookingRequest* · LoginDialog
  components/ui/      shadcn/ui komponentlari
  lib/                chat.tsx · admin.ts · store.tsx · supabase.ts · telegram-*.ts
  routes/             index · katalog · jihoz.$id · qoshish · kabinet · admin · api.telegram.*
supabase/
  migrations/         7 ta SQL migratsiya
  functions/          _shared/ · telegram-webhook · telegram-notify · orders-create · listings-create
scripts/              secret-scan.mjs
docs/                 security · cloudflare · admin · telegram-bot
```
