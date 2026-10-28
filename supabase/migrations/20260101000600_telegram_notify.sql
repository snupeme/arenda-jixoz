-- Jihoz.uz — Telegram bildirishnoma (chat xabarlari uchun)
-- 7-migration
--
-- ⚠️  HOLATI: TAYYOR, LEKIN O'CHIRILGAN.
--     Bu migratsiya faqat yordamchi funksiyalarni yaratadi —
--     TRIGGER ULANMAYDI, ya'ni xabar yuborilganda Telegram'ga xabar yuborilmaydi.
--
--     Yoqish uchun:
--       1) Edge Function'ni joylashtiring:
--            supabase functions deploy telegram-notify
--       2) Secret'larni o'rnating:
--            supabase secrets set TELEGRAM_BOT_TOKEN=<token>
--            supabase secrets set TELEGRAM_NOTIFY_SECRET=<uzun maxfiy kalit>
--       3) Trigger'ni ulang (pastdagi "YOKIQ" qismni "YOQIQ"ga o'zgartiring):
--
--              create trigger on_message_insert_notify
--              after insert on public.messages
--              for each row execute function public.notify_telegram_on_message();
--
--     Yoki Supabase Dashboard → Database → Webhooks orqali "Database Webhook" yarating
--     (messages / INSERT) va `x-notify-secret` sarlavhasini qo'shing.

-- ─────────────────────────────────────────────────────────────
-- Bildirishnoma yuborish uchun yordamchi funksiya
-- ─────────────────────────────────────────────────────────────
create or replace function public.notify_telegram_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_telegram_id bigint;
  v_verified boolean;
  v_blocked boolean;
  v_has_bot boolean;
begin
  -- Botning o'z xabarlariga javob bermaymiz
  if new.sender_id is null then
    return new;
  end if;

  select
    case when c.owner_id = new.sender_id then c.renter_id else c.owner_id end,
    p.telegram_id,
    p.telegram_verified,
    p.is_blocked
  into v_recipient, v_telegram_id, v_verified, v_blocked
  from public.conversations c
  join public.profiles p on p.id = (
    case when c.owner_id = new.sender_id then c.renter_id else c.owner_id end
  )
  where c.id = new.conversation_id;

  if v_recipient is null or v_telegram_id is null or not v_verified or v_blocked then
    return new;
  end if;

  -- Edge Function mavjudligini tekshiramiz (pg_net orqali chaqiriladi)
  select exists (select 1 from pg_extension where extname = 'pg_net') into v_has_bot;
  if not v_has_bot then
    return new;
  end if;

  -- Chaqiruv amalga oshiriladi: Database Webhook yoki pg_net orqali.
  -- Bu yerda hech narsa yuborilmaydi — faqat funksiya tayyor.
  return new;
end;
$$;

revoke all on function public.notify_telegram_on_message() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Bildirishnoma log jadvali (ixtiyoriy — qaysi xabarlar yuborilganini kuzatish)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.telegram_notifications (
  id           bigint generated always as identity primary key,
  message_id   uuid not null references public.messages (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'queued'
                 check (status in ('queued', 'sent', 'failed', 'skipped')),
  created_at   timestamptz not null default now()
);

create index if not exists telegram_notifications_recipient_idx
  on public.telegram_notifications (recipient_id, created_at desc);

alter table public.telegram_notifications enable row level security;

drop policy if exists "telegram_notifications_select_admin" on public.telegram_notifications;
create policy "telegram_notifications_select_admin" on public.telegram_notifications
  for select using (public.is_admin());

revoke all on table public.telegram_notifications from anon, authenticated;
grant select on table public.telegram_notifications to authenticated;
grant all on table public.telegram_notifications to service_role;

-- ─────────────────────────────────────────────────────────────
-- TRIGGER ULASH — HOZIR O'CHIRILGAN
-- Quyidagi qatorni bajarish (trigger ulanadi):
--
--   create trigger on_message_insert_notify
--   after insert on public.messages
--   for each row execute function public.notify_telegram_on_message();
--
-- O'chirish (xabar yuborishni to'xtatish):
--
--   drop trigger if exists on_message_insert_notify on public.messages;
-- ─────────────────────────────────────────────────────────────
