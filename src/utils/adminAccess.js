/**
 * src/utils/adminAccess.js — v2.21 🛡️ 어드민 접근 규칙 (앱 쪽 사본)
 * ─────────────────────────────────────────────────────────────
 * 화면에서 **어드민 진입점을 보여 줄지**와 `/admin` 경로인지 판단만 합니다.
 * 실제 허용 여부는 서버(`/api/admin` → Supabase 토큰 검증)와 DB 함수가 최종 판단합니다.
 *   → 여기 목록에 이메일이 없다고 남의 데이터를 볼 수 있는 것도, 있다고 뚫리는 것도 아닙니다.
 */
export const ADMIN_EMAILS = ['andy.leesh33@gmail.com', 'shhy@kakao.com'];

/** 어드민 이메일인가? (로그아웃·게스트는 false) */
export function isAdminAccount(email) {
  const value = String(email == null ? '' : email).trim().toLowerCase();
  if (!value) return false;
  return ADMIN_EMAILS.indexOf(value) >= 0;
}

/** 지금 주소가 `/admin` 인가? (웹에서만 true) */
export function isAdminPath(location) {
  const loc = location || (typeof window !== 'undefined' ? window.location : null);
  if (!loc) return false;
  return /^\/admin(\/|\?|$)/.test(String(loc.pathname || ''));
}

/** 미리보기(`?preview=1`)인가? — 모의 데이터로 화면만 보여 줍니다. */
export function isAdminPreview(location) {
  const loc = location || (typeof window !== 'undefined' ? window.location : null);
  if (!loc) return false;
  return /[?&]preview=1(&|$)/.test(String(loc.search || ''));
}

export const ADMIN_PATH_PATTERN = /^\/admin(\/|\?|$)/;
