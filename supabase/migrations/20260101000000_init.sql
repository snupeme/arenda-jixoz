-- Jihoz.uz — Supabase sxemasi
-- 1-migration: profillar, e'lonlar va Telegram bog'lanishlari

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- Profiles
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  name              text not null default '',
  phone             text not null default '',
  telegram_username text,
  telegram_id       bigint,
  telegram_verified boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint profiles_telegram_username_format
    check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{5,32}$')
);

-- Bitta Telegram ID faqat bitta akkauntga bog'lanishi mumkin
create unique index if not exists profiles_telegram_id_key
  on public.profiles (telegram_id)
  where telegram_id is not null;

-- Tasdiqlangan Telegram username ham global noyob
create unique index if not exists profiles_telegram_username_verified_key
  on public.profiles (telegram_username)
  where telegram_verified = true and telegram_username is not null;

-- ---------------------------------------------------------------- Listings
create table if not exists public.listings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  title             text not null,
  category          text not null,
  price_per_day     integer not null default 0 check (price_per_day >= 0),
  deposit           integer not null default 0 check (deposit >= 0),
  quantity          integer not null default 1 check (quantity > 0),
  city              text not null default 'Toshkent',
  delivery          boolean not null default false,
  show_phone        boolean not null default true,
  show_telegram     boolean not null default false,
  telegram_username text,
  image             text,
  description       text not null default '',
  rating            numeric(2, 1) not null default 0,
  reviews           integer not null default 0,
  created_at        timestamptz not null default now(),
  constraint listings_telegram_username_format
    check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{5,32}$')
);

create index if not exists listings_user_id_idx on public.listings (user_id);
create index if not exists listings_category_idx on public.listings (category);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.listings enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Foydalanuvchi faqat o'z profilini tahrirlay oladi
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

drop policy if exists "listings_select_all" on public.listings;
create policy "listings_select_all" on public.listings
  for select using (true);

drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own" on public.listings
  for insert with check (auth.uid() = user_id);

drop policy if exists "listings_update_own" on public.listings;
create policy "listings_update_own" on public.listings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "listings_delete_own" on public.listings;
create policy "listings_delete_own" on public.listings
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------- updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
