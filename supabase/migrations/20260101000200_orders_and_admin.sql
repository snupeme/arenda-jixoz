-- Jihoz.uz — buyurtmalar, rollar, admin panel va audit log
-- 3-migration

-- ─────────────────────────────────────────────────────────────
-- Profiles: bloklash holati
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_blocked boolean not null default false;

-- ─────────────────────────────────────────────────────────────
-- Orders
-- ─────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  from_date     date not null,
  to_date       date not null,
  days          integer not null check (days > 0),
  qty           integer not null default 1 check (qty > 0),
  delivery      boolean not null default false,
  name          text not null,
  phone         text not null,
  total         integer not null default 0 check (total >= 0),
  deposit       integer not null default 0 check (deposit >= 0),
  commission    integer not null default 0 check (commission >= 0),
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at    timestamptz not null default now(),
  constraint orders_date_order check (to_date >= from_date)
);

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_listing_id_idx on public.orders (listing_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

-- ─────────────────────────────────────────────────────────────
-- Roles (alohida jadval — profiles ichida emas!)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- has_role — SECURITY DEFINER (RLS qoidalarida ishlatiladi)
-- ─────────────────────────────────────────────────────────────
create or replace function public.has_role(p_user_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = p_user_id
      and r.role = p_role
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- is_admin — klient uchun (o'z roliga qarab, parametrsiz)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin');
$$;

-- has_role(uuid, text) faqat service_role chaqirishi mumkin
revoke all on function public.has_role(uuid, text) from public, anon, authenticated;
grant execute on function public.has_role(uuid, text) to service_role;
-- is_admin() authenticated uchun ochiq
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- Listings: moderatsiya maydonlari
-- ─────────────────────────────────────────────────────────────
alter table public.listings
  add column if not exists is_active boolean not null default true,
  add column if not exists is_approved boolean not null default true;

create index if not exists listings_is_active_idx on public.listings (is_active);

-- ─────────────────────────────────────────────────────────────
-- Platform sozlamalari (komissiya, moderatsiya flaglari)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value)
values
  ('commission_rate', '{"percent": 10}'::jsonb),
  ('require_listing_approval', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.platform_settings where key = p_key;
$$;

create or replace function public.commission_rate()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value ->> 'percent')::integer from public.platform_settings where key = 'commission_rate'), 10);
$$;

create or replace function public.require_listing_approval()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value ->> 'enabled')::boolean from public.platform_settings where key = 'require_listing_approval'), false);
$$;

revoke all on function public.get_setting(text) from public, anon;
grant execute on function public.get_setting(text) to anon, authenticated, service_role;
revoke all on function public.commission_rate() from public, anon;
grant execute on function public.commission_rate() to authenticated, service_role;
revoke all on function public.require_listing_approval() from public, anon;
grant execute on function public.require_listing_approval() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- Audit log
-- ─────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references auth.users (id) on delete set null,
  actor_email  text,
  action       text not null,
  target_table text,
  target_id    text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);

-- ─────────────────────────────────────────────────────────────
-- Audit trigger — admin amallari avtomatik yoziladi
-- ─────────────────────────────────────────────────────────────
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text;
  v_action text;
begin
  select email into v_actor_email
  from auth.users
  where id = auth.uid();

  v_action := lower(tg_op);
  if tg_op = 'UPDATE' then
    v_action := 'update';
  end if;

  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, details)
  values (
    auth.uid(),
    v_actor_email,
    v_action,
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    jsonb_build_object(
      'before', case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
      'after',  case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
    )
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists listings_audit on public.listings;
create trigger listings_audit
  after insert or update or delete on public.listings
  for each row execute function public.audit_row_change();

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.audit_row_change();

drop trigger if exists orders_audit on public.orders;
create trigger orders_audit
  after update on public.orders
  for each row execute function public.audit_row_change();

-- ─────────────────────────────────────────────────────────────
-- Triggerlar: komissiya hisobi va moderatsiya
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_order_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.commission := round(new.total * public.commission_rate() / 100.0);
  return new;
end;
$$;

drop trigger if exists orders_set_commission on public.orders;
create trigger orders_set_commission
  before insert or update of total on public.orders
  for each row execute function public.set_order_commission();

create or replace function public.set_listing_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.require_listing_approval() then
    new.is_approved := false;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_set_approval on public.listings;
create trigger listings_set_approval
  before insert on public.listings
  for each row execute function public.set_listing_approval();

-- ─────────────────────────────────────────────────────────────
-- RLS — barcha jadvallarda
-- ─────────────────────────────────────────────────────────────
alter table public.orders enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_log enable row level security;
alter table public.platform_settings enable row level security;

-- user_roles: faqat admin o'qaydi, yozish faqat service_role
drop policy if exists "user_roles_select_admin" on public.user_roles;
create policy "user_roles_select_admin" on public.user_roles
  for select using (public.is_admin());

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own" on public.user_roles
  for select using (auth.uid() = user_id);

-- orders: buyurtmachi, e'lon egasi yoki admin
drop policy if exists "orders_select_related" on public.orders;
create policy "orders_select_related" on public.orders
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.listings l where l.id = orders.listing_id and l.user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert with check (auth.uid() = user_id);

-- Buyurtmachi faqat "kutilmoqda" buyurtmani bekor qila oladi
drop policy if exists "orders_update_own_pending" on public.orders;
create policy "orders_update_own_pending" on public.orders
  for update using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'cancelled');

drop policy if exists "orders_update_admin" on public.orders;
create policy "orders_update_admin" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "orders_delete_admin" on public.orders;
create policy "orders_delete_admin" on public.orders
  for delete using (public.is_admin());

-- audit_log: faqat admin o'qaydi
drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin" on public.audit_log
  for select using (public.is_admin());

-- platform_settings: o'qish ochiq, yozish faqat admin
drop policy if exists "settings_select_all" on public.platform_settings;
create policy "settings_select_all" on public.platform_settings
  for select using (true);

drop policy if exists "settings_update_admin" on public.platform_settings;
create policy "settings_update_admin" on public.platform_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- listings: ko'rsatish, moderatsiya va o'chirish faqat admin
drop policy if exists "listings_select_public" on public.listings;
create policy "listings_select_public" on public.listings
  for select using (
    is_active = true and is_approved = true
    or auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "listings_update_admin" on public.listings;
create policy "listings_update_admin" on public.listings
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "listings_delete_admin" on public.listings;
create policy "listings_delete_admin" on public.listings
  for delete using (public.is_admin());

-- profiles: admin barcha profilni ko'ra oladi (bloklash uchun)
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());
