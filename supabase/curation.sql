-- ─────────────────────────────────────────────────────────────
-- 릴스핀(Reelspin) v2.31 · 🗂️ 컬렉션 기획전 · 공유 · 📌 배너 DB 함수
-- ─────────────────────────────────────────────────────────────
-- Supabase 대시보드 → SQL Editor 에 이 파일을 통째로 붙여 넣고 Run 하면 됩니다.
-- (다시 실행해도 안전합니다 — `create table if not exists` · `create or replace`)
--
--  · 앱(컬렉션 탭)은 **anon 키 + 아래 공개 함수**만 호출합니다.
--      reelpin_public_banners()            … 켜 둔 배너 목록
--      reelpin_public_curated(id?)         … 켜 둔 기획전(추천 컬렉션)
--      reelpin_share_collection(...)       … 내 컬렉션을 링크로 공유(스냅샷 저장)
--      reelpin_shared_collection(id)       … 공유 링크로 들어온 컬렉션 하나 읽기
--  · 어드민(/admin)은 **관리자 본인 토큰**으로 `reelpin_admin_*` 함수만 호출하고,
--    그 함수들이 `auth.jwt() ->> 'email'` 로 관리자인지 **DB 안에서 다시** 확인합니다.
--  · 세 테이블은 RLS 를 켜고 **정책을 만들지 않습니다** → anon·authenticated 가 표를 직접
--    읽거나 쓸 수 없고, 위 함수(security definer)로만 접근합니다.
--    (공유 링크 목록을 통째로 긁어 갈 수 없게 하려는 것입니다)
--  · service_role 키는 어디에도 쓰지 않습니다.
-- ─────────────────────────────────────────────────────────────

-- 0. 공통 — 장소 배열 다듬기 (이름 없는 항목은 버리고, 길이·좌표를 안전하게) ────
create or replace function public.reelpin_normalize_places(p_places jsonb, p_max int default 100)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(x.place order by x.ord), '[]'::jsonb)
  from (
    select
      e.ord,
      jsonb_build_object(
        'name',     left(btrim(coalesce(e.item ->> 'name', '')), 80),
        'category', left(btrim(coalesce(e.item ->> 'category', '')), 20),
        'area',     left(btrim(coalesce(e.item ->> 'area', '')), 40),
        'address',  left(btrim(coalesce(e.item ->> 'address', '')), 160),
        'lat',      case
                      when btrim(coalesce(e.item ->> 'lat', '')) ~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
                      then (e.item ->> 'lat')::numeric
                      else null
                    end,
        'lng',      case
                      when btrim(coalesce(e.item ->> 'lng', '')) ~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
                      then (e.item ->> 'lng')::numeric
                      else null
                    end
      ) as place
    from jsonb_array_elements(
           case when jsonb_typeof(p_places) = 'array' then p_places else '[]'::jsonb end
         ) with ordinality as e(item, ord)
    where btrim(coalesce(e.item ->> 'name', '')) <> ''
      and e.ord <= greatest(1, least(coalesce(p_max, 100), 200))
  ) x;
$$;

comment on function public.reelpin_normalize_places(jsonb, int) is 'v2.31 — 장소 배열 정리(이름 필수·길이·좌표 검증)';

-- 1. 테이블 ────────────────────────────────────────────────────
-- 1-1. 📌 상단 배너 (운영자·스폰서)
create table if not exists public.reelpin_banners (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  subtitle    text not null default '',
  badge       text not null default '기획전',
  link_url    text not null default '',
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint reelpin_banners_title_len  check (char_length(btrim(title)) between 1 and 40),
  constraint reelpin_banners_sub_len    check (char_length(subtitle) <= 80),
  constraint reelpin_banners_badge_len  check (char_length(badge) <= 10),
  constraint reelpin_banners_link_len   check (char_length(link_url) <= 300),
  constraint reelpin_banners_link_http  check (link_url = '' or link_url ~* '^https?://')
);

create index if not exists reelpin_banners_active_idx
  on public.reelpin_banners (active, sort_order, created_at desc);

-- 1-2. 🗂️ 기획전(운영자 추천 컬렉션)
create table if not exists public.reelpin_curated_collections (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  sponsor      text not null default '',
  badge        text not null default '기획전',
  emoji        text not null default '📂',
  color        text not null default '#0D9488',
  places       jsonb not null default '[]'::jsonb,
  sort_order   int  not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reelpin_curated_title_len   check (char_length(btrim(title)) between 1 and 40),
  constraint reelpin_curated_desc_len    check (char_length(description) <= 100),
  constraint reelpin_curated_sponsor_len check (char_length(sponsor) <= 20),
  constraint reelpin_curated_badge_len   check (char_length(badge) <= 10),
  constraint reelpin_curated_emoji_len   check (char_length(emoji) <= 8),
  constraint reelpin_curated_color_hex   check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint reelpin_curated_places_arr  check (jsonb_typeof(places) = 'array' and jsonb_array_length(places) <= 50)
);

create index if not exists reelpin_curated_active_idx
  on public.reelpin_curated_collections (active, sort_order, created_at desc);

-- 1-3. 🔗 공유된 내 컬렉션 (링크 스냅샷)
create table if not exists public.reelpin_shared_collections (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  emoji        text not null default '📂',
  color        text not null default '#0D9488',
  places       jsonb not null default '[]'::jsonb,
  owner_id     uuid references auth.users (id) on delete set null,
  view_count   int  not null default 0,
  created_at   timestamptz not null default now(),
  constraint reelpin_shared_title_len   check (char_length(btrim(title)) between 1 and 40),
  constraint reelpin_shared_desc_len    check (char_length(description) <= 100),
  constraint reelpin_shared_emoji_len   check (char_length(emoji) <= 8),
  constraint reelpin_shared_color_hex   check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint reelpin_shared_places_arr  check (jsonb_typeof(places) = 'array' and jsonb_array_length(places) between 1 and 100)
);

create index if not exists reelpin_shared_created_idx
  on public.reelpin_shared_collections (created_at desc);

-- 2. RLS — 정책 없이 켜기만 합니다(직접 접근 차단, 함수로만 접근) ──────────
alter table public.reelpin_banners             enable row level security;
alter table public.reelpin_curated_collections enable row level security;
alter table public.reelpin_shared_collections  enable row level security;

revoke all on table public.reelpin_banners             from anon, authenticated;
revoke all on table public.reelpin_curated_collections from anon, authenticated;
revoke all on table public.reelpin_shared_collections  from anon, authenticated;

-- 3. 공개(앱) 함수 ───────────────────────────────────────────────
-- 3-1. 켜 둔 배너 목록
create or replace function public.reelpin_public_banners()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',        b.id,
               'title',     b.title,
               'subtitle',  b.subtitle,
               'badge',     b.badge,
               'linkUrl',   b.link_url,
               'sortOrder', b.sort_order,
               'createdAt', b.created_at
             )
             order by b.sort_order asc, b.created_at desc
           ),
           '[]'::jsonb
         )
  from public.reelpin_banners b
  where b.active = true;
$$;

comment on function public.reelpin_public_banners() is 'v2.31 — 앱: 켜 둔 배너 목록';

revoke all on function public.reelpin_public_banners() from public;
grant execute on function public.reelpin_public_banners() to anon, authenticated;

-- 3-2. 켜 둔 기획전 (id 를 주면 그 하나)
create or replace function public.reelpin_public_curated(p_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',          c.id,
               'title',       c.title,
               'description', c.description,
               'sponsor',     c.sponsor,
               'badge',       c.badge,
               'emoji',       c.emoji,
               'color',       c.color,
               'places',      c.places,
               'placeCount',  jsonb_array_length(c.places),
               'sortOrder',   c.sort_order,
               'createdAt',   c.created_at
             )
             order by c.sort_order asc, c.created_at desc
           ),
           '[]'::jsonb
         )
  from public.reelpin_curated_collections c
  where c.active = true
    and (p_id is null or c.id = p_id);
$$;

comment on function public.reelpin_public_curated(uuid) is 'v2.31 — 앱: 켜 둔 기획전 목록(또는 하나)';

revoke all on function public.reelpin_public_curated(uuid) from public;
grant execute on function public.reelpin_public_curated(uuid) to anon, authenticated;

-- 3-3. 내 컬렉션 공유 — 스냅샷 저장 후 shareId 반환
create or replace function public.reelpin_share_collection(
  p_title text,
  p_description text default '',
  p_emoji text default '📂',
  p_color text default '#0D9488',
  p_places jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_title  text  := left(btrim(coalesce(p_title, '')), 40);
  v_places jsonb := public.reelpin_normalize_places(p_places, 100);
  v_id     uuid;
begin
  if v_title = '' then
    raise exception 'collection title required' using errcode = '22023';
  end if;
  if jsonb_array_length(v_places) = 0 then
    raise exception 'collection places required' using errcode = '22023';
  end if;

  insert into public.reelpin_shared_collections (title, description, emoji, color, places, owner_id)
  values (
    v_title,
    left(btrim(coalesce(p_description, '')), 100),
    left(coalesce(nullif(btrim(coalesce(p_emoji, '')), ''), '📂'), 8),
    case when coalesce(p_color, '') ~ '^#[0-9a-fA-F]{6}$' then p_color else '#0D9488' end,
    v_places,
    auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'shareId', v_id, 'placeCount', jsonb_array_length(v_places));
end;
$$;

comment on function public.reelpin_share_collection(text, text, text, text, jsonb) is 'v2.31 — 앱: 내 컬렉션 공유 링크 만들기';

revoke all on function public.reelpin_share_collection(text, text, text, text, jsonb) from public;
grant execute on function public.reelpin_share_collection(text, text, text, text, jsonb) to anon, authenticated;

-- 3-4. 공유 링크로 들어온 컬렉션 하나 읽기 (조회 수 +1)
create or replace function public.reelpin_shared_collection(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.reelpin_shared_collections;
begin
  if p_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad-request');
  end if;

  select * into v_row from public.reelpin_shared_collections where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not-found');
  end if;

  update public.reelpin_shared_collections
     set view_count = view_count + 1
   where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'item', jsonb_build_object(
      'shareId',     v_row.id,
      'title',       v_row.title,
      'description', v_row.description,
      'emoji',       v_row.emoji,
      'color',       v_row.color,
      'places',      v_row.places,
      'placeCount',  jsonb_array_length(v_row.places),
      'viewCount',   v_row.view_count + 1,
      'createdAt',   v_row.created_at
    )
  );
end;
$$;

comment on function public.reelpin_shared_collection(uuid) is 'v2.31 — 앱: 공유 링크로 받은 컬렉션 하나';

revoke all on function public.reelpin_shared_collection(uuid) from public;
grant execute on function public.reelpin_shared_collection(uuid) to anon, authenticated;

-- 4. 어드민(/admin) 함수 — `auth.jwt()` 로 관리자 재확인 ────────────────
-- 4-1. 📌 배너 전체 목록 (꺼 둔 것 포함)
create or replace function public.reelpin_admin_banners()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',        b.id,
               'title',     b.title,
               'subtitle',  b.subtitle,
               'badge',     b.badge,
               'linkUrl',   b.link_url,
               'sortOrder', b.sort_order,
               'active',    b.active,
               'createdAt', b.created_at,
               'updatedAt', b.updated_at
             )
             order by b.sort_order asc, b.created_at desc
           ),
           '[]'::jsonb
         )
    into v_result
  from public.reelpin_banners b;

  return v_result;
end;
$$;

comment on function public.reelpin_admin_banners() is 'v2.31 — 어드민: 배너 목록(꺼 둔 것 포함)';

revoke all on function public.reelpin_admin_banners() from public;
revoke all on function public.reelpin_admin_banners() from anon;
grant execute on function public.reelpin_admin_banners() to authenticated;

-- 4-2. 📌 배너 저장 (id 없으면 새로, 있으면 수정)
create or replace function public.reelpin_admin_save_banner(
  p_id uuid,
  p_title text,
  p_subtitle text default '',
  p_badge text default '기획전',
  p_link_url text default '',
  p_active boolean default true,
  p_sort_order int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_title text := left(btrim(coalesce(p_title, '')), 40);
  v_link  text := left(btrim(coalesce(p_link_url, '')), 300);
  v_row   public.reelpin_banners;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_title = '' then
    raise exception 'banner title required' using errcode = '22023';
  end if;
  if v_link <> '' and v_link !~* '^https?://' then
    raise exception 'banner link must start with http' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.reelpin_banners (title, subtitle, badge, link_url, active, sort_order)
    values (
      v_title,
      left(btrim(coalesce(p_subtitle, '')), 80),
      left(coalesce(nullif(btrim(coalesce(p_badge, '')), ''), '기획전'), 10),
      v_link,
      coalesce(p_active, true),
      coalesce(p_sort_order, 0)
    )
    returning * into v_row;
  else
    update public.reelpin_banners
       set title      = v_title,
           subtitle   = left(btrim(coalesce(p_subtitle, '')), 80),
           badge      = left(coalesce(nullif(btrim(coalesce(p_badge, '')), ''), '기획전'), 10),
           link_url   = v_link,
           active     = coalesce(p_active, true),
           sort_order = coalesce(p_sort_order, 0),
           updated_at = now()
     where id = p_id
    returning * into v_row;

    if not found then
      raise exception 'banner not found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'banner', jsonb_build_object(
      'id', v_row.id, 'title', v_row.title, 'subtitle', v_row.subtitle, 'badge', v_row.badge,
      'linkUrl', v_row.link_url, 'sortOrder', v_row.sort_order, 'active', v_row.active
    )
  );
end;
$$;

comment on function public.reelpin_admin_save_banner(uuid, text, text, text, text, boolean, int) is 'v2.31 — 어드민: 배너 저장(새로/수정)';

revoke all on function public.reelpin_admin_save_banner(uuid, text, text, text, text, boolean, int) from public;
revoke all on function public.reelpin_admin_save_banner(uuid, text, text, text, text, boolean, int) from anon;
grant execute on function public.reelpin_admin_save_banner(uuid, text, text, text, text, boolean, int) to authenticated;

-- 4-3. 📌 배너 삭제
create or replace function public.reelpin_admin_delete_banner(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_title text;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.reelpin_banners where id = p_id returning title into v_title;
  if not found then
    raise exception 'banner not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'title', coalesce(v_title, ''));
end;
$$;

comment on function public.reelpin_admin_delete_banner(uuid) is 'v2.31 — 어드민: 배너 삭제';

revoke all on function public.reelpin_admin_delete_banner(uuid) from public;
revoke all on function public.reelpin_admin_delete_banner(uuid) from anon;
grant execute on function public.reelpin_admin_delete_banner(uuid) to authenticated;

-- 4-4. 🗂️ 기획전 전체 목록 (꺼 둔 것 포함)
create or replace function public.reelpin_admin_curated()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',          c.id,
               'title',       c.title,
               'description', c.description,
               'sponsor',     c.sponsor,
               'badge',       c.badge,
               'emoji',       c.emoji,
               'color',       c.color,
               'places',      c.places,
               'placeCount',  jsonb_array_length(c.places),
               'sortOrder',   c.sort_order,
               'active',      c.active,
               'createdAt',   c.created_at,
               'updatedAt',   c.updated_at
             )
             order by c.sort_order asc, c.created_at desc
           ),
           '[]'::jsonb
         )
    into v_result
  from public.reelpin_curated_collections c;

  return v_result;
end;
$$;

comment on function public.reelpin_admin_curated() is 'v2.31 — 어드민: 기획전 목록(꺼 둔 것 포함)';

revoke all on function public.reelpin_admin_curated() from public;
revoke all on function public.reelpin_admin_curated() from anon;
grant execute on function public.reelpin_admin_curated() to authenticated;

-- 4-5. 🗂️ 기획전 저장 (id 없으면 새로, 있으면 수정)
create or replace function public.reelpin_admin_save_curated(
  p_id uuid,
  p_title text,
  p_description text default '',
  p_sponsor text default '',
  p_badge text default '기획전',
  p_emoji text default '📂',
  p_color text default '#0D9488',
  p_places jsonb default '[]'::jsonb,
  p_active boolean default true,
  p_sort_order int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_title  text  := left(btrim(coalesce(p_title, '')), 40);
  v_places jsonb := public.reelpin_normalize_places(p_places, 50);
  v_row    public.reelpin_curated_collections;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_title = '' then
    raise exception 'curated title required' using errcode = '22023';
  end if;
  if jsonb_array_length(v_places) = 0 then
    raise exception 'curated places required' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.reelpin_curated_collections
      (title, description, sponsor, badge, emoji, color, places, active, sort_order)
    values (
      v_title,
      left(btrim(coalesce(p_description, '')), 100),
      left(btrim(coalesce(p_sponsor, '')), 20),
      left(coalesce(nullif(btrim(coalesce(p_badge, '')), ''), '기획전'), 10),
      left(coalesce(nullif(btrim(coalesce(p_emoji, '')), ''), '📂'), 8),
      case when coalesce(p_color, '') ~ '^#[0-9a-fA-F]{6}$' then p_color else '#0D9488' end,
      v_places,
      coalesce(p_active, true),
      coalesce(p_sort_order, 0)
    )
    returning * into v_row;
  else
    update public.reelpin_curated_collections
       set title       = v_title,
           description = left(btrim(coalesce(p_description, '')), 100),
           sponsor     = left(btrim(coalesce(p_sponsor, '')), 20),
           badge       = left(coalesce(nullif(btrim(coalesce(p_badge, '')), ''), '기획전'), 10),
           emoji       = left(coalesce(nullif(btrim(coalesce(p_emoji, '')), ''), '📂'), 8),
           color       = case when coalesce(p_color, '') ~ '^#[0-9a-fA-F]{6}$' then p_color else '#0D9488' end,
           places      = v_places,
           active      = coalesce(p_active, true),
           sort_order  = coalesce(p_sort_order, 0),
           updated_at  = now()
     where id = p_id
    returning * into v_row;

    if not found then
      raise exception 'curated not found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'curated', jsonb_build_object(
      'id', v_row.id, 'title', v_row.title, 'description', v_row.description, 'sponsor', v_row.sponsor,
      'badge', v_row.badge, 'emoji', v_row.emoji, 'color', v_row.color, 'places', v_row.places,
      'placeCount', jsonb_array_length(v_row.places), 'sortOrder', v_row.sort_order, 'active', v_row.active
    )
  );
end;
$$;

comment on function public.reelpin_admin_save_curated(uuid, text, text, text, text, text, text, jsonb, boolean, int) is 'v2.31 — 어드민: 기획전 저장(새로/수정)';

revoke all on function public.reelpin_admin_save_curated(uuid, text, text, text, text, text, text, jsonb, boolean, int) from public;
revoke all on function public.reelpin_admin_save_curated(uuid, text, text, text, text, text, text, jsonb, boolean, int) from anon;
grant execute on function public.reelpin_admin_save_curated(uuid, text, text, text, text, text, text, jsonb, boolean, int) to authenticated;

-- 4-6. 🗂️ 기획전 삭제
create or replace function public.reelpin_admin_delete_curated(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_title text;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.reelpin_curated_collections where id = p_id returning title into v_title;
  if not found then
    raise exception 'curated not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'title', coalesce(v_title, ''));
end;
$$;

comment on function public.reelpin_admin_delete_curated(uuid) is 'v2.31 — 어드민: 기획전 삭제';

revoke all on function public.reelpin_admin_delete_curated(uuid) from public;
revoke all on function public.reelpin_admin_delete_curated(uuid) from anon;
grant execute on function public.reelpin_admin_delete_curated(uuid) to authenticated;

-- 5. 확인용 (선택) ────────────────────────────────────────────
-- select public.reelpin_public_banners();            -- 켜 둔 배너
-- select public.reelpin_public_curated();            -- 켜 둔 기획전
-- select proname from pg_proc where proname like 'reelpin_%curated%' or proname like 'reelpin_%banner%';
