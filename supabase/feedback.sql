-- ─────────────────────────────────────────────────────────────
-- 릴스핀(Reelspin) v2.23 · 💬 제안 · 버그 제보 게시판 DB
-- ─────────────────────────────────────────────────────────────
-- Supabase 대시보드 → SQL Editor 에 이 파일을 통째로 붙여 넣고 Run 하면 됩니다.
-- (다시 실행해도 안전합니다 — `create ... if not exists` · `create or replace` · `drop ... if exists`)
--
--  · public.reelpin_feedback
--      앱 「내 정보 → 💬 제안 · 버그 제보」 게시판의 글 한 줄.
--      기능 제안(idea) · 버그 제보(bug) 두 갈래, 상태는 접수됨(open) · 반영됨(applied) · 수정됨(fixed).
--  · RLS
--      읽기  : 누구나 (비로그인 포함)
--      쓰기  : 누구나 — 단 likes=0 · status='open' · 길이 제한은 **DB 가 강제**합니다.
--      수정/삭제 : 일반 사용자 정책 없음 → 글은 지울 수 없고, 공감은 RPC 로만 +1.
--  · 어드민 RPC (supabase/admin.sql 과 같은 방식)
--      로그인한 **관리자 본인의 토큰**으로만 호출되고, 함수가 `auth.jwt() ->> 'email'` 로
--      관리자인지 **DB 안에서 다시** 확인합니다. service_role 키는 어디에도 쓰지 않습니다.
-- ─────────────────────────────────────────────────────────────

-- 1. 테이블 ──────────────────────────────────────────────────
create table if not exists public.reelpin_feedback (
  id          uuid        primary key default gen_random_uuid(),
  kind        text        not null default 'idea',
  title       text        not null default '',
  content     text        not null default '',
  author      text        not null default '익명',
  user_email  text,
  app_version text,
  likes       integer     not null default 0,
  status      text        not null default 'open',
  created_at  timestamptz not null default now()
);

comment on table  public.reelpin_feedback is 'v2.23 — 릴스핀 제안·버그 제보 게시판 글';
comment on column public.reelpin_feedback.kind is 'idea = 기능 제안, bug = 버그 제보';
comment on column public.reelpin_feedback.title is '제목 2~80자';
comment on column public.reelpin_feedback.content is '본문 5~1200자';
comment on column public.reelpin_feedback.author is '작성자 닉네임 (비우면 익명, 1~12자)';
comment on column public.reelpin_feedback.user_email is '로그인한 사용자의 이메일 (선택 · 본인 이메일만 기록 가능)';
comment on column public.reelpin_feedback.app_version is '제보 시점의 앱 버전 (예: 2.23.0)';
comment on column public.reelpin_feedback.likes is '👍 공감 수 (RPC 로만 +1)';
comment on column public.reelpin_feedback.status is 'open(접수됨) · applied(반영됨) · fixed(수정됨)';

-- 값 검증 — 앱 버그가 아니라 DB 가 마지막으로 막아 줍니다.
alter table public.reelpin_feedback drop constraint if exists reelpin_feedback_kind_chk;
alter table public.reelpin_feedback add  constraint reelpin_feedback_kind_chk
  check (kind in ('idea', 'bug'));

alter table public.reelpin_feedback drop constraint if exists reelpin_feedback_status_chk;
alter table public.reelpin_feedback add  constraint reelpin_feedback_status_chk
  check (status in ('open', 'applied', 'fixed'));

alter table public.reelpin_feedback drop constraint if exists reelpin_feedback_likes_chk;
alter table public.reelpin_feedback add  constraint reelpin_feedback_likes_chk
  check (likes >= 0);

alter table public.reelpin_feedback drop constraint if exists reelpin_feedback_title_chk;
alter table public.reelpin_feedback add  constraint reelpin_feedback_title_chk
  check (char_length(btrim(title)) between 2 and 80);

alter table public.reelpin_feedback drop constraint if exists reelpin_feedback_content_chk;
alter table public.reelpin_feedback add  constraint reelpin_feedback_content_chk
  check (char_length(btrim(content)) between 5 and 1200);

alter table public.reelpin_feedback drop constraint if exists reelpin_feedback_author_chk;
alter table public.reelpin_feedback add  constraint reelpin_feedback_author_chk
  check (char_length(btrim(author)) between 1 and 12);

alter table public.reelpin_feedback drop constraint if exists reelpin_feedback_email_chk;
alter table public.reelpin_feedback add  constraint reelpin_feedback_email_chk
  check (user_email is null or char_length(user_email) <= 254);

alter table public.reelpin_feedback drop constraint if exists reelpin_feedback_version_chk;
alter table public.reelpin_feedback add  constraint reelpin_feedback_version_chk
  check (app_version is null or char_length(app_version) <= 24);

-- 목록 조회용 인덱스 — 최신순 / 공감순 / 상태 필터
create index if not exists reelpin_feedback_kind_created_idx
  on public.reelpin_feedback (kind, created_at desc);
create index if not exists reelpin_feedback_kind_likes_idx
  on public.reelpin_feedback (kind, likes desc, created_at desc);
create index if not exists reelpin_feedback_status_created_idx
  on public.reelpin_feedback (status, created_at desc);

-- 2. RLS ──────────────────────────────────────────────────────
alter table public.reelpin_feedback enable row level security;

-- 읽기: 누구나 (비로그인 포함)
drop policy if exists reelpin_feedback_read on public.reelpin_feedback;
create policy reelpin_feedback_read
  on public.reelpin_feedback for select
  to anon, authenticated
  using (true);

-- 쓰기: 누구나, 다만 모양은 서버가 강제한다 → 직접 만든 공감·상태·남의 이메일은 들어올 수 없습니다.
drop policy if exists reelpin_feedback_insert on public.reelpin_feedback;
create policy reelpin_feedback_insert
  on public.reelpin_feedback for insert
  to anon, authenticated
  with check (
    kind in ('idea', 'bug')
    and likes = 0
    and status = 'open'
    and char_length(btrim(title)) between 2 and 80
    and char_length(btrim(content)) between 5 and 1200
    and char_length(btrim(author)) between 1 and 12
    and (app_version is null or char_length(app_version) <= 24)
    and (
      user_email is null
      or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- 수정/삭제 정책은 만들지 않습니다 — 일반 사용자는 글을 고치거나 지울 수 없습니다.
-- (운영자는 아래 어드민 RPC 로만 상태를 바꾸고 지웁니다)

-- 3. 테이블 권한 ───────────────────────────────────────────────
--   읽기는 **컬럼 단위**로 엽니다 — `user_email` 은 앱 화면에도, 공개 API 응답에도 나가지 않습니다.
--   (관리자 RPC 는 security definer 라 소유자 권한으로 이메일까지 읽습니다)
revoke all on public.reelpin_feedback from anon, authenticated;
grant select (id, kind, title, content, author, app_version, likes, status, created_at)
  on public.reelpin_feedback to anon, authenticated;
grant insert on public.reelpin_feedback to anon, authenticated;

-- 4. 공감(👍) — 한 번에 +1 만 하는 함수 ─────────────────────────
create or replace function public.increment_reelpin_feedback_like(row_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_likes integer;
begin
  update public.reelpin_feedback
     set likes = likes + 1
   where id = row_id
  returning likes into v_likes;

  if v_likes is null then
    raise exception 'feedback not found' using errcode = 'P0002';
  end if;

  return v_likes;
end;
$$;

comment on function public.increment_reelpin_feedback_like(uuid) is 'v2.23 — 제보 글 공감 +1 (비로그인 허용 · 이 함수로만 증가)';

revoke all on function public.increment_reelpin_feedback_like(uuid) from public;
grant execute on function public.increment_reelpin_feedback_like(uuid) to anon, authenticated;

-- 5. 어드민 판별 — admin.sql 의 reelpin_is_admin() 과 **같은 이메일 목록**을 씁니다.
--    (feedback.sql 만 따로 실행해도 동작하도록 이 파일 안에도 한 벌 둡니다.
--     관리자 이메일을 바꾸면 admin.sql · 이 파일 · Vercel `ADMIN_EMAILS` 를 함께 고쳐 주세요.)
create or replace function public.reelpin_feedback_is_admin()
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

comment on function public.reelpin_feedback_is_admin() is 'v2.23 — 제보 관리 어드민 이메일 화이트리스트(DB 측 최종 확인)';

revoke all on function public.reelpin_feedback_is_admin() from public;
revoke all on function public.reelpin_feedback_is_admin() from anon;
grant execute on function public.reelpin_feedback_is_admin() to authenticated;

-- 6. 어드민 — 제보 목록 (유형·상태 필터) ──────────────────────────
create or replace function public.reelpin_admin_feedback(p_kind text default null, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_kind   text := nullif(btrim(coalesce(p_kind, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_result jsonb;
begin
  if not public.reelpin_feedback_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_kind is not null and v_kind not in ('idea', 'bug') then
    raise exception '유형은 idea 또는 bug 만 됩니다' using errcode = '22023';
  end if;
  if v_status is not null and v_status not in ('open', 'applied', 'fixed') then
    raise exception '상태는 open · applied · fixed 만 됩니다' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(f.t order by f.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'id',         f.id,
        'kind',       f.kind,
        'title',      f.title,
        'content',    f.content,
        'author',     f.author,
        'userEmail',  coalesce(f.user_email, ''),
        'appVersion', coalesce(f.app_version, ''),
        'likes',      f.likes,
        'status',     f.status,
        'createdAt',  f.created_at
      ) as t,
      f.created_at
    from public.reelpin_feedback f
    where (v_kind is null or f.kind = v_kind)
      and (v_status is null or f.status = v_status)
    order by f.created_at desc
    limit 500
  ) f;

  return v_result;
end;
$$;

comment on function public.reelpin_admin_feedback(text, text) is 'v2.23 — 어드민 제보 목록(유형·상태 필터)';

revoke all on function public.reelpin_admin_feedback(text, text) from public;
revoke all on function public.reelpin_admin_feedback(text, text) from anon;
grant execute on function public.reelpin_admin_feedback(text, text) to authenticated;

-- 7. 어드민 — 제보 상태 변경 (접수됨 ↔ 반영됨 ↔ 수정됨) ────────────
create or replace function public.reelpin_admin_update_feedback_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_saved  text;
begin
  if not public.reelpin_feedback_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_status not in ('open', 'applied', 'fixed') then
    raise exception '상태는 open · applied · fixed 만 됩니다' using errcode = '22023';
  end if;

  update public.reelpin_feedback
     set status = v_status
   where id = p_id
  returning status into v_saved;

  if v_saved is null then
    raise exception '제보를 찾지 못했어요' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status);
end;
$$;

comment on function public.reelpin_admin_update_feedback_status(uuid, text) is 'v2.23 — 어드민 제보 상태 변경';

revoke all on function public.reelpin_admin_update_feedback_status(uuid, text) from public;
revoke all on function public.reelpin_admin_update_feedback_status(uuid, text) from anon;
grant execute on function public.reelpin_admin_update_feedback_status(uuid, text) to authenticated;

-- 8. 어드민 — 제보 삭제 ────────────────────────────────────────
create or replace function public.reelpin_admin_delete_feedback(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_title text;
begin
  if not public.reelpin_feedback_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.reelpin_feedback
   where id = p_id
  returning title into v_title;

  if v_title is null then
    raise exception '제보를 찾지 못했어요' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'title', v_title);
end;
$$;

comment on function public.reelpin_admin_delete_feedback(uuid) is 'v2.23 — 어드민 제보 삭제';

revoke all on function public.reelpin_admin_delete_feedback(uuid) from public;
revoke all on function public.reelpin_admin_delete_feedback(uuid) from anon;
grant execute on function public.reelpin_admin_delete_feedback(uuid) to authenticated;

-- 9. 확인용 (선택) ────────────────────────────────────────────
-- select proname from pg_proc where proname like 'reelpin_%feedback%';
-- select public.reelpin_feedback_is_admin();  -- SQL Editor 에는 JWT 가 없어 false 가 정상입니다.
