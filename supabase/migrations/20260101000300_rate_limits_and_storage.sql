-- Jihoz.uz — API rate limiting va rasm saqlash
-- 4-migration

-- ─────────────────────────────────────────────────────────────
-- Rate limit hisobi (Edge Function'lar orqali chaqiriladi)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.api_rate_limits (
  id                bigint generated always as identity primary key,
  bucket            text not null,
  subject           text not null,
  hits              integer not null default 0,
  window_started_at timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint api_rate_limits_bucket_subject_key unique (bucket, subject)
);

create index if not exists api_rate_limits_updated_idx on public.api_rate_limits (updated_at);

-- limit tekshiruvi: true/false + qancha qoldi + Retry-After (soniya)
create or replace function public.check_rate_limit(
  p_bucket text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.api_rate_limits;
  v_now timestamptz := now();
  v_reset timestamptz;
begin
  insert into public.api_rate_limits (bucket, subject, hits, window_started_at, updated_at)
  values (p_bucket, p_subject, 1, v_now, v_now)
  on conflict (bucket, subject) do nothing;

  select * into v_row
  from public.api_rate_limits
  where bucket = p_bucket and subject = p_subject
  for update;

  v_reset := v_row.window_started_at + make_interval(secs => p_window_seconds);

  -- Oyna tugagan — qayta boshlaymiz
  if v_now >= v_reset then
    update public.api_rate_limits
    set hits = 1, window_started_at = v_now, updated_at = v_now
    where id = v_row.id;
    return query select true, greatest(p_limit - 1, 0), 0;
    return;
  end if;

  -- Limit oshgan
  if v_row.hits >= p_limit then
    update public.api_rate_limits set updated_at = v_now where id = v_row.id;
    return query select
      false,
      0,
      greatest(1, ceil(extract(epoch from (v_reset - v_now)))::integer);
    return;
  end if;

  update public.api_rate_limits
  set hits = v_row.hits + 1, updated_at = v_now
  where id = v_row.id;

  return query select true, greatest(p_limit - v_row.hits - 1, 0), 0;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Rasm ombori (rasm yuklash chegaralari)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "listing_images_insert_authenticated" on storage.objects;
create policy "listing_images_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing_images_select_public" on storage.objects;
create policy "listing_images_select_public" on storage.objects
  for select using (bucket_id = 'listing-images');

drop policy if exists "listing_images_delete_own" on storage.objects;
create policy "listing_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
