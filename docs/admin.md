# Jihoz.uz — Admin panel qo'llanmasi

Admin panel: `/admin` (faqat `admin` roli bo'lgan foydalanuvchilar uchun).

---

## 1. Tuzilma

| Taqdimot | Vazifa |
| --- | --- |
| **Statistika** | Foydalanuvchi, e'lon, buyurtma, suhbat, xabar, shikoyat sonlari |
| **Foydalanuvchilar** | Ro'lyozish, bloklash, Telegram holati, e'lon/buyurtma soni |
| **Shikoyatlar** | Shikoyat qilingan xabarlar (boshqa suhbatlar admin uchun yopiq) |
| **Audit log** | Admin qilgan barcha amal (kim, nima, qachon) |

Panel kodi: [`src/routes/admin.tsx`](../src/routes/admin.tsx) ·
RPC'lar: [`src/lib/admin.ts`](../src/lib/admin.ts) ·
SQL: [`supabase/migrations/20260101000500_admin_panel.sql`](../supabase/migrations/20260101000500_admin_panel.sql)

---

## 2. Birinchi admin'ni o'rnatish

Avtomatik ravishda **hech kim admin bo'lmaydi** — bu xavfsizlik uchun ataylab qilingan
("Security by default"). Birinchi admin qo'lda belgilanadi.

### 2.1. Usul 1 — Supabase SQL Editor (tavsiya etiladi)

1. Supabase Dashboard → **SQL Editor** → **New query**
2. Emailni almashtiring va bajarish:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where email = 'sizning@email.com'
on conflict (user_id) do update set role = 'admin';
```

3. Natija: `INSERT 0 1` (yoki `UPDATE 1`) — muvaffaqiyat.
4. Endi `/admin` sahifasini oching.

> SQL Editor'da `auth.users` jadvalini ko'rish uchun Supabase hisobingizda
> `authenticator` roli bo'lishi kerak — standart loyihada bor.

### 2.2. Usul 2 — panel orqali (agar admin allaqachon bo'lsa)

Admin boshqa foydalanuvchini admin qilishi mumkin:

**Admin panel → Foydalanuvchilar → "Admin qilish"**

Bu amal `admin_set_user_role` RPC'si orqali bajariladi va `audit_log` ga yoziladi.

### 2.3. Ro'lni olib tashlash

```sql
update public.user_roles set role = 'user'
where user_id = (select id from auth.users where email = 'kimdir@example.com');
```

> Panel orqali ham "Oddiy qilish" tugmasi bor. Birinchi admin'ni **panel orqali**
> oddiy foydalanuvchiga aylantirishga urinmang — `admin_set_user_role` funksiyasi
> o'z admin rolingizni olib qo'yishga yo'l qo'ymaydi ("O'z admin rolingizni olib
> qo'ya olmaysiz").

---

## 3. Rollar

| Rol | `user_roles.role` | Kim beradi | Huquqlar |
| --- | --- | --- | --- |
| `user` | `user` | `handle_new_user()` trigger'i (ro'yxatdan o'tganda avtomatik) | Faqat o'z ma'lumotlari |
| `admin` | `admin` | Qo'lda SQL yoki boshqa admin | Panel, audit log, moderatsiya |

Jadval cheklovi: `check (role in ('admin','user'))` — boshqa qiymat kiritib bo'lmaydi.

### 3.1. `has_role` va `is_admin`

```sql
-- SECURITY DEFINER: RLS chegarasidan tashqarida ishlaydi
create or replace function public.has_role(p_user_id uuid, p_role text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = p_user_id and r.role = p_role
  );
$$;

-- Klient uchun (o'z roligini tekshiradi)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin');
$$;
```

`has_role(uuid, text)` faqat `service_role` ga ochiq — foydalanuvchi boshqaning roli
haqidagi ma'lumotni so'rab ololmaydi. `is_admin()` esa `authenticated` ga ochiq —
foydalanuvchi **faqat o'zini** tekshirishi mumkin.

### 3.2. RLS

| Jadval | Siyosat |
| --- | --- |
| `user_roles` | `select` — o'z roli yoki admin; `insert/update/delete` — faqat admin RPC orqali |
| `audit_log` | `select` — faqat admin; `insert` — faqat admin RPC orqali (avtomatik) |
| `profiles` | `select` — o'zi + admin (`is_admin()`); `update` — o'z qatorlari |

---

## 4. Admin RPC'lar ro'yxati

Barchasi `SECURITY DEFINER`, ichida `if not public.is_admin() then raise exception 'Ruxsat yo''q.'` bor.

| RPC | Vazifa | Kim chaqiradi |
| --- | --- | --- |
| `admin_stats()` | Umumiy statistika (JSONB) | authenticated |
| `admin_list_users(p_limit int)` | Foydalanuvchilar ro'yxati | authenticated |
| `admin_list_reports(p_limit int)` | Shikoyat qilingan xabarlar | authenticated |
| `admin_list_audit(p_limit int)` | Audit log | authenticated |
| `admin_set_user_role(p_user_id uuid, p_role text)` | Rolni o'zgartirish | authenticated |
| `admin_set_user_blocked(p_user_id uuid, p_blocked boolean)` | Bloklash | authenticated |
| `admin_set_listing_state(p_listing_id uuid, p_is_approved bool, p_is_active bool)` | E'lonni tasdiqlash/nofaol qilish | authenticated |
| `admin_set_order_status(p_order_id uuid, p_status text)` | Buyurtma holati | authenticated |

`revoke ... from public, anon` + `grant ... to authenticated, service_role` — `anon`
(mehmon) chaqira olmaydi.

---

## 5. Audit log

Har bir admin amalining yozuvi:

| Ustun | Mazmuni |
| --- | --- |
| `id` | Ketma-ketlik raqami |
| `actor_id` | Amalni bajargan adminning UUID'si |
| `actor_email` | Adminning emaili (tezkor ko'rish uchun) |
| `action` | `set_role`, `block_user`, `unblock_user`, `listing_state`, `order_status` |
| `target_table` | O'zgartirilgan jadval |
| `target_id` | O'zgartirilgan qator ID'si |
| `details` | JSONB — eski/yangi qiymatlar |
| `created_at` | Vaqt |

Audit log'ni **o'chirish yoki tahrirlash mumkin emas** — faqat qo'shiladi.
Tekshiruv uchun SQL:

```sql
select * from public.audit_log order by created_at desc limit 50;
```

---

## 6. Xavfsizlik qoidalari

1. **Kamida bitta admin** bo'lishi kerak — panelga kirish imkoniyati yo'qolmashi uchun
   ikkinchi adminni oldindan tayinlab qo'ying.
2. **Admin roli faqat ishonchli xodimlarga** beriladi. Ro'li olib tashlash kerak
   bo'lsa — darhol qiling.
3. **Adminsiz akkauntlarni bloklash** mumkin, lekin o'zingizni bloklashga
   urinishga bo'lmaydi ("O'zingizni bloklash mumkin emas").
4. **Audit logni kuzating** — nomutanosib harakatlar ko'rinadi.
5. **Admin panel orqali foydalanuvchining maxfiy xabarlarini o'qish mumkin emas** —
   faqat shikoyat qilingan xabarlar ko'rinadi. Bu mijozlar maxfiyligini kafolatlaydi
   va qonuniy himoya uchun muhim.
6. **2FA** — Supabase Auth sozlamalarida admin akkauntlari uchun email/OTP tasdiqlashni
   yoqing.

---

## 7. Tezkor amallar

### Yangi admin qo'shish

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'yangi@admin.com'
on conflict (user_id) do update set role = 'admin';
```

### Foydalanuvchini bloklash

```sql
-- orqali panel: Foydalanuvchilar → Bloklash
update public.profiles set is_blocked = true where id = '<uuid>';
```

Bloklangan foydalanuvchi:
* e'lon va buyurtma yarata olmaydi (Edge Function `403` qaytaradi),
* chatda xabar yozolmaydi.

### E'lonni tasdiqlash

```sql
update public.listings set is_approved = true, is_active = true where id = '<uuid>';
```

### Audit logni tozalash

```sql
-- xavfli — faqat kerak bo'lsa
delete from public.audit_log where created_at < now() - interval '90 days';
```

---

## 8. Tekshirish ro'yxati

- [ ] `select * from public.user_roles;` — ro'li bor
- [ ] `/admin` → "Ruxsat yo'q" emas, panel ochildi
- [ ] "Statistika" bo'limi raqamlarni ko'rsatadi
- [ ] "Foydalanuvchilar" ro'yxatni ko'rsatadi
- [ ] Rolni o'zgartirish → audit log'da `set_role` paydo bo'ldi
- [ ] Bloklash → audit log'da `block_user` paydo bo'ldi
- [ ] Oddiy foydalanuvchi `/admin` ni ochsa → "Ruxsat yo'q"

---

## 9. Bog'liq hujjatlar

* [`docs/security.md`](./security.md) — xavfsizlik arxitekturasi, RLS matritsasi
* [`docs/cloudflare.md`](./cloudflare.md) — Cloudflare WAF va rate limiting
* [`docs/telegram-bot.md`](./telegram-bot.md) — Telegram bot va tasdiqlash
