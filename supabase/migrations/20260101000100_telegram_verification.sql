-- Jihoz.uz — Telegram bot orqali akkaunt tasdiqlash
-- 2-migration: bir martalik tokenlar jadvali, rate limit va profil triggeri

-- ---------------------------------------------------------------- Tokens
create table if not exists public.telegram_verification_tokens (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  token             text not null unique,
  telegram_id       bigint,
  telegram_username text,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  used_at           timestamptz,
  constraint telegram_tokens_min_length check (char_length(token) >= 32)
);

-- Rate limit uchun: foydalanuvchi bo'yicha so'rovlar tarixi
create index if not exists telegram_tokens_user_created_idx
  on public.telegram_verification_tokens (user_id, created_at desc);

-- Muddati o'tgan tokenlarni tozalash
create or replace function public.cleanup_telegram_tokens()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.telegram_verification_tokens
  where expires_at < now() - interval '1 day';
$$;

alter table public.telegram_verification_tokens enable row level security;

-- Foydalanuvchi faqat o'z tokenlarini ko'radi (yozish faqat service role)
drop policy if exists "telegram_tokens_select_own" on public.telegram_verification_tokens;
create policy "telegram_tokens_select_own" on public.telegram_verification_tokens
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------- Profile trigger
-- Ro'yxatdan o'tganda profil qatori avtomatik yaratiladi
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
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- Helper: token yaratish
-- Bir martalik token yaratadi (bitta qatorga yozib, muddatini belgilaydi).
-- Token uzunligi kamida 32 belgi.
create or replace function public.create_telegram_token(
  p_user_id uuid,
  p_ttl_minutes integer default 10
)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_expires timestamptz;
begin
  -- Soatiga 5 tadan ko'p so'rovga ruxsat berilmaydi
  if (
    select count(*)
    from public.telegram_verification_tokens t
    where t.user_id = p_user_id
      and t.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limit_exceeded'
      using hint = 'Soatiga 5 marta so''rash mumkin';
  end if;

  -- Kripto kuchli tasodifiy token (kamida 32 belgi, deep-link limitiga mos)
  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires := now() + make_interval(mins => greatest(coalesce(p_ttl_minutes, 10), 1));

  insert into public.telegram_verification_tokens (user_id, token, expires_at)
  values (p_user_id, v_token, v_expires)
  returning token, expires_at into v_token, v_expires;

  return query select v_token, v_expires;
end;
$$;

-- ---------------------------------------------------------------- Helper: tokenni iste'mol qilish
-- Token faqat bir marta ishlaydi: muddati o'tmagan va ishlatilmagan token
-- atomik ravishda o'chiriladi va foydalanuvchi id qaytariladi.
create or replace function public.consume_telegram_token(p_token text)
returns table (
  user_id uuid,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.telegram_verification_tokens;
begin
  select * into v_row
  from public.telegram_verification_tokens t
  where t.token = p_token
  for update;

  if not found then
    return query select null::uuid, 'not_found'::text, null::timestamptz;
    return;
  end if;

  if v_row.used_at is not null then
    return query select v_row.user_id, 'used'::text, v_row.expires_at;
    return;
  end if;

  if v_row.expires_at <= now() then
    delete from public.telegram_verification_tokens t where t.id = v_row.id;
    return query select v_row.user_id, 'expired'::text, v_row.expires_at;
    return;
  end if;

  -- Bir martalik: ishlatilgan deb belgilanadi (takroriy so'rov 'used' qaytaradi).
  -- Qatorni o'chirish webhook muvaffaqiyatli bo'lgandan keyin amalga oshiriladi.
  update public.telegram_verification_tokens t
  set used_at = now()
  where t.id = v_row.id;
  return query select v_row.user_id, 'ok'::text, v_row.expires_at;
end;
$$;

-- Bu funksiyalar faqat server (service_role) tomonidan chaqiriladi
revoke all on function public.create_telegram_token(uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_telegram_token(text) from public, anon, authenticated;
grant execute on function public.create_telegram_token(uuid, integer) to service_role;
grant execute on function public.consume_telegram_token(text) to service_role;
