-- Jihoz.uz — admin panel va xavfsizlik to'ldirmalari
-- 6-migration
--
-- * handle_new_user() endi user_roles qatorini ham yaratadi
-- * Admin RPC'lar (rol o'zgartirish, statistika, audit log, shikoyatlar)
-- * telegram_update_ids — webhook replay himoyasi
-- * check_rate_limit — Edge Function'lar uchun ochiq (service_role + authenticated)

-- ─────────────────────────────────────────────────────────────
-- 1) Yangi foydalanuvchi uchun avtomatik "user" roli
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    ''
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Eski akkauntlar uchun rollarni to'ldirish
insert into public.user_roles (user_id, role)
select p.id, 'user'
from public.profiles p
on conflict (user_id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 2) Telegram webhook replay himoyasi
--    Telegram har bir update_id ni faqat bir marta yuboradi.
--    Biz esa "update_id allaqachon ko'rilgan" deb belgilab, qayta
--    ishlovni rad qilamiz.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.telegram_update_ids (
  update_id   bigint primary key,
  processed_at timestamptz not null default now()
);

create index if not exists telegram_update_ids_processed_idx
  on public.telegram_update_ids (processed_at desc);

alter table public.telegram_update_ids enable row level security;

-- Faqat service_role (Edge Function) yozadi — hech kim o'qiy olmaydi
drop policy if exists "telegram_update_ids_select_admin" on public.telegram_update_ids;
create policy "telegram_update_ids_select_admin" on public.telegram_update_ids
  for select using (public.is_admin());

revoke all on table public.telegram_update_ids from anon, authenticated;

-- Update'ni ro'yxatga olish: true = yangi (birinchi marta), false = allaqachon ko'rilgan
create or replace function public.claim_telegram_update(p_update_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if p_update_id is null then return false; end if;

  insert into public.telegram_update_ids (update_id)
  values (p_update_id)
  on conflict (update_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

revoke all on function public.claim_telegram_update(bigint) from public, anon, authenticated;
grant execute on function public.claim_telegram_update(bigint) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 3) Admin RPC'lar
-- ─────────────────────────────────────────────────────────────

-- Rol o'zgartirish (faqat admin)
create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old text;
  v_actor_email text;
begin
  if not public.is_admin() then
    raise exception 'Ruxsat yo''q.';
  end if;

  if p_role not in ('admin', 'user') then
    raise exception 'Noma''lum rol.';
  end if;

  if p_user_id = v_actor and p_role <> 'admin' then
    raise exception 'O''z admin rolingizni olib qo''ya olmaysiz.';
  end if;

  select role into v_old from public.user_roles where user_id = p_user_id;
  if v_old is null then
    insert into public.user_roles (user_id, role) values (p_user_id, p_role);
  else
    update public.user_roles set role = p_role where user_id = p_user_id;
  end if;

  select email into v_actor_email from auth.users where id = v_actor;

  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, details)
  values (
    v_actor, v_actor_email, 'set_role', 'user_roles', p_user_id::text,
    jsonb_build_object('old_role', v_old, 'new_role', p_role)
  );

  return jsonb_build_object('user_id', p_user_id, 'role', p_role);
end;
$$;

-- Akkauntni bloklash / blokdan chiqarish
create or replace function public.admin_set_user_blocked(p_user_id uuid, p_blocked boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
begin
  if not public.is_admin() then
    raise exception 'Ruxsat yo''q.';
  end if;

  if p_user_id = v_actor then
    raise exception 'O''zingizni bloklash mumkin emas.';
  end if;

  update public.profiles set is_blocked = p_blocked where id = p_user_id;
  if not found then
    raise exception 'Foydalanuvchi topilmadi.';
  end if;

  select email into v_actor_email from auth.users where id = v_actor;

  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, details)
  values (
    v_actor, v_actor_email,
    case when p_blocked then 'block_user' else 'unblock_user' end,
    'profiles', p_user_id::text,
    jsonb_build_object('blocked', p_blocked)
  );

  return jsonb_build_object('user_id', p_user_id, 'is_blocked', p_blocked);
end;
$$;

-- Umumiy statistika
create or replace function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'admins', (select count(*) from public.user_roles where role = 'admin'),
    'listings', (select count(*) from public.listings),
    'pending_listings', (select count(*) from public.listings where not is_approved),
    'orders', (select count(*) from public.orders),
    'pending_orders', (select count(*) from public.orders where status = 'pending'),
    'conversations', (select count(*) from public.conversations),
    'messages', (select count(*) from public.messages),
    'reports', (select count(*) from public.message_reports),
    'blocked_users', (select count(*) from public.profiles where is_blocked)
  );
$$;

-- Foydalanuvchilar ro'yxati (faqat admin)
create or replace function public.admin_list_users(p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'phone', p.phone,
    'telegram_username', p.telegram_username,
    'telegram_verified', p.telegram_verified,
    'is_blocked', p.is_blocked,
    'role', coalesce((select r.role from public.user_roles r where r.user_id = p.id), 'user'),
    'listings_count', (select count(*) from public.listings l where l.user_id = p.id),
    'orders_count', (select count(*) from public.orders o where o.user_id = p.id),
    'created_at', p.created_at
  ) order by p.created_at desc), '[]'::jsonb)
  from (select * from public.profiles limit coalesce(p_limit, 100)) p;
$$;

-- Shikoyat qilingan xabarlar (faqat admin, boshqa suhbatlar yopiq)
create or replace function public.admin_list_reports(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'report_id', r.id,
    'reason', r.reason,
    'created_at', r.created_at,
    'message_id', m.id,
    'message_body', m.body,
    'message_type', m.type,
    'message_created_at', m.created_at,
    'sender_id', m.sender_id,
    'conversation_id', m.conversation_id,
    'reporter_id', r.reporter_id
  ) order by r.created_at desc), '[]'::jsonb)
  from (
    select * from public.message_reports
    order by created_at desc
    limit coalesce(p_limit, 50)
  ) r
  join public.messages m on m.id = r.message_id;
$$;

-- Audit log (faqat admin)
create or replace function public.admin_list_audit(p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'action', a.action,
    'actor_email', a.actor_email,
    'target_table', a.target_table,
    'target_id', a.target_id,
    'details', a.details,
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  from (
    select * from public.audit_log
    order by created_at desc
    limit coalesce(p_limit, 100)
  ) a;
$$;

-- E'lonlarni tasdiqlash / faolligini o'zgartirish
create or replace function public.admin_set_listing_state(
  p_listing_id uuid,
  p_is_approved boolean,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
begin
  if not public.is_admin() then
    raise exception 'Ruxsat yo''q.';
  end if;

  update public.listings
  set is_approved = coalesce(p_is_approved, is_approved),
      is_active = coalesce(p_is_active, is_active)
  where id = p_listing_id;

  if not found then
    raise exception 'E''lon topilmadi.';
  end if;

  select email into v_actor_email from auth.users where id = v_actor;

  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, details)
  values (
    v_actor, v_actor_email, 'listing_state', 'listings', p_listing_id::text,
    jsonb_build_object('is_approved', p_is_approved, 'is_active', p_is_active)
  );

  return jsonb_build_object('listing_id', p_listing_id, 'is_approved', p_is_approved, 'is_active', p_is_active);
end;
$$;

-- Buyurtma holatini o'zgartirish
create or replace function public.admin_set_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
begin
  if not public.is_admin() then
    raise exception 'Ruxsat yo''q.';
  end if;

  if p_status not in ('pending', 'confirmed', 'completed', 'cancelled') then
    raise exception 'Noma''lum holat.';
  end if;

  update public.orders set status = p_status where id = p_order_id;
  if not found then
    raise exception 'Buyurtma topilmadi.';
  end if;

  select email into v_actor_email from auth.users where id = v_actor;

  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, details)
  values (
    v_actor, v_actor_email, 'order_status', 'orders', p_order_id::text,
    jsonb_build_object('status', p_status)
  );

  return jsonb_build_object('order_id', p_order_id, 'status', p_status);
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated, service_role;
revoke all on function public.admin_set_user_blocked(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_blocked(uuid, boolean) to authenticated, service_role;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated, service_role;
revoke all on function public.admin_list_users(integer) from public, anon;
grant execute on function public.admin_list_users(integer) to authenticated, service_role;
revoke all on function public.admin_list_reports(integer) from public, anon;
grant execute on function public.admin_list_reports(integer) to authenticated, service_role;
revoke all on function public.admin_list_audit(integer) from public, anon;
grant execute on function public.admin_list_audit(integer) to authenticated, service_role;
revoke all on function public.admin_set_listing_state(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_listing_state(uuid, boolean, boolean) to authenticated, service_role;
revoke all on function public.admin_set_order_status(uuid, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 4) check_rate_limit
--    Faqat service_role chaqira oladi (Edge Function'lar shu orqali
--    limit qo'yadi). authenticated'ga ochilmaydi — aks holda foydalanuvchi
--    boshqa foydalanuvchining kvotasini "burn" qila olardi.
-- ─────────────────────────────────────────────────────────────
revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;
