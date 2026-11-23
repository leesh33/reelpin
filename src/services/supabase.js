/**
 * services/supabase.js
 * ─────────────────────────────────────────────────────────────
 * v2.1 — Supabase 클라이언트를 **한 곳에서** 만들고, 설정이 없으면 조용히 꺼 두는 파일.
 *
 * 설정을 찾는 순서
 *   1. 빌드에 박히는 공개 환경변수 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
 *   2. 웹: 같은 출처의 `/api/auth-config`, **네이티브(iOS·Android): 같은 절대 주소**
 *      `https://reelpin.vercel.app/api/auth-config` (Vercel 함수) — 서버에만 있는
 *      `SUPABASE_URL` / `SUPABASE_ANON_KEY` 를 돌려받습니다. (`SERVICE_ROLE_KEY` 는 **절대** 안 옵니다)
 *      · 네이티브에는 같은 출처가 없어 상대 경로 `fetch('/api/auth-config')` 가 실패하므로 절대 주소를 씁니다.
 *   3. 둘 다 없으면 `isSupabaseConfigured() === false` → 앱은 기존처럼 **기기 로컬 전용**으로 동작합니다.
 *
 * SSR/Node 안전 규칙 (지난 v1.x 에서 웹 export 가 깨졌던 지점들)
 *   · import 시점에 `window`·`localStorage`·`navigator` 를 **읽지 않습니다.**
 *   · 세션 저장소는 AsyncStorage 이고, 실패하면(용량·프라이버시 모드·SSR) 메모리 저장소로 넘어갑니다.
 *   · `detectSessionInUrl`(OAuth 리다이렉트 URL 파싱)은 **브라우저일 때만** 켭니다.
 *   · 클라이언트 생성이 실패해도 throw 하지 않고 null 을 돌려줍니다 → 호출부는 로컬 모드로 계속 동작.
 *
 * ⚠️ anon key 는 원래 공개되는 키입니다(RLS 가 실제 방어선). `service_role` 키는 어떤 경우에도
 *    앱 번들·/api/auth-config 응답에 담지 않습니다.
 */
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ORIGIN, isNativeRuntime } from '../utils/apiOrigin';

/** 웹에서 서버 설정을 받아 오는 같은 출처 엔드포인트 (Vercel 함수) */
export const AUTH_CONFIG_ENDPOINT = '/api/auth-config';
/** 네이티브에서 쓰는 **절대 주소** — 같은 출처가 없는 앱에서도 설정을 받아 옵니다. */
export const NATIVE_AUTH_CONFIG_ENDPOINT = API_ORIGIN + AUTH_CONFIG_ENDPOINT;
/** 설정 조회는 4초 안에 끊습니다. (Vercel 무료 플랜 함수 시간 보호) */
export const AUTH_CONFIG_TIMEOUT_MS = 4000;
/** 받아 온 설정을 메모리에 들고 있는 시간 — 한 세션 안에서 매번 부르지 않게 */
export const AUTH_CONFIG_CACHE_MS = 5 * 60 * 1000;
/** 세션을 담아 두는 키 (AsyncStorage) */
export const SESSION_STORAGE_KEY = 'reelpin.auth.session';

// ── 환경변수 (Expo 는 빌드 시점에 아래 문자열을 값으로 바꿔 넣습니다) ─────────
/**
 * Expo 의 `EXPO_PUBLIC_` 인라인 치환은 **정적 멤버 접근**(`process.env.이름`)에만 동작합니다.
 * 그래서 이름을 변수로 돌리지 않고 그대로 적습니다. (테스트에서 값을 바꿔 볼 수 있게
 * 모듈 로드 시점이 아니라 호출 시점에 읽습니다.)
 */
export function readEnvConfig() {
  const env = typeof process !== 'undefined' && process && process.env ? process.env : {};
  return {
    url: String(env.EXPO_PUBLIC_SUPABASE_URL || '').trim(),
    anonKey: String(env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
  };
}

/** 브라우저인가? (SSR·테스트에서는 false) */
export function isBrowser() {
  try {
    return typeof window !== 'undefined' && !!window && typeof window.document !== 'undefined';
  } catch (e) {
    return false;
  }
}

/**
 * URL 정리 — 끝의 `/` 를 떼고, https/http 가 아니면 '' 을 돌려줍니다.
 * (오타 난 주소로 createClient 를 부르면 앱이 통째로 죽기 때문에 미리 거릅니다)
 */
export function normalizeSupabaseUrl(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) return '';
  const trimmed = raw.replace(/\/+$/, '');
  try {
    // eslint-disable-next-line no-new
    new URL(trimmed);
  } catch (e) {
    return '';
  }
  return trimmed;
}

/** anon key 모양 검사 — JWT(`eyJ…`) 또는 새 publishable 키(`sb_publishable_…`) */
export function looksLikeAnonKey(value) {
  const key = String(value == null ? '' : value).trim();
  if (!key) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return true;
  // 구형 anon key(짧은 JWT 변형)·자체 호스팅 키까지 막지 않도록 길이만 봅니다.
  return key.length >= 20 && !/\s/.test(key);
}

// ── 설정 상태 ────────────────────────────────────────────────
let injectedConfig = null; // 테스트·관리용 주입 (setSupabaseConfig)
let serverConfig = null; // /api/auth-config 에서 받아 온 값 { url, anonKey, at }
let cachedClient = null;
let cachedClientSignature = '';

/** 지금 쓸 수 있는 설정을 동기적으로 계산합니다. → { url, anonKey, source } */
export function resolveSupabaseConfig() {
  if (injectedConfig) {
    const url = normalizeSupabaseUrl(injectedConfig.url || injectedConfig.supabaseUrl);
    const anonKey = String(injectedConfig.anonKey || injectedConfig.supabaseAnonKey || '').trim();
    if (url && anonKey) return { url, anonKey, source: 'injected' };
  }
  const env = readEnvConfig();
  const envUrl = normalizeSupabaseUrl(env.url);
  if (envUrl && env.anonKey && looksLikeAnonKey(env.anonKey)) {
    return { url: envUrl, anonKey: env.anonKey, source: 'env' };
  }
  if (serverConfig) {
    const url = normalizeSupabaseUrl(serverConfig.url);
    if (url && serverConfig.anonKey) return { url, anonKey: serverConfig.anonKey, source: 'server' };
  }
  return { url: '', anonKey: '', source: 'none' };
}

/** 로그인·동기화를 켤 수 있는 상태인가? (설정이 없으면 false → 로컬 전용 모드) */
export function isSupabaseConfigured() {
  const cfg = resolveSupabaseConfig();
  return !!(cfg.url && cfg.anonKey);
}

/** 테스트·스토리용 주입. `setSupabaseConfig(null)` 로 되돌립니다. */
export function setSupabaseConfig(config) {
  injectedConfig = config || null;
  cachedClient = null;
  cachedClientSignature = '';
  return resolveSupabaseConfig();
}

/** 받아 온 서버 설정까지 지웁니다. (로그아웃 후 설정 재조회용) */
export function resetSupabaseConfigCache() {
  serverConfig = null;
  cachedClient = null;
  cachedClientSignature = '';
}

/**
 * `/api/auth-config` 로 설정을 받아 옵니다.
 *   · 웹      … 같은 출처 상대 경로 `'/api/auth-config'`
 *   · 네이티브 … 절대 주소 `'https://reelpin.vercel.app/api/auth-config'` (v2.40.1)
 *   · Node SSR·테스트 … fetch 를 부르지 않고 바로 `{ ok:false, reason:'not-web' }`
 *   · 실패해도 예외를 던지지 않습니다. (앱은 로컬 전용으로 계속 동작)
 */
export async function loadSupabaseConfig(options = {}) {
  const env = readEnvConfig();
  if (normalizeSupabaseUrl(env.url) && env.anonKey) {
    return { ok: true, source: 'env', config: resolveSupabaseConfig() };
  }
  if (injectedConfig) return { ok: true, source: 'injected', config: resolveSupabaseConfig() };
  // v2.40.1 — 네이티브는 같은 출처가 없지만 **절대 주소**로는 받아 올 수 있습니다.
  const native = isNativeRuntime();
  if (!isBrowser() && !native) return { ok: false, reason: 'not-web', config: resolveSupabaseConfig() };

  const now = Date.now();
  if (serverConfig && now - serverConfig.at < (options.maxAgeMs || AUTH_CONFIG_CACHE_MS)) {
    return { ok: true, source: 'server', config: resolveSupabaseConfig(), cached: true };
  }

  const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return { ok: false, reason: 'no-fetch', config: resolveSupabaseConfig() };

  const endpoint =
    options.endpoint || (native && !isBrowser() ? NATIVE_AUTH_CONFIG_ENDPOINT : AUTH_CONFIG_ENDPOINT);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : AUTH_CONFIG_TIMEOUT_MS;
  let timer = null;
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller ? controller.signal : undefined,
      credentials: 'same-origin',
    });
    if (!response || !response.ok) return { ok: false, reason: 'http-' + (response ? response.status : 'none') };
    const json = await response.json();
    const url = normalizeSupabaseUrl(json && (json.url || json.supabaseUrl || json.SUPABASE_URL));
    const anonKey = String((json && (json.anonKey || json.supabaseAnonKey || json.SUPABASE_ANON_KEY)) || '').trim();
    if (!url || !anonKey) return { ok: false, reason: 'incomplete' };
    serverConfig = { url, anonKey, at: Date.now() };
    cachedClient = null;
    cachedClientSignature = '';
    return { ok: true, source: 'server', config: resolveSupabaseConfig() };
  } catch (e) {
    return { ok: false, reason: 'network', config: resolveSupabaseConfig() };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── 세션 저장소 ──────────────────────────────────────────────
/**
 * Node SSR(WebSocket 없는 런타임)용 빈 전송 객체.
 * supabase-js 의 Realtime 클라이언트는 생성 시점에 WebSocket 구현을 요구해서,
 * Node 20 SSR 에서는 그대로 두면 createClient 가 throw 합니다. 우리는 Realtime 을 쓰지 않으므로
 * (로그인·DB 만 사용) 빈 구현을 넣어 생성만 통과시킵니다. 브라우저·RN 에는 WebSocket 이 있어 영향 없습니다.
 */
class SSRWebSocketTransport {
  constructor() {}
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

const memoryStore = new Map();

/**
 * AsyncStorage 를 감싼 안전한 저장소.
 * SSR·프라이버시 모드·용량 초과에서도 예외를 던지지 않고 메모리로 넘어갑니다.
 */
export const supabaseAuthStorage = {
  async getItem(key) {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value != null) return value;
    } catch (e) {
      // 아래 메모리 저장소로 폴백
    }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  async setItem(key, value) {
    const text = String(value);
    memoryStore.set(key, text);
    try {
      await AsyncStorage.setItem(key, text);
    } catch (e) {
      // 메모리에만 남깁니다 (앱을 끄면 사라지지만 크래시는 없음)
    }
  },
  async removeItem(key) {
    memoryStore.delete(key);
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {}
  },
};

/**
 * OAuth·매직링크가 돌아올 주소.
 *   · 웹: 지금 열려 있는 사이트의 뿌리 (`https://reelpin.vercel.app/`)
 *   · 앱: app.json 의 scheme (`reelpin://auth-callback`)
 *   · `EXPO_PUBLIC_AUTH_REDIRECT_URL` 이 있으면 그 값을 우선합니다.
 */
export function authRedirectUrl() {
  const env = typeof process !== 'undefined' && process && process.env ? process.env : {};
  const explicit = String(env.EXPO_PUBLIC_AUTH_REDIRECT_URL || '').trim();
  if (explicit) return explicit;
  if (isBrowser()) {
    try {
      return window.location.origin + '/';
    } catch (e) {}
  }
  return 'reelpin://auth-callback';
}

/**
 * Supabase 클라이언트 (싱글턴).
 *   · 설정이 없으면 **null** — 호출부는 로컬 전용 모드로 동작합니다.
 *   · 생성 중 예외가 나도 null (앱을 죽이지 않습니다).
 */
export function getSupabaseClient(options = {}) {
  if (options.client) return options.client;
  const cfg = resolveSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) return null;
  const signature = cfg.url + '|' + cfg.anonKey;
  if (cachedClient && cachedClientSignature === signature) return cachedClient;
  try {
    cachedClient = createClient(cfg.url, cfg.anonKey, {
      auth: {
        storage: supabaseAuthStorage,
        storageKey: SESSION_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        // 브라우저에서만 URL 의 `#access_token=…` / `?code=…` 를 읽습니다. (SSR 안전)
        detectSessionInUrl: isBrowser(),
        flowType: 'pkce',
      },
      global: {
        headers: { 'x-application-name': 'reelpin' },
      },
      // Node SSR 에는 WebSocket 이 없습니다 — Realtime 은 쓰지 않으니 빈 전송으로 생성만 통과.
      ...(typeof WebSocket === 'undefined' ? { realtime: { transport: SSRWebSocketTransport } } : {}),
    });
    cachedClientSignature = signature;
    return cachedClient;
  } catch (e) {
    cachedClient = null;
    cachedClientSignature = '';
    return null;
  }
}

let injectedClient = null;

/** 테스트에서 가짜 클라이언트를 꽂습니다. (`null` 을 넣으면 원래대로) */
export function __setSupabaseClient(client) {
  injectedClient = client || null;
  return injectedClient;
}

/** 위 주입을 반영한 최종 클라이언트 접근자 */
export function supabase() {
  if (injectedClient) return injectedClient;
  return getSupabaseClient();
}

/** 로그인 UI 가 쓰는 안내 문구 */
export const SUPABASE_SETUP_HINT =
  '지금은 기기 안에만 저장돼요. 서버에 Supabase 주소·공개 키(SUPABASE_URL · SUPABASE_ANON_KEY)를 넣으면 계정 로그인과 클라우드 동기화가 켜집니다.';
