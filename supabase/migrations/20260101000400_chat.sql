-- Jihoz.uz — ichki chat tizimi
-- 5-migration: suhbatlar, xabarlar, bloklash, shikoyatlar
--
-- Xavfsizlik tamoyillari:
--   * Barcha jadvallarda RLS yoqilgan.
--   * Foydalanuvchi faqat o'zi qatnashgan suhbat/xabarlarni ko'radi.
--   * Xabar yozish faqat server funksiyalari orqali (validatsiya + rate limit).
--   * Xabarni tahrirlash/o'chirish taqiqlanadi (faqat read_at yangilanadi).
--   * Admin faqat shikoyat qilingan xabarlarni ko'radi (boshqa suhbatlar yopiq).

-- ─────────────────────────────────────────────────────────────
-- conversations
-- ─────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings (id) on delete cascade,
  renter_id      uuid not null references auth.users (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_renter_owner_unique unique (listing_id, renter_id),
  constraint conversations_not_self check (renter_id <> owner_id)
);

create index if not exists conversations_owner_id_idx on public.conversations (owner_id);
create index if not exists conversations_renter_id_idx on public.conversations (renter_id);
create index if not exists conversations_last_message_at_idx on public.conversations (last_message_at desc);

-- ─────────────────────────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references auth.users (id) on delete cascade,
  body            text not null,
  type            text not null default 'text' check (type in ('text', 'booking_request')),
  booking_payload jsonb,
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  constraint messages_body_length check (char_length(body) between 1 and 1000),
  constraint messages_booking_payload_type
    check ((type = 'booking_request') = (booking_payload is not null))
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);
create index if not exists messages_unread_idx
  on public.messages (conversation_id, sender_id) where read_at is null;

-- ─────────────────────────────────────────────────────────────
-- conversation_blocks
-- ─────────────────────────────────────────────────────────────
create table if not exists public.conversation_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint conversation_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists conversation_blocks_blocked_idx on public.conversation_blocks (blocked_id);

-- ─────────────────────────────────────────────────────────────
-- message_reports
-- ─────────────────────────────────────────────────────────────
create table if not exists public.message_reports (
  id          bigint generated always as identity primary key,
  message_id  uuid not null references public.messages (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      text not null check (reason in ('spam', 'fraud', 'abuse', 'other')),
  created_at  timestamptz not null default now(),
  constraint message_reports_unique unique (message_id, reporter_id)
);

create index if not exists message_reports_created_idx on public.message_reports (created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Yordamchi funksiyalar
-- ─────────────────────────────────────────────────────────────

-- Suhbatga kirish huquqi (faqat ishtirokchilar)
create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.renter_id = auth.uid() or c.owner_id = auth.uid())
  );
$$;

-- Ikki foydalanuvchi orasida bloklash bormi
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- Suhbatdosh ma'lumotlari (faqat o'z suhbatidoshining ismi ko'rinadi)
create or replace function public.chat_peer_info(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_conv public.conversations;
  v_peer uuid;
  v_name text;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then return null; end if;
  if auth.uid() is null then return null; end if;
  if v_conv.renter_id = auth.uid() then
    v_peer := v_conv.owner_id;
  elsif v_conv.owner_id = auth.uid() then
    v_peer := v_conv.renter_id;
  else
    return null; -- ishtirokchi emas
  end if;

  select coalesce(p.name, 'Jihoz.uz foydalanuvchisi') into v_name
  from public.profiles p where p.id = v_peer;

  return jsonb_build_object('id', v_peer, 'name', v_name);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Triggerlar: validatsiya, rate limit, tahrirlashni taqiqlash
-- ─────────────────────────────────────────────────────────────

-- Xabar yuborish qoidalari (server tomoni)
create or replace function public.validate_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations;
  v_peer uuid;
  v_count integer;
  v_limit record;
begin
  if auth.uid() is null then
    raise exception 'Kirish talab qilinadi.';
  end if;

  if new.sender_id <> auth.uid() then
    raise exception 'Xabar faqat o''z nomidan yuboriladi.';
  end if;

  if char_length(trim(coalesce(new.body, ''))) = 0 then
    raise exception 'Xabar bo''sh bo''lmaydi.';
  end if;

  if char_length(new.body) > 1000 then
    raise exception 'Xabar 1000 belgidan uzun bo''lmasligi kerak.';
  end if;

  select * into v_conv from public.conversations where id = new.conversation_id;
  if not found then
    raise exception 'Suhbat topilmadi.';
  end if;

  if v_conv.renter_id <> auth.uid() and v_conv.owner_id <> auth.uid() then
    raise exception 'Bu suhbatga kirish huquqingiz yo''q.';
  end if;

  v_peer := case when v_conv.renter_id = auth.uid() then v_conv.owner_id else v_conv.renter_id end;

  if public.is_blocked_between(auth.uid(), v_peer) then
    raise exception 'Bu foydalanuvchi bilan muloqot to''xtatilgan. Xabar yubora olmaysiz.';
  end if;

  -- Tezlik: daqiqasiga 20 ta xabardan ko'p yuborilmaydi
  select count(*) into v_count
  from public.messages
  where sender_id = auth.uid()
    and created_at > now() - interval '1 minute';

  if v_count >= 20 then
    raise exception 'Juda tez yozayapsiz. Daqiqasiga 20 ta xabardan ko''p yuborilmaydi.';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_validate on public.messages;
create trigger messages_validate
  before insert on public.messages
  for each row execute function public.validate_chat_message();

-- Xabarni tahrirlash/o'chirish taqiqlanadi (faqat read_at yangilanadi)
create or replace function public.prevent_message_edit()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body
     or new.sender_id is distinct from old.sender_id
     or new.conversation_id is distinct from old.conversation_id
     or new.type is distinct from old.type
     or new.booking_payload is distinct from old.booking_payload
     or new.created_at is distinct from old.created_at then
    raise exception 'Xabarni o''zgartirish yoki o''chirish mumkin emas.';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_prevent_edit on public.messages;
create trigger messages_prevent_edit
  before update on public.messages
  for each row execute function public.prevent_message_edit();

-- ─────────────────────────────────────────────────────────────
-- RPC funksiyalar (validatsiya + rate limit bilan)
-- ─────────────────────────────────────────────────────────────

-- Suhbat ochish (yoki mavjudini qaytarish)
create or replace function public.start_conversation(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_conv public.conversations;
  v_limit record;
begin
  if auth.uid() is null then
    raise exception 'Kirish talab qilinadi.';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'Jihoz topilmadi.';
  end if;

  if v_listing.user_id = auth.uid() then
    raise exception 'O''z e''loningizga xabar yozolmaysiz.';
  end if;

  if not (v_listing.is_active and v_listing.is_approved) then
    raise exception 'Bu jihoz hozir mavjud emas.';
  end if;

  -- Tezlik: soatiga 10 ta yangi suhbat
  select * into v_limit
  from public.check_rate_limit('chat_conversation', auth.uid()::text, 10, 3600);

  if not v_limit.allowed then
    raise exception 'Soatiga 10 tadan ortiq yangi suhbat ochishingiz mumkin.';
  end if;

  select * into v_conv
  from public.conversations
  where listing_id = p_listing_id and renter_id = auth.uid();

  if found then
    return jsonb_build_object('conversation_id', v_conv.id, 'created', false);
  end if;

  insert into public.conversations (listing_id, renter_id, owner_id)
  values (p_listing_id, auth.uid(), v_listing.user_id)
  returning * into v_conv;

  return jsonb_build_object('conversation_id', v_conv.id, 'created', true);
end;
$$;

-- Xabar yuborish
create or replace function public.send_chat_message(p_conversation_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages;
begin
  insert into public.messages (conversation_id, sender_id, body, type)
  values (p_conversation_id, auth.uid(), trim(p_body), 'text')
  returning * into v_message;

  update public.conversations
  set last_message_at = v_message.created_at
  where id = p_conversation_id;

  return jsonb_build_object(
    'id', v_message.id,
    'conversation_id', v_message.conversation_id,
    'sender_id', v_message.sender_id,
    'body', v_message.body,
    'type', v_message.type,
    'created_at', v_message.created_at
  );
end;
$$;

-- Band qilish so'rovi
create or replace function public.send_booking_request(
  p_conversation_id uuid,
  p_from date,
  p_to date,
  p_qty integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages;
  v_days integer;
  v_payload jsonb;
begin
  if p_from is null or p_to is null then
    raise exception 'Sanani tanlang.';
  end if;
  if p_to < p_from then
    raise exception 'Tugash sanasi boshlanish sanasidan oldin bo''lmaydi.';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then
    raise exception 'Miqdor 1 dan 1000 gacha bo''lishi kerak.';
  end if;

  v_days := (p_to - p_from) + 1;

  v_payload := jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'qty', p_qty,
    'days', v_days,
    'status', 'pending'
  );

  insert into public.messages (conversation_id, sender_id, body, type, booking_payload)
  values (
    p_conversation_id,
    auth.uid(),
    format('Band qilish so''rovi: %s — %s (%s kun, %s dona)',
           p_from, p_to, v_days, p_qty),
    'booking_request',
    v_payload
  )
  returning * into v_message;

  update public.conversations
  set last_message_at = v_message.created_at
  where id = p_conversation_id;

  return jsonb_build_object(
    'id', v_message.id,
    'conversation_id', v_message.conversation_id,
    'sender_id', v_message.sender_id,
    'body', v_message.body,
    'type', v_message.type,
    'booking_payload', v_message.booking_payload,
    'created_at', v_message.created_at
  );
end;
$$;

-- Band so'roviga javob (faqar ega)
create or replace function public.respond_booking_request(p_message_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages;
  v_conv public.conversations;
  v_listing public.listings;
  v_order public.orders;
  v_payload jsonb;
  v_total integer;
  v_deposit integer;
begin
  select * into v_message from public.messages where id = p_message_id;
  if not found then
    raise exception 'Xabar topilmadi.';
  end if;
  if v_message.type <> 'booking_request' then
    raise exception 'Bu band so''rovi emas.';
  end if;

  select * into v_conv from public.conversations where id = v_message.conversation_id;
  select * into v_listing from public.listings where id = v_conv.listing_id;

  if v_conv.owner_id <> auth.uid() then
    raise exception 'Faqat jihoz egasi band so''rovini tasdiqlaydi.';
  end if;

  v_payload := coalesce(v_message.booking_payload, '{}'::jsonb);

  if v_payload ->> 'status' = 'accepted' or v_payload ->> 'status' = 'rejected' then
    raise exception 'Bu so''rov allaqachon javoblangan.';
  end if;

  if not p_accept then
    update public.messages
    set booking_payload = v_payload || jsonb_build_object('status', 'rejected')
    where id = p_message_id;

    return jsonb_build_object('status', 'rejected');
  end if;

  v_total := v_listing.price_per_day * coalesce((v_payload ->> 'qty')::integer, 1)
             * coalesce((v_payload ->> 'days')::integer, 1);
  v_deposit := v_listing.deposit;

  insert into public.orders (
    listing_id, user_id, from_date, to_date, days, qty,
    name, phone, total, deposit, status
  )
  values (
    v_conv.listing_id, v_conv.renter_id,
    (v_payload ->> 'from')::date, (v_payload ->> 'to')::date,
    coalesce((v_payload ->> 'days')::integer, 1),
    coalesce((v_payload ->> 'qty')::integer, 1),
    'Mijoz (suhbat orqali)', '', v_total, v_deposit, 'pending'
  )
  returning * into v_order;

  update public.messages
  set booking_payload = v_payload || jsonb_build_object(
    'status', 'accepted',
    'order_id', v_order.id
  )
  where id = p_message_id;

  return jsonb_build_object('status', 'accepted', 'order_id', v_order.id, 'total', v_total);
end;
$$;

-- O'qilgan deb belgilash (faqat qabul qiluvchi)
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> auth.uid()
    and read_at is null;
end;
$$;

-- Barcha suhbatlar (ro'yxat uchun — bitta so'rov)
create or replace function public.chat_conversations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_rows jsonb;
begin
  if v_me is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'listing_id', c.listing_id,
    'renter_id', c.renter_id,
    'owner_id', c.owner_id,
    'created_at', c.created_at,
    'last_message_at', c.last_message_at,
    'peer_id', case when c.renter_id = v_me then c.owner_id else c.renter_id end,
    'peer_name', coalesce((
      select p.name from public.profiles p
      where p.id = case when c.renter_id = v_me then c.owner_id else c.renter_id end
    ), 'Jihoz.uz foydalanuvchisi'),
    'listing_title', l.title,
    'listing_image', l.image,
    'listing_price', l.price_per_day,
    'last_message', (
      select m.body from public.messages m
      where m.conversation_id = c.id order by m.created_at desc limit 1
    ),
    'last_message_type', (
      select m.type from public.messages m
      where m.conversation_id = c.id order by m.created_at desc limit 1
    ),
    'unread', (
      select count(*) from public.messages m
      where m.conversation_id = c.id and m.sender_id <> v_me and m.read_at is null
    ),
    'blocked', exists (
      select 1 from public.conversation_blocks b
      where (b.blocker_id = v_me and b.blocked_id = (case when c.renter_id = v_me then c.owner_id else c.renter_id end))
         or (b.blocked_id = v_me and b.blocker_id = (case when c.renter_id = v_me then c.owner_id else c.renter_id end))
    )
  )), '[]'::jsonb)
  into v_rows
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  where c.renter_id = v_me or c.owner_id = v_me;

  return v_rows;
end;
$$;

-- Xabarlar (sahifalash: har safar 30 ta)
create or replace function public.chat_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_rows jsonb;
  v_count integer;
begin
  if auth.uid() is null then return jsonb_build_object('messages', '[]'::jsonb, 'has_more', false); end if;
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Bu suhbatga kirish huquqingiz yo''q.';
  end if;

  select count(*) into v_count
  from public.messages
  where conversation_id = p_conversation_id
    and (p_before is null or created_at < p_before);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'conversation_id', m.conversation_id,
    'sender_id', m.sender_id,
    'body', m.body,
    'type', m.type,
    'booking_payload', m.booking_payload,
    'created_at', m.created_at,
    'read_at', m.read_at
  ) order by m.created_at asc), '[]'::jsonb)
  into v_rows
  from (
    select * from public.messages
    where conversation_id = p_conversation_id
      and (p_before is null or created_at < p_before)
    order by created_at desc
    limit v_limit
  ) m;

  return jsonb_build_object(
    'messages', v_rows,
    'has_more', v_count > v_limit,
    'oldest_at', (
      select min(created_at) from public.messages where conversation_id = p_conversation_id
    )
  );
end;
$$;

revoke all on function public.chat_conversations() from public, anon;
grant execute on function public.chat_conversations() to authenticated, service_role;
revoke all on function public.chat_messages(uuid, timestamptz, integer) from public, anon;
grant execute on function public.chat_messages(uuid, timestamptz, integer) to authenticated, service_role;

-- Bloklash / blokdan chiqarish
create or replace function public.block_conversation_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_blocked_id = auth.uid() then
    raise exception 'O''zingizni bloklash mumkin emas.';
  end if;
  insert into public.conversation_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

create or replace function public.unblock_conversation_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.conversation_blocks
  where blocker_id = auth.uid() and blocked_id = p_blocked_id;
end;
$$;

-- Xabar bo'yicha shikoyat
create or replace function public.report_chat_message(p_message_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages;
begin
  if p_reason not in ('spam', 'fraud', 'abuse', 'other') then
    raise exception 'Sababni to''g''ri tanlang.';
  end if;

  select * into v_message from public.messages where id = p_message_id;
  if not found then
    raise exception 'Xabar topilmadi.';
  end if;

  if not public.can_access_conversation(v_message.conversation_id) then
    raise exception 'Bu xabarni ko''rish huquqingiz yo''q.';
  end if;

  insert into public.message_reports (message_id, reporter_id, reason)
  values (p_message_id, auth.uid(), p_reason)
  on conflict (message_id, reporter_id) do nothing;
end;
$$;

revoke all on function public.can_access_conversation(uuid) from public, anon;
grant execute on function public.can_access_conversation(uuid) to authenticated, service_role;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, service_role;
revoke all on function public.chat_peer_info(uuid) from public, anon;
grant execute on function public.chat_peer_info(uuid) to authenticated, service_role;
revoke all on function public.start_conversation(uuid) from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated, service_role;
revoke all on function public.send_chat_message(uuid, text) from public, anon;
grant execute on function public.send_chat_message(uuid, text) to authenticated, service_role;
revoke all on function public.send_booking_request(uuid, date, date, integer) from public, anon;
grant execute on function public.send_booking_request(uuid, date, date, integer) to authenticated, service_role;
revoke all on function public.respond_booking_request(uuid, boolean) from public, anon;
grant execute on function public.respond_booking_request(uuid, boolean) to authenticated, service_role;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated, service_role;
revoke all on function public.block_conversation_user(uuid) from public, anon;
grant execute on function public.block_conversation_user(uuid) to authenticated, service_role;
revoke all on function public.unblock_conversation_user(uuid) from public, anon;
grant execute on function public.unblock_conversation_user(uuid) to authenticated, service_role;
revoke all on function public.report_chat_message(uuid, text) from public, anon;
grant execute on function public.report_chat_message(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_blocks enable row level security;
alter table public.message_reports enable row level security;

-- conversations: faqat ishtirokchilar
drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant" on public.conversations
  for select using (renter_id = auth.uid() or owner_id = auth.uid());

drop policy if exists "conversations_insert_renter" on public.conversations;
create policy "conversations_insert_renter" on public.conversations
  for insert with check (renter_id = auth.uid());

drop policy if exists "conversations_update_participant" on public.conversations;
create policy "conversations_update_participant" on public.conversations
  for update using (renter_id = auth.uid() or owner_id = auth.uid())
  with check (renter_id = auth.uid() or owner_id = auth.uid());

-- messages: faqat suhbat ishtiroklari
drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages
  for select using (public.can_access_conversation(conversation_id));

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.can_access_conversation(conversation_id)
  );

-- read_at ni faqat qabul qiluvchi yangilaydi
drop policy if exists "messages_update_recipient" on public.messages;
create policy "messages_update_recipient" on public.messages
  for update using (
    sender_id <> auth.uid()
    and public.can_access_conversation(conversation_id)
  ) with check (
    sender_id <> auth.uid()
    and public.can_access_conversation(conversation_id)
  );

-- o'chirishga ruxsat yo'q (delete policy yo'q)

-- conversation_blocks
drop policy if exists "conversation_blocks_select_own" on public.conversation_blocks;
create policy "conversation_blocks_select_own" on public.conversation_blocks
  for select using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "conversation_blocks_insert_own" on public.conversation_blocks;
create policy "conversation_blocks_insert_own" on public.conversation_blocks
  for insert with check (blocker_id = auth.uid());

drop policy if exists "conversation_blocks_delete_own" on public.conversation_blocks;
create policy "conversation_blocks_delete_own" on public.conversation_blocks
  for delete using (blocker_id = auth.uid());

-- message_reports: shikoyat qiluvchi o'zini, admin — hammasini (shikoyat qilinganlar)
drop policy if exists "message_reports_select_own" on public.message_reports;
create policy "message_reports_select_own" on public.message_reports
  for select using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "message_reports_insert_own" on public.message_reports;
create policy "message_reports_insert_own" on public.message_reports
  for insert with check (reporter_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Realtime (real vaqtda xabarlar)
-- ─────────────────────────────────────────────────────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
end $$;
