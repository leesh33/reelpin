/**
 * api/auth-config.js — Vercel Serverless Function
 * ─────────────────────────────────────────────────────────────
 * GET /api/auth-config
 *
 * 웹 빌드에는 Supabase 주소·anon key 가 없을 수 있어서, 같은 출처인 이 함수가 대신 알려 줍니다.
 *
 * 응답 (200)
 *   {
 *     "url": "https://xxxx.supabase.co",
 *     "anonKey": "eyJhbGciOi…",          // 브라우저에 있어도 되는 공개 키 (RLS 가 방어선)
 *     "supabaseUrl": "…", "supabaseAnonKey": "…",   // 이름 그대로 쓰는 클라이언트를 위한 별칭
 *     "SUPABASE_URL": "…", "SUPABASE_ANON_KEY": "…" // 환경변수 이름과 같은 표기
 *   }
 *
 * 규칙
 *   · `SERVICE_ROLE_KEY` 는 **어떤 경우에도 응답에 담지 않습니다.** (값이 anon key 와 같아도 거부)
 *   · 키가 없으면 503 `{ error: 'supabase-not-configured' }` → 앱은 로컬 전용 모드로 계속 동작.
 *   · anon key 는 공개 값이라 캐시해도 되지만, 키 교체가 늦게 퍼지지 않게 5분만 캐시합니다.
 */
const { sendJson, isGet, warn } = require('../server/http.js');

/** URL 정리 — http(s) 가 아니면 '' */
function normalizeUrl(value) {
  const raw = String(value == null ? '' : value).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(raw)) return '';
  return raw;
}

/** anon / publishable 키 모양인지 (JWT · sb_publishable_ · 자체 호스팅 긴 키) */
function looksLikeKey(value) {
  const key = String(value == null ? '' : value).trim();
  if (!key) return false;
  if (/\s/.test(key)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(key)) return true;
  return key.length >= 20;
}

/** 공개해도 되는 설정만 골라 꺼냅니다. (env 는 테스트에서 갈아끼울 수 있게 인자로 받음) */
function readConfig(env) {
  const source = env || (typeof process !== 'undefined' ? process.env : {}) || {};
  const url = normalizeUrl(source.SUPABASE_URL || source.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = String(source.SUPABASE_ANON_KEY || source.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceRole = String(source.SUPABASE_SERVICE_ROLE_KEY || source.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !looksLikeKey(anonKey)) return null;
  // 설정 실수로 anon 자리에 service_role 이 들어간 경우 — 절대 내보내지 않습니다.
  if (serviceRole && anonKey === serviceRole) {
    warn('auth-config: anon key equals service role key — refusing');
    return null;
  }
  if (/^sb_secret_/.test(anonKey)) {
    warn('auth-config: secret key in anon slot — refusing');
    return null;
  }
  return { url, anonKey };
}

module.exports = async function handler(req, res) {
  if (!isGet(req)) return sendJson(res, 405, { error: 'method-not-allowed' });

  const config = readConfig(module.exports.env);
  if (!config) return sendJson(res, 503, { error: 'supabase-not-configured' }, 0);

  return sendJson(
    res,
    200,
    {
      url: config.url,
      anonKey: config.anonKey,
      supabaseUrl: config.url,
      supabaseAnonKey: config.anonKey,
      SUPABASE_URL: config.url,
      SUPABASE_ANON_KEY: config.anonKey,
    },
    300
  );
};

module.exports.readConfig = readConfig;
module.exports.looksLikeKey = looksLikeKey;
module.exports.normalizeUrl = normalizeUrl;
