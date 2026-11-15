-- ─────────────────────────────────────────────────────────────
-- 릴스핀(Reelspin) v2.1 · Supabase 스키마
-- ─────────────────────────────────────────────────────────────
-- Supabase 대시보드 → SQL Editor 에 이 파일을 통째로 붙여 넣고 Run 하면 됩니다.
--   · public.pins         저장한 핀 (사용자별)
--   · RLS                 본인 핀만 읽고/쓰고/지울 수 있게 (auth.uid() = user_id)
--   · 트리거              updated_at 자동 갱신
--
-- ⚠️ service_role 키는 앱에 넣지 않습니다. 앱은 anon key + RLS 로만 동작합니다.
--    (테이블에 RLS 를 끄면 anon key 를 가진 누구나 남의 핀을 읽을 수 있으니 주의)
-- ─────────────────────────────────────────────────────────────

-- 1. 테이블 ──────────────────────────────────────────────────
create table if not exists public.pins (
  id             text        not null,
  user_id        uuid        not null references auth.users (id) on delete cascade,
  name           text        not null,
  category       text        not null default '맛집',
  area           text        not null default '',
  lat            double precision,
  lng            double precision,
  note           text        not null default '',
  source_url     text        not null default '',
  platform       text        not null default 'instagram',
  place_url      text        not null default '',
  naver_place_id text,
  phone          text        not null default '',
  address        text        not null default '',
  providers      jsonb       not null default '[]'::jsonb,
  menu_tags      jsonb       not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- 한 사용자 안에서 핀 id 는 유일합니다. (여러 기기에서 같은 핀을 올려도 한 줄로 합쳐짐)
  constraint pins_pkey primary key (user_id, id)
);

comment on table  public.pins is '릴스핀 — 릴스·쇼츠에서 저장한 맛집/장소 핀 (사용자별)';
comment on column public.pins.id is '앱이 만든 핀 id (pin-…, 기기에서도 같은 값 유지)';
comment on column public.pins.user_id is 'auth.users.id — RLS 기준';
comment on column public.pins.providers is '어느 지도에서 확인된 장소인지 ["kakao","naver"]';
comment on column public.pins.menu_tags is '대표 메뉴 태그 ["소금빵"]';

-- 목록 조회(최근 저장 순)와 개수 세기에 쓰는 인덱스
create index if not exists pins_user_created_idx on public.pins (user_id, created_at desc);
create index if not exists pins_user_updated_idx on public.pins (user_id, updated_at desc);

-- 2. updated_at 자동 갱신 ────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pins_touch_updated_at on public.pins;
create trigger pins_touch_updated_at
  before update on public.pins
  for each row execute function public.touch_updated_at();

-- 3. RLS — 본인 핀만 ─────────────────────────────────────────
alter table public.pins enable row level security;
-- 혹시 예전에 정책이 남아 있으면 지우고 새로 만듭니다. (다시 실행해도 안전)
drop policy if exists pins_select_own on public.pins;
drop policy if exists pins_insert_own on public.pins;
drop policy if exists pins_update_own on public.pins;
drop policy if exists pins_delete_own on public.pins;

create policy pins_select_own on public.pins
  for select using (auth.uid() = user_id);

create policy pins_insert_own on public.pins
  for insert with check (auth.uid() = user_id);

create policy pins_update_own on public.pins
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy pins_delete_own on public.pins
  for delete using (auth.uid() = user_id);

-- 4. 권한 — 로그인한 사용자(authenticated)만 접근 ─────────────
revoke all on public.pins from anon;
grant select, insert, update, delete on public.pins to authenticated;

-- 5. 확인용 (선택) ──────────────────────────────────────────
-- select tablename, rowsecurity from pg_tables where tablename = 'pins';
-- select policyname, cmd from pg_policies where tablename = 'pins';
