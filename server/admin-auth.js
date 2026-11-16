/**
 * server/admin-auth.js
 * ─────────────────────────────────────────────────────────────
 * v2.21 — 🛡️ 어드민(`/admin`)의 **서버 측 인증** 한 곳.
 *
 * 규칙
 *   1. 클라이언트가 보낸 `Authorization: Bearer <Supabase access_token>` 만 믿지 않고,
 *      Supabase Auth(`GET /auth/v1/user`)에 물어 **토큰이 진짜인지** 확인합니다.
 *      → 위조한 토큰·만료된 토큰·남의 앱 토큰은 여기서 401 로 끝납니다.
 *   2. 이메일이 관리자 화이트리스트(아래 기본값 + `ADMIN_EMAILS` 환경변수)에 없으면 403.
 *   3. anon key 로만 Auth 에 물어보므로 **service_role 키가 필요 없습니다.**
 *      (DB 쪽 관리자 권한은 `public.reelpin_admin_*` 함수가 `auth.jwt()` 로 다시 확인합니다)
 *
 * 반환 모양
 *   { ok:true, user:{id,email}, email:'a@b.c' }
 *   { ok:false, status:401|403|503, error:'unauthenticated'|'not-admin'|'not-configured', message }
 */

/** 기본 관리자 계정 — 이 두 사람만 어드민에 들어갈 수 있습니다. */
const DEFAULT_ADMIN_EMAILS = ['andy.leesh33@gmail.com', 'shhy@kakao.com'];

/** 이메일 정리 — 소문자·공백 제거 */
function normalizeEmail(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/**
 * 관리자 화이트리스트.
 * `ADMIN_EMAILS` 는 쉼표(또는 공백)로 구분합니다. 기본값은 **항상 포함**됩니다.
 * @param {object} [env]
 * @returns {string[]}
 */
function adminEmails(env) {
  const source = env || (typeof process !== 'undefined' ? process.env : {}) || {};
  const extra = String(source.ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);
  const list = [];
  DEFAULT_ADMIN_EMAILS.concat(extra).forEach((email) => {
    const value = normalizeEmail(email);
    if (value && list.indexOf(value) < 0) list.push(value);
  });
  return list;
}

/** 이 이메일이 관리자인가? */
function isAdminEmail(email, env) {
  const value = normalizeEmail(email);
  if (!value) return false;
  return adminEmails(env).indexOf(value) >= 0;
}

/** `Authorization: Bearer xxx` → 'xxx' (없으면 '') */
function bearerToken(req) {
  const headers = (req && req.headers) || {};
  const raw = headers.authorization || headers.Authorization || '';
  const text = String(raw || '').trim();
  const m = /^Bearer\s+(.+)$/i.exec(text);
  return m ? String(m[1]).trim() : '';
}

/** Supabase 설정(서버 환경변수) — anon key 는 공개 값이라 서버에서 쓰기 좋습니다. */
function readSupabaseEnv(env) {
  const source = env || (typeof process !== 'undefined' ? process.env : {}) || {};
  const url = String(source.SUPABASE_URL || source.EXPO_PUBLIC_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const anonKey = String(source.SUPABASE_ANON_KEY || source.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!/^https?:\/\//i.test(url) || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Supabase 에 토큰을 들고 물어봅니다. (진짜 사용자인지)
 * @returns {Promise<{ok:boolean, status:number, user:object|null}>}
 */
async function fetchTokenUser({ url, anonKey, token, fetchImpl, timeoutMs = 4000 }) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return { ok: false, status: 0, user: null };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        /* 이미 끝남 */
      }
    }, timeoutMs);
  }
  try {
    const res = await doFetch(url + '/auth/v1/user', {
      method: 'GET',
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res || !res.ok) return { ok: false, status: (res && res.status) || 0, user: null };
    const data = await res.json();
    const user = data && (data.user || data);
    if (!user || !user.id) return { ok: false, status: 500, user: null };
    return { ok: true, status: 200, user };
  } catch (e) {
    return { ok: false, status: 0, user: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 요청 하나를 어드민으로 인정할지 판단합니다.
 * @param {object} req
 * @param {{env?:object, fetchImpl?:Function}} [options]
 * @returns {Promise<{ok:boolean, status?:number, error?:string, message?:string, email?:string, user?:object, token?:string}>}
 */
async function authorizeAdmin(req, options = {}) {
  const env = options.env || (typeof process !== 'undefined' ? process.env : {}) || {};
  const cfg = readSupabaseEnv(env);
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      error: 'not-configured',
      message: 'Supabase 설정(SUPABASE_URL·SUPABASE_ANON_KEY)이 없어 어드민을 켤 수 없어요.',
    };
  }
  const token = bearerToken(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'unauthenticated',
      message: '로그인이 필요해요. 관리자 계정으로 로그인해 주세요.',
    };
  }
  const verified = await fetchTokenUser({
    url: cfg.url,
    anonKey: cfg.anonKey,
    token,
    fetchImpl: options.fetchImpl,
  });
  if (!verified.ok) {
    return {
      ok: false,
      status: verified.status === 401 || verified.status === 403 ? 401 : 401,
      error: 'unauthenticated',
      message: '로그인이 만료됐어요. 다시 로그인해 주세요.',
    };
  }
  const email = normalizeEmail(verified.user.email);
  if (!isAdminEmail(email, env)) {
    return {
      ok: false,
      status: 403,
      error: 'not-admin',
      message: '관리자 계정이 아니에요.',
      email,
    };
  }
  return { ok: true, status: 200, email, user: verified.user, token };
}

module.exports = {
  DEFAULT_ADMIN_EMAILS,
  adminEmails,
  isAdminEmail,
  bearerToken,
  readSupabaseEnv,
  fetchTokenUser,
  authorizeAdmin,
};
