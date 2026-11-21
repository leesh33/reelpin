-- ─────────────────────────────────────────────────────────────
-- 릴스핀(Reelspin) v2.40.0 · 회원탈퇴(계정 삭제) 함수
-- ─────────────────────────────────────────────────────────────
-- App Store 심사 지침 5.1.1(v) — **앱 안에서 계정을 지울 수 있어야 합니다.**
--   · 앱: `내 정보` › `회원탈퇴` → 두 단계 확인 → `supabase.rpc('delete_my_account')`
--   · DB: 이 파일을 Supabase SQL Editor 에 붙여 넣고 Run (다시 실행해도 안전 — `create or replace`)
--
-- 하는 일 (모두 **본인 행만**)
--   1. public.pins                      — 내가 저장한 핀
--   2. public.reelpin_feedback          — 내 이메일로 남긴 제안·버그 제보 (이메일 = 개인정보)
--   3. public.reelpin_shared_collections — 내가 공유한 컬렉션 스냅샷
--   4. auth.users                       — 로그인 계정 자체 (여기서 지워야 다시 로그인할 수 없습니다)
--
-- 안전장치
--   · `security definer` 로 만들어 auth.users 까지 지울 수 있게 하되,
--     **`auth.uid()` 가 없으면(비로그인) 아무것도 지우지 않고 예외**를 던집니다.
--   · `search_path` 를 고정해 함수 안에서 엉뚱한 스키마가 잡히지 않게 합니다.
--   · 실행 권한은 `authenticated` 에만 줍니다 (anon 은 실행 불가).
--   · 다른 사람의 행은 조건(user_id / owner_id / email = 내 것)으로만 지웁니다.
--
-- ⚠️ 되돌릴 수 없습니다. 운영 DB 에서 시험할 때는 **테스트 계정**으로만 확인하세요.
-- ─────────────────────────────────────────────────────────────

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid        uuid := auth.uid();
  v_email      text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_pins       int  := 0;
  v_feedback   int  := 0;
  v_shared     int  := 0;
begin
  -- 0. 로그인 확인 — 비로그인(anon) 요청은 아무것도 지우지 않습니다
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = '28000';
  end if;

  -- 1. 내가 저장한 핀
  delete from public.pins where user_id = v_uid;
  get diagnostics v_pins = row_count;

  -- 2. 내 이메일로 남긴 제보 (이메일이 비어 있는 익명 글은 건드리지 않습니다)
  if v_email <> '' then
    delete from public.reelpin_feedback
     where user_email is not null
       and lower(user_email) = v_email;
    get diagnostics v_feedback = row_count;
  end if;

  -- 3. 내가 공유한 컬렉션 스냅샷 (공개 링크도 함께 사라집니다)
  delete from public.reelpin_shared_collections where owner_id = v_uid;
  get diagnostics v_shared = row_count;

  -- 4. 로그인 계정 — 이 줄이 성공해야 '탈퇴'입니다
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'pins', v_pins,
    'feedback', v_feedback,
    'shared_collections', v_shared
  );
end;
$$;

comment on function public.delete_my_account() is
  '릴스핀 — 로그인한 본인의 핀·제보·공유 컬렉션과 auth.users 계정을 지웁니다 (App Store 5.1.1(v)).';

-- 권한 — 로그인한 사용자만 실행 (anon 은 불가)
revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

-- 확인용 (선택)
-- select proname, prosecdef, proconfig from pg_proc where proname = 'delete_my_account';
-- select grantee, privilege_type from information_schema.routine_privileges
--  where routine_name = 'delete_my_account';
