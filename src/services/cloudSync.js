/**
 * services/cloudSync.js
 * ─────────────────────────────────────────────────────────────
 * v2.1 — 계정 로그인과 **클라우드 핀 동기화**를 한 파일에 모읍니다.
 *
 * 설계 원칙
 *   1. **실패해도 기기 데이터는 그대로.** 모든 함수는 예외를 던지지 않고 `{ ok, ... }` 를 돌려줍니다.
 *      동기화가 실패하면 화면은 이미 낙관적으로 바뀐 로컬 핀을 유지하고, 사용자는 토스트만 봅니다.
 *   2. **설정이 없으면 조용히 꺼짐.** `isSupabaseConfigured()` 가 false 면 모든 함수가
 *      `{ ok:false, error:'not-configured', reason:'not-configured' }` 를 돌려주고 네트워크를 타지 않습니다.
 *      → Supabase 를 아직 붙이지 않은 배포(웹)에서도 앱은 기존 로컬 전용 모드로 100% 동작합니다.
 *   3. **핀 ↔ 행(row) 변환은 순수 함수.** (`pinToRow` / `rowToPin`) 테스트에서 그대로 검사합니다.
 *   4. **삭제는 명시적으로만.** 병합은 올리기(upsert)만 하고, 다른 기기에서 저장한 핀을 지우지 않습니다.
 *
 * 테이블: `supabase/schema.sql` 의 `public.pins` (PK = user_id + id, RLS = auth.uid() = user_id)
 *
 * v2.10 — `visited`(가봤어요) · `memo`(한줄 메모) 컬럼 추가.
 *   · `supabase/schema.sql` 을 SQL Editor 에서 한 번 더 Run 하면 두 컬럼이 생깁니다.
 *   · 아직 적용하지 않은 DB 에서도 앱이 깨지지 않게, 컬럼이 없다는 오류를 만나면
 *     그 요청만 **예전 컬럼 목록**으로 다시 보냅니다 (`legacySchema` 로 기억 → 다음부터 바로 예전 모양).
 */
import { Linking } from 'react-native';
import { authRedirectUrl, isSupabaseConfigured, supabase } from './supabase';
import { isSamePin, normalizePin } from '../utils/pins';

/** Supabase 테이블 이름 */
export const PIN_TABLE = 'pins';
/** 한 번에 올리는 최대 행 수 (요청 본문이 너무 커지지 않게) */
export const UPSERT_CHUNK = 100;
/** 매직링크·로그인 안내에서 쓰는 소셜 로그인 목록
 *  v2.20.1 — Apple 은 유료 Apple Developer 계정(연 129,000원)이 필요해 **준비 중**입니다.
 *  `pending: true` 인 제공자는 Supabase 로 넘기지 않고 안내만 합니다(오류 페이지 방지). */
export const OAUTH_PROVIDERS = [
  { id: 'kakao', label: '카카오', icon: 'chatbubble-ellipses', color: '#FEE500' },
  { id: 'google', label: '구글', icon: 'logo-google', color: '#FFFFFF' },
  { id: 'apple', label: 'Apple', icon: 'logo-apple', color: '#111111', pending: true },
];

/** 준비 중인 소셜 로그인을 눌렀을 때의 안내 문구 (화면·토스트 공통) */
export const OAUTH_PENDING_MESSAGE = 'Apple 로그인은 준비 중이에요. 구글이나 카카오 로그인을 이용해 주세요.';

/** 그 제공자로 지금 로그인할 수 있는가 — 준비 중(pending)이면 false */
export function oauthProviderReady(provider) {
  const id = String(provider || '').toLowerCase();
  const item = OAUTH_PROVIDERS.find((p) => p.id === id);
  return Boolean(item) && item.pending !== true;
}
/** 로그인·회원가입 최소 비밀번호 (Supabase 기본 6자와 맞춤) */
export const MIN_PASSWORD_LENGTH = 6;
/** 핀 한 개를 클라우드에서 읽을 때 쓰는 컬럼 (schema.sql 과 일치) */
export const PIN_COLUMNS = [
  'id',
  'user_id',
  'name',
  'category',
  'area',
  'lat',
  'lng',
  'note',
  'source_url',
  'platform',
  'place_url',
  'naver_place_id',
  'phone',
  'address',
  'providers',
  'menu_tags',
  'visited',
  'memo',
  'created_at',
  'updated_at',
];
/** v2.9 이하 DB(visited·memo 컬럼 없음)에 쓸 컬럼 목록 */
export const PIN_COLUMNS_LEGACY = PIN_COLUMNS.filter((name) => name !== 'visited' && name !== 'memo');
/** 새 컬럼이 아직 없는 DB 라는 것을 한 번 알아내면 기억합니다 (매 요청 재시도 방지) */
let legacySchema = false;
/** 테스트용 — 기억을 지웁니다. */
export function __resetLegacySchemaFlag() {
  legacySchema = false;
}
/** 컬럼이 없다는 오류인가? (Postgres 42703 · PostgREST PGRST204 · 메시지 문구) */
export function isMissingColumnError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === 'PGRST204') return true;
  const text = String(error.message || error.details || error.hint || '').toLowerCase();
  if (!text) return false;
  return (
    (text.indexOf('column') >= 0 && (text.indexOf('does not exist') >= 0 || text.indexOf('not found') >= 0 || text.indexOf('unknown') >= 0)) ||
    text.indexOf("could not find the 'visited'") >= 0 ||
    text.indexOf("could not find the 'memo'") >= 0
  );
}
/** 지금 쓰는 컬럼 목록 — 새 컬럼이 없는 DB 를 한 번 만나면 예전 목록으로 */
export function activePinColumns() {
  return legacySchema ? PIN_COLUMNS_LEGACY : PIN_COLUMNS;
}

const NOT_CONFIGURED = Object.freeze({
  ok: false,
  error: 'not-configured',
  reason: 'not-configured',
  message: '아직 클라우드 로그인이 켜지지 않았어요. 지금은 기기에만 저장됩니다.',
});

const fail = (error, message) => ({ ok: false, error, message: message || error });

/** 지금 클라우드 기능을 쓸 수 있는가? (설정 + 클라이언트) */
export function isCloudAvailable() {
  if (!isSupabaseConfigured()) return false;
  try {
    return !!supabase();
  } catch (e) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 값 다듬기 · 핀 ↔ 행 변환
// ─────────────────────────────────────────────────────────────
export function normalizeEmail(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/** 좌표 — 숫자가 아니면 null (DB 는 double precision, null 허용) */
export function toCoord(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toJsonArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item != null).map((item) => String(item));
}

/**
 * 핀(앱의 camelCase) → DB 행(snake_case).
 *   · `user_id` 는 RLS 의 기준이라 인자로 반드시 넣습니다.
 *   · 없는 값은 `null`/`''`/`[]` 로 채워 NOT NULL·jsonb 컬럼이 깨지지 않게 합니다.
 */
export function pinToRow(userId, pin, options = {}) {
  if (!userId) return null;
  if (!pin || !pin.name) return null;
  const now = options.now ? new Date(options.now) : new Date();
  const createdAt = toIso(pin.createdAt || pin.created_at) || now.toISOString();
  return {
    user_id: String(userId),
    id: String(pin.id || 'pin-' + now.getTime()),
    name: String(pin.name),
    category: String(pin.category || '맛집'),
    area: String(pin.area || ''),
    lat: toCoord(pin.lat),
    lng: toCoord(pin.lng),
    note: String(pin.note || ''),
    source_url: String(pin.sourceUrl || ''),
    platform: String(pin.platform || 'instagram'),
    place_url: String(pin.placeUrl || ''),
    naver_place_id: String(pin.naverPlaceId || '') || null,
    phone: String(pin.phone || ''),
    address: String(pin.address || ''),
    providers: toJsonArray(pin.providers),
    menu_tags: toJsonArray(pin.menuTags),
    // v2.10 — ✅ 가봤어요 · 📝 한줄 메모
    visited: pin.visited === true,
    memo: String(pin.memo == null ? '' : pin.memo).trim(),
    created_at: createdAt,
    updated_at: now.toISOString(),
  };
}

/** DB 행(snake_case) → 핀(앱 모양). normalizePin 으로 화면이 기대하는 기본값을 채웁니다. */
export function rowToPin(row) {
  if (!row || !row.id || !row.name) return null;
  return normalizePin({
    id: String(row.id),
    name: row.name,
    category: row.category || '맛집',
    area: row.area || '',
    lat: toCoord(row.lat),
    lng: toCoord(row.lng),
    note: row.note || '',
    sourceUrl: row.source_url || '',
    platform: row.platform || 'instagram',
    placeUrl: row.place_url || '',
    naverPlaceId: row.naver_place_id ? String(row.naver_place_id) : '',
    phone: row.phone || '',
    address: row.address || '',
    providers: Array.isArray(row.providers) ? row.providers : [],
    menuTags: Array.isArray(row.menu_tags) ? row.menu_tags : [],
    // v2.10 — 예전 DB(컬럼 없음)에서 읽은 행은 false / '' 로 안전하게
    visited: row.visited === true,
    visitedAt: row.visited === true ? String(row.updated_at || '') : '',
    memo: row.memo == null ? '' : String(row.memo),
    createdAt: row.created_at || new Date().toISOString(),
  });
}

export function rowsToPins(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(rowToPin).filter(Boolean);
}

/** 핀이 마지막으로 바뀐 시각 (로컬 핀에는 updatedAt 이 없을 수 있습니다) */
function pinTime(pin) {
  const value = pin && (pin.updatedAt || pin.updated_at || pin.createdAt || pin.created_at);
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** 핀 두 개를 하나로 — 앞(basic) 값이 비어 있으면 뒤(extra) 값으로 채웁니다. */
function fillPin(basic, extra) {
  const out = { ...extra, ...basic };
  ['area', 'category', 'address', 'placeUrl', 'placeUrlLabel', 'phone', 'note', 'memo', 'sourceUrl', 'platform'].forEach(
    (key) => {
      if (!out[key] && extra && extra[key]) out[key] = extra[key];
    }
  );
  if ((out.lat == null || out.lng == null) && extra && extra.lat != null) {
    out.lat = extra.lat;
    out.lng = extra.lng;
  }
  if ((!Array.isArray(out.providers) || !out.providers.length) && extra && Array.isArray(extra.providers)) {
    out.providers = extra.providers.slice();
  }
  if ((!Array.isArray(out.menuTags) || !out.menuTags.length) && extra && Array.isArray(extra.menuTags)) {
    out.menuTags = extra.menuTags.slice();
  }
  if (!out.naverPlaceId && extra && extra.naverPlaceId) out.naverPlaceId = String(extra.naverPlaceId);
  // v2.20 — 영업시간은 기기 로컬 스냅샷입니다. 클라우드에서 온 핀이 비우지 않게 유지합니다.
  if (!out.hours && extra && extra.hours) {
    out.hours = extra.hours;
    out.hoursCheckedAt = extra.hoursCheckedAt || '';
    out.hoursName = extra.hoursName || '';
  }
  if (out.confidence == null && extra && typeof extra.confidence === 'number') out.confidence = extra.confidence;
  return normalizePin(out);
}

/**
 * 로그인 직후 **기기 로컬 핀과 클라우드 핀을 중복 없이 병합**합니다.
 *   · 같은 id          → 더 최근에 바뀐 쪽을 남깁니다 (같으면 클라우드 — 여러 기기에서 같은 값)
 *   · 다른 id, 같은 곳 → `isSamePin`(네이버 placeId · 매장 URL · 이름+200m)으로 판정해 하나만 남깁니다.
 *                        이때 id 는 **클라우드 쪽**을 씁니다(다른 기기에서도 같은 핀).
 *   · 정렬           → 최근에 저장한 핀이 위 (지도 목록과 같은 순서)
 *
 * @param {Array<object>} localPins 기기에 저장된 핀
 * @param {Array<object>} cloudPins 클라우드에서 읽은 핀
 */
export function mergeLocalAndCloudPins(localPins, cloudPins) {
  const local = (Array.isArray(localPins) ? localPins : []).filter(Boolean);
  const cloud = (Array.isArray(cloudPins) ? cloudPins : []).filter(Boolean);
  const byId = new Map();

  cloud.forEach((pin) => {
    byId.set(String(pin.id), pin);
  });

  local.forEach((pin) => {
    const key = String(pin.id);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, pin);
      return;
    }
    // 같은 id — 최근 값 우선, 같으면 클라우드(다른 기기에서도 보이는 값)를 남깁니다.
    byId.set(key, pinTime(pin) > pinTime(existing) ? pin : existing);
  });

  const merged = [];
  byId.forEach((pin) => {
    const duplicateIndex = merged.findIndex((other) => isSamePin(other, pin));
    if (duplicateIndex < 0) {
      merged.push(pin);
      return;
    }
    const other = merged[duplicateIndex];
    const otherIsCloud = cloud.indexOf(other) >= 0;
    const pinIsCloud = cloud.indexOf(pin) >= 0;
    if (otherIsCloud && !pinIsCloud) merged[duplicateIndex] = fillPin(other, pin);
    else if (pinIsCloud && !otherIsCloud) merged[duplicateIndex] = fillPin(pin, other);
    else merged[duplicateIndex] = pinTime(pin) > pinTime(other) ? fillPin(pin, other) : fillPin(other, pin);
  });

  return merged.sort((a, b) => pinTime(b) - pinTime(a));
}

/** 동기화 계획 — 병합 결과 + 클라우드에 아직 없는/바뀐 핀만 올립니다. (삭제는 하지 않음) */
export function planCloudSync(localPins, cloudPins) {
  const merged = mergeLocalAndCloudPins(localPins, cloudPins);
  const cloudIds = new Set((Array.isArray(cloudPins) ? cloudPins : []).filter(Boolean).map((p) => String(p.id)));
  const toUpload = merged.filter((pin) => {
    const id = String(pin.id);
    if (!cloudIds.has(id)) return true;
    // 같은 id 라도 로컬 값이 더 최근이면 올립니다.
    const cloudPin = (cloudPins || []).find((p) => p && String(p.id) === id);
    return pinTime(pin) > pinTime(cloudPin);
  });
  return { merged, toUpload, cloudCount: cloudIds.size };
}

// ─────────────────────────────────────────────────────────────
// 2. 로그인 · 계정
// ─────────────────────────────────────────────────────────────
/** Supabase 오류를 사용자가 읽을 수 있는 한국어로 */
export function friendlyAuthError(error) {
  const raw = error && (error.message || error.error_description || error.name) ? String(error.message || error.error_description || '') : String(error || '');
  const text = raw.toLowerCase();
  if (!raw) return '로그인에 실패했어요. 다시 시도해 주세요';
  if (text.indexOf('invalid login credentials') >= 0) return '이메일이나 비밀번호가 맞지 않아요';
  if (text.indexOf('email not confirmed') >= 0) return '메일함에서 인증 링크를 먼저 눌러 주세요';
  if (text.indexOf('user already registered') >= 0 || text.indexOf('already been registered') >= 0) return '이미 가입된 이메일이에요. 로그인해 주세요';
  if (text.indexOf('password should be') >= 0 || text.indexOf('password is too short') >= 0) return '비밀번호는 ' + MIN_PASSWORD_LENGTH + '자 이상으로 정해 주세요';
  if (text.indexOf('unable to validate email') >= 0 || text.indexOf('invalid email') >= 0) return '이메일 주소를 다시 확인해 주세요';
  if (text.indexOf('signups not allowed') >= 0 || text.indexOf('signup') >= 0 && text.indexOf('disabled') >= 0) return '지금은 이메일 회원가입이 꺼져 있어요 (Supabase 설정)';
  if (text.indexOf('provider is not enabled') >= 0 || text.indexOf('unsupported provider') >= 0 || text.indexOf('validation_failed') >= 0) return '이 로그인은 아직 서버에서 켜지지 않았어요 (Supabase → Authentication → Providers)';
  if (text.indexOf('for security purposes') >= 0 || text.indexOf('rate limit') >= 0 || text.indexOf('too many') >= 0) return '요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요';
  if (text.indexOf('failed to fetch') >= 0 || text.indexOf('network') >= 0 || text.indexOf('timeout') >= 0) return '네트워크가 불안정해요. 잠시 뒤 다시 시도해 주세요';
  return raw;
}

function guardClient() {
  if (!isSupabaseConfigured()) return null;
  try {
    return supabase();
  } catch (e) {
    return null;
  }
}

/** 이메일 + 비밀번호 로그인 */
export async function signInWithEmail(email, password) {
  const client = guardClient();
  if (!client) return { ...NOT_CONFIGURED };
  if (!isValidEmail(email)) return fail('invalid-email', '이메일 주소를 다시 확인해 주세요');
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    return fail('weak-password', '비밀번호는 ' + MIN_PASSWORD_LENGTH + '자 이상이에요');
  }
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password: String(password),
    });
    if (error) return { ok: false, error: error.code || error.name || 'auth-error', message: friendlyAuthError(error), status: error.status };
    return { ok: true, user: data && data.user, session: data && data.session };
  } catch (e) {
    return { ok: false, error: 'network', message: friendlyAuthError(e) };
  }
}

/** 이메일 + 비밀번호 회원가입 (서버 설정에 따라 인증 메일 발송) */
export async function signUpWithEmail(email, password) {
  const client = guardClient();
  if (!client) return { ...NOT_CONFIGURED };
  if (!isValidEmail(email)) return fail('invalid-email', '이메일 주소를 다시 확인해 주세요');
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    return fail('weak-password', '비밀번호는 ' + MIN_PASSWORD_LENGTH + '자 이상이에요');
  }
  try {
    const { data, error } = await client.auth.signUp({
      email: normalizeEmail(email),
      password: String(password),
      options: { emailRedirectTo: authRedirectUrl() },
    });
    if (error) return { ok: false, error: error.code || error.name || 'auth-error', message: friendlyAuthError(error) };
    return {
      ok: true,
      user: data && data.user,
      session: data && data.session,
      // 세션이 바로 없으면 '메일함에서 인증 링크를 눌러야' 로그인됩니다.
      needsEmailConfirm: !(data && data.session),
    };
  } catch (e) {
    return { ok: false, error: 'network', message: friendlyAuthError(e) };
  }
}

/** 비밀번호 없이 메일로 받는 로그인 링크(매직링크) */
export async function signInWithMagicLink(email) {
  const client = guardClient();
  if (!client) return { ...NOT_CONFIGURED };
  if (!isValidEmail(email)) return fail('invalid-email', '이메일 주소를 다시 확인해 주세요');
  try {
    const { error } = await client.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { emailRedirectTo: authRedirectUrl(), shouldCreateUser: true },
    });
    if (error) return { ok: false, error: error.code || error.name || 'auth-error', message: friendlyAuthError(error) };
    return { ok: true, email: normalizeEmail(email) };
  } catch (e) {
    return { ok: false, error: 'network', message: friendlyAuthError(e) };
  }
}

/**
 * 소셜 로그인 — `google` · `kakao` · `apple`.
 *   · 웹: Supabase 가 페이지를 그 Provider 로 넘깁니다. (`skipBrowserRedirect:false`)
 *   · 앱: 로그인 URL 만 받아 `Linking.openURL` 로 엽니다. (돌아올 때는 `reelpin://auth-callback`)
 *   · v2.20.1 — 준비 중(`pending`)인 Apple 은 **Supabase 를 부르지 않고** 안내만 돌려줍니다.
 */
export async function signInWithOAuth(provider, options = {}) {
  const client = guardClient();
  if (!client) return { ...NOT_CONFIGURED };
  const id = String(provider || '').toLowerCase();
  if (!OAUTH_PROVIDERS.some((p) => p.id === id)) return fail('unsupported-provider', '지원하지 않는 로그인이에요');
  if (!oauthProviderReady(id)) return fail('provider-pending', OAUTH_PENDING_MESSAGE);
  try {
    const web = typeof window !== 'undefined' && !!window;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: id,
      options: { redirectTo: options.redirectTo || authRedirectUrl(), skipBrowserRedirect: !web },
    });
    if (error) return { ok: false, error: error.code || error.name || 'auth-error', message: friendlyAuthError(error) };
    const url = data && data.url;
    if (!web && url) {
      try {
        await Linking.openURL(url);
      } catch (e) {
        return fail('open-failed', '로그인 창을 열지 못했어요. 브라우저에서 다시 시도해 주세요');
      }
    }
    return { ok: true, url, redirected: web };
  } catch (e) {
    return { ok: false, error: 'network', message: friendlyAuthError(e) };
  }
}

/** 로그아웃 — 기기 세션을 지웁니다. (기기에 저장된 핀은 그대로) */
export async function signOut() {
  const client = guardClient();
  if (!client) return { ...NOT_CONFIGURED, ok: true };
  try {
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, error: error.code || 'signout-error', message: friendlyAuthError(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'network', message: friendlyAuthError(e) };
  }
}

/** 저장된 세션 읽기 (앱을 다시 열었을 때) */
export async function getSession() {
  const client = guardClient();
  if (!client) return { ok: false, session: null, ...NOT_CONFIGURED };
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return { ok: false, session: null, message: friendlyAuthError(error) };
    return { ok: true, session: (data && data.session) || null };
  } catch (e) {
    return { ok: false, session: null, error: 'network', message: friendlyAuthError(e) };
  }
}

/** 로그인 상태 변화 구독 — 해제 함수를 돌려줍니다. (설정이 없으면 no-op) */
export function onAuthStateChange(callback) {
  const client = guardClient();
  if (!client || !callback) return () => {};
  try {
    const { data } = client.auth.onAuthStateChange((event, session) => {
      try {
        callback(event, session);
      } catch (e) {}
    });
    return () => {
      try {
        if (data && data.subscription) data.subscription.unsubscribe();
      } catch (e) {}
    };
  } catch (e) {
    return () => {};
  }
}

// ─────────────────────────────────────────────────────────────
// 3. 클라우드 핀 CRUD
// ─────────────────────────────────────────────────────────────
/** 클라우드에서 내 핀 모두 읽기 */
export async function fetchCloudPins(userId) {
  const client = guardClient();
  if (!client) return { ...NOT_CONFIGURED, pins: [] };
  if (!userId) return { ...fail('missing-user', '로그인이 필요해요'), pins: [] };
  try {
    const query = (columns) =>
      client
        .from(PIN_TABLE)
        .select(columns.join(','))
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    let { data, error } = await query(activePinColumns());
    // v2.10 — 새 컬럼(visited·memo)이 아직 없는 DB: 예전 컬럼으로 한 번만 다시 읽습니다.
    if (error && !legacySchema && isMissingColumnError(error)) {
      legacySchema = true;
      ({ data, error } = await query(PIN_COLUMNS_LEGACY));
    }
    if (error) return { ok: false, error: error.code || 'fetch-error', message: friendlyAuthError(error), pins: [] };
    return { ok: true, pins: rowsToPins(data), rows: Array.isArray(data) ? data : [], legacySchema };
  } catch (e) {
    return { ok: false, error: 'network', message: friendlyAuthError(e), pins: [] };
  }
}

/** 핀 하나 올리기 (없으면 넣고 있으면 갱신) */
export async function upsertCloudPin(userId, pin) {
  if (!userId || !pin) return fail('missing-arguments', '올릴 핀이 없어요');
  const result = await upsertCloudPins(userId, [pin]);
  if (!result.ok) return { ok: false, error: result.error, message: result.message };
  return { ok: true, row: result.rows && result.rows[0], count: result.count };
}

/** 핀 여러 개 올리기 — 큰 목록은 UPSERT_CHUNK 개씩 나눠 보냅니다. */
export async function upsertCloudPins(userId, pins) {
  const client = guardClient();
  if (!client) return { ...NOT_CONFIGURED, count: 0 };
  if (!userId) return { ...fail('missing-user', '로그인이 필요해요'), count: 0 };
  const list = (Array.isArray(pins) ? pins : [pins]).filter(Boolean);
  if (!list.length) return { ok: true, count: 0, rows: [] };
  const now = new Date();
  const rows = list.map((pin) => pinToRow(userId, pin, { now })).filter(Boolean);
  if (!rows.length) return { ok: true, count: 0, rows: [] };
  /** 새 컬럼이 없는 DB 에 보낼 행 — visited·memo 만 빼고 나머지는 그대로 */
  const stripNewColumns = (row) => {
    const copy = { ...row };
    delete copy.visited;
    delete copy.memo;
    return copy;
  };
  const saved = [];
  try {
    let payload = legacySchema ? rows.map(stripNewColumns) : rows;
    for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
      let chunk = payload.slice(i, i + UPSERT_CHUNK);
      let { data, error } = await client
        .from(PIN_TABLE)
        .upsert(chunk, { onConflict: 'user_id,id' })
        .select(activePinColumns().join(','));
      // v2.10 — 스키마에 visited·memo 가 없어도 저장은 되게: 한 번만 예전 모양으로 다시
      if (error && !legacySchema && isMissingColumnError(error)) {
        legacySchema = true;
        payload = rows.map(stripNewColumns);
        chunk = payload.slice(i, i + UPSERT_CHUNK);
        ({ data, error } = await client
          .from(PIN_TABLE)
          .upsert(chunk, { onConflict: 'user_id,id' })
          .select(PIN_COLUMNS_LEGACY.join(',')));
      }
      if (error) {
        return { ok: false, error: error.code || 'upsert-error', message: friendlyAuthError(error), count: saved.length, rows: saved };
      }
      if (Array.isArray(data)) saved.push(...data);
    }
    return { ok: true, count: saved.length || rows.length, rows: saved, legacySchema };
  } catch (e) {
    return { ok: false, error: 'network', message: friendlyAuthError(e), count: saved.length, rows: saved };
  }
}

/** 핀 하나 지우기 — 내 계정의 그 핀만 지웁니다. (user_id 조건 필수) */
export async function deleteCloudPin(userId, pinId) {
  const client = guardClient();
  if (!client) return { ...NOT_CONFIGURED };
  if (!userId || !pinId) return fail('missing-arguments', '지울 핀이 없어요');
  try {
    const { error } = await client.from(PIN_TABLE).delete().eq('user_id', userId).eq('id', String(pinId));
    if (error) return { ok: false, error: error.code || 'delete-error', message: friendlyAuthError(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'network', message: friendlyAuthError(e) };
  }
}

/** 클라우드에 저장된 내 핀 개수 (로그인 카드의 'N개 저장됨') */
export async function fetchCloudPinCount(userId) {
  const client = guardClient();
  if (!client) return { ...NOT_CONFIGURED, count: 0 };
  if (!userId) return { ...fail('missing-user', '로그인이 필요해요'), count: 0 };
  try {
    const { count, error } = await client
      .from(PIN_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) return { ok: false, error: error.code || 'count-error', message: friendlyAuthError(error), count: 0 };
    return { ok: true, count: Number(count) || 0 };
  } catch (e) {
    return { ok: false, error: 'network', message: friendlyAuthError(e), count: 0 };
  }
}

/**
 * 로그인 직후 한 번에 하는 일 — 클라우드 핀을 읽어 로컬과 병합하고, 빠진 핀을 올립니다.
 * 실패해도 로컬 핀은 그대로입니다.
 */
export async function syncPinsWithCloud(userId, localPins) {
  const fetched = await fetchCloudPins(userId);
  if (!fetched.ok) return { ok: false, error: fetched.error, message: fetched.message, pins: null, uploaded: 0 };
  const plan = planCloudSync(localPins, fetched.pins);
  let uploaded = 0;
  if (plan.toUpload.length) {
    const pushed = await upsertCloudPins(userId, plan.toUpload);
    uploaded = pushed.ok ? plan.toUpload.length : 0;
    if (!pushed.ok) {
      return { ok: true, pins: plan.merged, uploaded: 0, cloudCount: fetched.pins.length, warning: pushed.message };
    }
  }
  return { ok: true, pins: plan.merged, uploaded, cloudCount: Math.max(fetched.pins.length, plan.merged.length) };
}
