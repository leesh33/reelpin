-- ─────────────────────────────────────────────────────────────
-- 릴스핀(Reelspin) v2.21 · 🛡️ 어드민(`/admin`) DB 함수
-- ─────────────────────────────────────────────────────────────
-- Supabase 대시보드 → SQL Editor 에 이 파일을 통째로 붙여 넣고 Run 하면 됩니다.
-- (다시 실행해도 안전합니다 — `create or replace`)
--
--  · 앱(`/admin`)은 로그인한 **관리자 본인의 토큰**으로 아래 함수만 호출합니다.
--  · 함수는 `auth.jwt() ->> 'email'` 로 관리자인지 **DB 안에서 다시** 확인합니다.
--    → 서버 코드가 뚫려도 남의 핀·회원 정보를 건드릴 수 없습니다.
--  · service_role 키는 어디에도 쓰지 않습니다.
--
-- ⚠️ 관리자 이메일을 바꾸려면 아래 `reelpin_is_admin()` 의 목록과
--    Vercel 환경변수 `ADMIN_EMAILS` 를 **함께** 고쳐 주세요.
-- ─────────────────────────────────────────────────────────────

-- 1. 관리자 판별 — 이 함수 하나만 이메일 목록을 갖습니다. ─────────────
create or replace function public.reelpin_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'andy.leesh33@gmail.com',
    'shhy@kakao.com'
  );
$$;

comment on function public.reelpin_is_admin() is 'v2.21 — 어드민 이메일 화이트리스트(DB 측 최종 확인)';

revoke all on function public.reelpin_is_admin() from public;
revoke all on function public.reelpin_is_admin() from anon;
grant execute on function public.reelpin_is_admin() to authenticated;

-- 2. 대시보드 요약 — 회원 수 · 최근 7일 신규 · 전체 핀 · 오늘 핀 · 인기 장소 TOP 10
create or replace function public.reelpin_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_total_users   int;
  v_new_users_7d  int;
  v_total_pins    int;
  v_pins_today    int;
  v_top_places    jsonb;
  v_categories    jsonb;
  v_today_start   timestamptz;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- '오늘'은 한국 시간(KST) 기준 자정부터입니다.
  v_today_start := (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';

  select count(*) into v_total_users from auth.users;
  select count(*) into v_new_users_7d from auth.users where created_at >= now() - interval '7 days';
  select count(*) into v_total_pins from public.pins;
  select count(*) into v_pins_today from public.pins where created_at >= v_today_start;

  -- 같은 상호 + 좌표(소수 3자리 ≈ 100m)면 같은 장소로 묶습니다.
  select coalesce(jsonb_agg(x.t order by x.saves desc, x.users desc, x.name asc), '[]'::jsonb)
    into v_top_places
  from (
    select
      jsonb_build_object(
        'name',     min(p.name),
        'category', min(p.category),
        'area',     min(p.area),
        'address',  min(p.address),
        'lat',      max(p.lat),
        'lng',      max(p.lng),
        'saves',    count(*),
        'users',    count(distinct p.user_id)
      ) as t,
      count(*) as saves,
      count(distinct p.user_id) as users,
      min(p.name) as name
    from public.pins p
    group by lower(btrim(p.name)), round(p.lat::numeric, 3), round(p.lng::numeric, 3)
    order by count(*) desc, count(distinct p.user_id) desc, min(p.name) asc
    limit 10
  ) x;

  select coalesce(jsonb_agg(c order by c.count desc, c.name asc), '[]'::jsonb)
    into v_categories
  from (
    select p.category as name, count(*) as count
    from public.pins p
    group by p.category
  ) c;

  return jsonb_build_object(
    'totalUsers',  v_total_users,
    'newUsers7d',  v_new_users_7d,
    'totalPins',   v_total_pins,
    'pinsToday',   v_pins_today,
    'topPlaces',   v_top_places,
    'categories',  v_categories,
    'generatedAt', now()
  );
end;
$$;

comment on function public.reelpin_admin_overview() is 'v2.21 — 어드민 대시보드 요약';

revoke all on function public.reelpin_admin_overview() from public;
revoke all on function public.reelpin_admin_overview() from anon;
grant execute on function public.reelpin_admin_overview() to authenticated;

-- 3. 회원 목록 — 닉네임 · 이메일 · 가입 경로 · 가입일 · 최근 로그인 · 보유 핀 · 플랜
create or replace function public.reelpin_admin_members(p_search text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_result jsonb;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(m.t order by m.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'userId',       u.id,
        'email',        coalesce(u.email, ''),
        'nickname',     coalesce(
                          nullif(u.raw_user_meta_data ->> 'full_name', ''),
                          nullif(u.raw_user_meta_data ->> 'name', ''),
                          nullif(u.raw_user_meta_data ->> 'nickname', ''),
                          nullif(u.raw_user_meta_data ->> 'user_name', ''),
                          nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
                          '이름 없음'
                        ),
        'provider',     coalesce(nullif(u.raw_app_meta_data ->> 'provider', ''), 'email'),
        'createdAt',    u.created_at,
        'lastSignInAt', u.last_sign_in_at,
        'pinCount',     coalesce(pin.cnt, 0),
        'plan',         coalesce(nullif(u.raw_user_meta_data ->> 'plan', ''), 'free')
      ) as t,
      u.created_at
    from auth.users u
    left join (
      select user_id, count(*)::int as cnt from public.pins group by user_id
    ) pin on pin.user_id = u.id
    where v_search is null
       or coalesce(u.email, '') ilike '%' || v_search || '%'
       or coalesce(u.raw_user_meta_data ->> 'full_name', '') ilike '%' || v_search || '%'
       or coalesce(u.raw_user_meta_data ->> 'name', '') ilike '%' || v_search || '%'
       or coalesce(u.raw_user_meta_data ->> 'nickname', '') ilike '%' || v_search || '%'
    order by u.created_at desc
    limit 500
  ) m;

  return v_result;
end;
$$;

comment on function public.reelpin_admin_members(text) is 'v2.21 — 어드민 회원 목록(이메일·이름 검색)';

revoke all on function public.reelpin_admin_members(text) from public;
revoke all on function public.reelpin_admin_members(text) from anon;
grant execute on function public.reelpin_admin_members(text) to authenticated;

-- 4. 회원 플랜 변경 (free ↔ pro) — user_metadata.plan 에 기록
create or replace function public.reelpin_admin_set_plan(p_user_id uuid, p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_plan text := lower(btrim(coalesce(p_plan, '')));
  v_email text;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_plan not in ('free', 'pro') then
    raise exception '플랜은 free 또는 pro 만 됩니다' using errcode = '22023';
  end if;

  update auth.users
     set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{plan}', to_jsonb(v_plan), true),
         updated_at = now()
   where id = p_user_id
  returning email into v_email;

  if not found then
    raise exception '회원을 찾지 못했어요' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'userId', p_user_id, 'email', coalesce(v_email, ''), 'plan', v_plan);
end;
$$;

comment on function public.reelpin_admin_set_plan(uuid, text) is 'v2.21 — 어드민 회원 플랜 변경';

revoke all on function public.reelpin_admin_set_plan(uuid, text) from public;
revoke all on function public.reelpin_admin_set_plan(uuid, text) from anon;
grant execute on function public.reelpin_admin_set_plan(uuid, text) to authenticated;

-- 5. 회원 삭제 — auth.users 삭제 → public.pins 는 cascade 로 함께 정리됩니다.
create or replace function public.reelpin_admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_pins  int;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception '내 계정은 지울 수 없어요' using errcode = '22023';
  end if;

  select count(*)::int into v_pins from public.pins where user_id = p_user_id;

  delete from auth.users where id = p_user_id returning email into v_email;
  if not found then
    raise exception '회원을 찾지 못했어요' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'userId', p_user_id, 'email', coalesce(v_email, ''), 'deletedPins', v_pins);
end;
$$;

comment on function public.reelpin_admin_delete_user(uuid) is 'v2.21 — 어드민 회원 삭제(핀 cascade)';

revoke all on function public.reelpin_admin_delete_user(uuid) from public;
revoke all on function public.reelpin_admin_delete_user(uuid) from anon;
grant execute on function public.reelpin_admin_delete_user(uuid) to authenticated;

-- 6. 장소(핀) 목록 — 검색 · 분류 필터
create or replace function public.reelpin_admin_pins(p_search text default null, p_category text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_search   text := nullif(btrim(coalesce(p_search, '')), '');
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_result   jsonb;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x.t order by x.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'pinId',     p.id,
        'userId',    p.user_id,
        'email',     coalesce(u.email, ''),
        'nickname',  coalesce(
                       nullif(u.raw_user_meta_data ->> 'full_name', ''),
                       nullif(u.raw_user_meta_data ->> 'name', ''),
                       nullif(u.raw_user_meta_data ->> 'nickname', ''),
                       nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
                       '이름 없음'
                     ),
        'name',      p.name,
        'category',  p.category,
        'area',      p.area,
        'address',   p.address,
        'lat',       p.lat,
        'lng',       p.lng,
        'visited',   p.visited,
        'memo',      p.memo,
        'sourceUrl', p.source_url,
        'createdAt', p.created_at
      ) as t,
      p.created_at
    from public.pins p
    left join auth.users u on u.id = p.user_id
    where (v_category is null or p.category = v_category)
      and (
        v_search is null
        or coalesce(p.name, '') ilike '%' || v_search || '%'
        or coalesce(p.address, '') ilike '%' || v_search || '%'
        or coalesce(p.area, '') ilike '%' || v_search || '%'
        or coalesce(u.email, '') ilike '%' || v_search || '%'
        or coalesce(u.raw_user_meta_data ->> 'full_name', '') ilike '%' || v_search || '%'
        or coalesce(u.raw_user_meta_data ->> 'name', '') ilike '%' || v_search || '%'
      )
    order by p.created_at desc
    limit 300
  ) x;

  return v_result;
end;
$$;

comment on function public.reelpin_admin_pins(text, text) is 'v2.21 — 어드민 장소(핀) 목록';

revoke all on function public.reelpin_admin_pins(text, text) from public;
revoke all on function public.reelpin_admin_pins(text, text) from anon;
grant execute on function public.reelpin_admin_pins(text, text) to authenticated;

-- 7. 핀 수정 (상호 · 분류)
create or replace function public.reelpin_admin_update_pin(
  p_user_id uuid,
  p_pin_id text,
  p_name text,
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_row      public.pins;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception '상호명을 입력해 주세요' using errcode = '22023';
  end if;

  update public.pins
     set name = v_name,
         category = coalesce(v_category, category),
         updated_at = now()
   where user_id = p_user_id
     and id = p_pin_id
  returning * into v_row;

  if not found then
    raise exception '핀을 찾지 못했어요' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'pinId', v_row.id,
    'userId', v_row.user_id,
    'name', v_row.name,
    'category', v_row.category
  );
end;
$$;

comment on function public.reelpin_admin_update_pin(uuid, text, text, text) is 'v2.21 — 어드민 핀 수정(상호·분류)';

revoke all on function public.reelpin_admin_update_pin(uuid, text, text, text) from public;
revoke all on function public.reelpin_admin_update_pin(uuid, text, text, text) from anon;
grant execute on function public.reelpin_admin_update_pin(uuid, text, text, text) to authenticated;

-- 8. 핀 삭제
create or replace function public.reelpin_admin_delete_pin(p_user_id uuid, p_pin_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
begin
  if not public.reelpin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.pins
   where user_id = p_user_id
     and id = p_pin_id
  returning name into v_name;

  if not found then
    raise exception '핀을 찾지 못했어요' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'userId', p_user_id, 'pinId', p_pin_id, 'name', coalesce(v_name, ''));
end;
$$;

comment on function public.reelpin_admin_delete_pin(uuid, text) is 'v2.21 — 어드민 핀 삭제';

revoke all on function public.reelpin_admin_delete_pin(uuid, text) from public;
revoke all on function public.reelpin_admin_delete_pin(uuid, text) from anon;
grant execute on function public.reelpin_admin_delete_pin(uuid, text) to authenticated;

-- 9. 확인용 (선택) ────────────────────────────────────────────
-- select proname from pg_proc where proname like 'reelpin_admin%';
-- select public.reelpin_is_admin();  -- SQL Editor 에서는 JWT 가 없어 false 가 정상입니다.
