/**
 * test/cloud-test.mjs
 * ─────────────────────────────────────────────────────────────
 * v2.1 — Supabase 로그인 + 클라우드 핀 동기화 테스트.
 *
 *   · `supabase/schema.sql`     … 테이블·컬럼·PK·RLS 정책이 요구사항대로인지 (파일 텍스트 검사)
 *   · `api/auth-config.js`      … 공개 설정만 돌려주기 / service_role 키는 절대 응답에 없음
 *   · `src/services/supabase.js`… 환경변수·서버설정 해석, 미설정 폴백, SSR(window 없음) 안전, 싱글턴
 *   · `src/services/cloudSync.js`… 핀↔행 변환, 로컬·클라우드 병합, 로그인 함수, CRUD 쿼리 모양
 *
 * 네트워크는 globalThis.fetch 스텁, Supabase 클라이언트는 가짜 객체로 대체합니다.
 * (실제 Supabase 에는 붙지 않습니다 — 이 테스트는 '구조'만 검사합니다)
 */
import fs from 'node:fs';
import path from 'node:path';
import authConfigHandler from '../api/auth-config.js';
import {
  AUTH_CONFIG_ENDPOINT,
  NATIVE_AUTH_CONFIG_ENDPOINT,
  SESSION_STORAGE_KEY,
  __setSupabaseClient,
  authRedirectUrl,
  getSupabaseClient,
  isBrowser,
  isSupabaseConfigured,
  loadSupabaseConfig,
  looksLikeAnonKey,
  normalizeSupabaseUrl,
  readEnvConfig,
  resetSupabaseConfigCache,
  resolveSupabaseConfig,
  setSupabaseConfig,
  supabaseAuthStorage,
} from '../src/services/supabase.js';
import { API_ORIGIN, apiUrl, isNativeRuntime } from '../src/utils/apiOrigin.js';
import {
  MIN_PASSWORD_LENGTH,
  OAUTH_PROVIDERS,
  PIN_COLUMNS,
  PIN_TABLE,
  UPSERT_CHUNK,
  deleteCloudPin,
  fetchCloudPinCount,
  fetchCloudPins,
  friendlyAuthError,
  getSession,
  isValidEmail,
  isCloudAvailable,
  mergeLocalAndCloudPins,
  normalizeEmail,
  onAuthStateChange,
  pinToRow,
  planCloudSync,
  rowToPin,
  rowsToPins,
  signInWithEmail,
  signInWithMagicLink,
  signInWithOAuth,
  signOut,
  signUpWithEmail,
  syncPinsWithCloud,
  upsertCloudPin,
  upsertCloudPins,
} from '../src/services/cloudSync.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails++;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
};

const root = process.cwd();
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2VydmljZS1yb2xlLXNpZ25hdHVyZQ';

// 환경변수를 지웠다 세팅했다 하는 도우미
const clearEnv = () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  setSupabaseConfig(null);
  resetSupabaseConfigCache();
};
clearEnv();

// ─────────────────────────────────────────────────────────────
// 1. supabase/schema.sql
// ─────────────────────────────────────────────────────────────
const schema = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
const schemaLower = schema.toLowerCase();
const REQUIRED_COLUMNS = [
  ['id', 'text'],
  ['user_id', 'uuid'],
  ['name', 'text'],
  ['category', 'text'],
  ['area', 'text'],
  ['lat', 'double precision'],
  ['lng', 'double precision'],
  ['note', 'text'],
  ['source_url', 'text'],
  ['platform', 'text'],
  ['place_url', 'text'],
  ['naver_place_id', 'text'],
  ['phone', 'text'],
  ['address', 'text'],
  ['providers', 'jsonb'],
  ['menu_tags', 'jsonb'],
  ['created_at', 'timestamptz'],
  ['updated_at', 'timestamptz'],
];
check('스키마: public.pins 테이블 생성', /create table if not exists public\.pins/.test(schemaLower));
check(
  '스키마: 요구 컬럼 18개 (이름+타입)',
  REQUIRED_COLUMNS.every(([name, type]) => new RegExp('\\b' + name + '\\s+' + type.replace(' ', '\\s+')).test(schemaLower)),
  REQUIRED_COLUMNS.filter(([n, t]) => !new RegExp('\\b' + n + '\\s+' + t.replace(' ', '\\s+')).test(schemaLower)).map((r) => r[0]).join(',')
);
check('스키마: user_id → auth.users 참조', /user_id\s+uuid\s+not null references auth\.users/.test(schemaLower));
check('스키마: 기본키 (user_id, id)', /primary key \(user_id, id\)/.test(schemaLower));
check('스키마: RLS 활성화', /alter table public\.pins enable row level security/.test(schemaLower));
const policyChecks = [
  ['select 정책', /create policy pins_select_own[\s\S]{0,120}for select using \(auth\.uid\(\) = user_id\)/],
  ['insert 정책(with check)', /create policy pins_insert_own[\s\S]{0,120}for insert with check \(auth\.uid\(\) = user_id\)/],
  ['update 정책(using + with check)', /create policy pins_update_own[\s\S]{0,160}for update using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/],
  ['delete 정책', /create policy pins_delete_own[\s\S]{0,120}for delete using \(auth\.uid\(\) = user_id\)/],
];
for (const [label, re] of policyChecks) check('스키마: ' + label, re.test(schemaLower));
check('스키마: 4개 정책 모두 있음', (schemaLower.match(/create policy /g) || []).length === 4, String((schemaLower.match(/create policy /g) || []).length));
check('스키마: anon 권한 회수 · authenticated 만 허용', /revoke all on public\.pins from anon/.test(schemaLower) && /grant select, insert, update, delete on public\.pins to authenticated/.test(schemaLower));
check('스키마: updated_at 자동 갱신 트리거', /create trigger pins_touch_updated_at/.test(schemaLower) && /before update on public\.pins/.test(schemaLower));
check('스키마: 목록 인덱스 (user_id, created_at desc)', /create index if not exists pins_user_created_idx/.test(schemaLower));
check('스키마: service_role 키를 쓰지 않음', schemaLower.indexOf('service_role') < 0 || schemaLower.indexOf('service_role 키는') >= 0, 'service_role 언급');
check('스키마: 다시 실행해도 안전(drop policy if exists)', (schemaLower.match(/drop policy if exists/g) || []).length === 4);

// ─────────────────────────────────────────────────────────────
// 2. api/auth-config.js — 공개 설정만, service_role 금지
// ─────────────────────────────────────────────────────────────
function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(n, v) {
      this.headers[String(n).toLowerCase()] = String(v);
    },
    end(chunk) {
      if (chunk != null) this.body = String(chunk);
    },
    json() {
      try {
        return JSON.parse(this.body || 'null');
      } catch (e) {
        return null;
      }
    },
  };
}
async function callAuthConfig(method = 'GET', env) {
  authConfigHandler.env = env;
  const res = makeRes();
  await authConfigHandler({ method }, res);
  authConfigHandler.env = undefined;
  return { status: res.statusCode, body: res.json(), raw: res.body, headers: res.headers };
}

const okConfig = await callAuthConfig('GET', { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
check('api/auth-config: 200 + url/anonKey', okConfig.status === 200 && okConfig.body.url === 'https://demo.supabase.co' && okConfig.body.anonKey === ANON, JSON.stringify(okConfig.body));
check('api/auth-config: 별칭(supabaseUrl·supabaseAnonKey·SUPABASE_URL)도 함께', okConfig.body.supabaseUrl === 'https://demo.supabase.co' && okConfig.body.SUPABASE_ANON_KEY === ANON);
check('api/auth-config: service_role 키는 응답에 없음', okConfig.raw.indexOf(SERVICE) < 0 && okConfig.raw.toLowerCase().indexOf('service_role') < 0, okConfig.raw.slice(0, 80));
check('api/auth-config: 5분 캐시(s-maxage)', /s-maxage=300/.test(String(okConfig.headers['cache-control'])), String(okConfig.headers['cache-control']));

const envFallback = await callAuthConfig('GET', { EXPO_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co/', EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON });
check('api/auth-config: EXPO_PUBLIC_ 이름도 읽고, 끝 슬래시 제거', envFallback.status === 200 && envFallback.body.url === 'https://demo.supabase.co', JSON.stringify(envFallback.body));

const missing = await callAuthConfig('GET', {});
check('api/auth-config: 키 없으면 503 + no-store', missing.status === 503 && missing.body.error === 'supabase-not-configured' && /no-store/.test(String(missing.headers['cache-control'])), JSON.stringify(missing.body));

const onlyService = await callAuthConfig('GET', { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_SERVICE_ROLE_KEY: SERVICE });
check('api/auth-config: service_role 만 있으면 503 (anon 없음)', onlyService.status === 503 && onlyService.raw.indexOf(SERVICE) < 0);

const serviceInAnonSlot = await callAuthConfig('GET', { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: SERVICE, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
check('api/auth-config: anon 자리에 service_role 값이면 거부', serviceInAnonSlot.status === 503 && serviceInAnonSlot.raw.indexOf(SERVICE) < 0, JSON.stringify(serviceInAnonSlot.body));

const secretKey = await callAuthConfig('GET', { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: 'sb_secret_abcdefghijklmnop1234' });
check('api/auth-config: sb_secret_ 키는 거부', secretKey.status === 503);

const badUrl = await callAuthConfig('GET', { SUPABASE_URL: 'ftp://demo.supabase.co', SUPABASE_ANON_KEY: ANON });
check('api/auth-config: http(s) 아닌 주소는 거부', badUrl.status === 503);

const notGet = await callAuthConfig('POST', { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: ANON });
check('api/auth-config: POST → 405', notGet.status === 405 && notGet.body.error === 'method-not-allowed');

const publishable = await callAuthConfig('GET', { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_AbCdEf1234567890' });
check('api/auth-config: 새 publishable 키 허용', publishable.status === 200 && publishable.body.anonKey === 'sb_publishable_AbCdEf1234567890');

// ─────────────────────────────────────────────────────────────
// 3. services/supabase.js — 설정 해석 · 미설정 폴백 · SSR 안전
// ─────────────────────────────────────────────────────────────
check('설정: 아무 것도 없으면 미설정 (로컬 전용)', isSupabaseConfigured() === false && resolveSupabaseConfig().source === 'none');
check('설정: 미설정에서도 클라이언트는 null (크래시 없음)', getSupabaseClient() === null);
check('설정: SSR(Node)에서는 window 가 없고 isBrowser() false', typeof window === 'undefined' && isBrowser() === false);
check('설정: env 읽기 기본값은 빈 문자열', readEnvConfig().url === '' && readEnvConfig().anonKey === '');

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON;
check('설정: 환경변수 있으면 configured true · source env', isSupabaseConfigured() === true && resolveSupabaseConfig().source === 'env');
const envClient = getSupabaseClient();
check('설정: 클라이언트 생성 (from·auth 존재)', !!envClient && typeof envClient.from === 'function' && typeof envClient.auth.signInWithPassword === 'function');
check('설정: 같은 설정이면 싱글턴 재사용', getSupabaseClient() === envClient);
check('설정: isCloudAvailable true', isCloudAvailable() === true);

process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';
check('설정: 키가 비면 미설정으로 돌아감', isSupabaseConfigured() === false && getSupabaseClient() === null);
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON;

check('URL 정리: 끝 슬래시 제거', normalizeSupabaseUrl('https://demo.supabase.co/') === 'https://demo.supabase.co');
check('URL 정리: http 아닌 값 거부', normalizeSupabaseUrl('ftp://demo.supabase.co') === '' && normalizeSupabaseUrl('demo.supabase.co') === '');
check('URL 정리: 공백·빈 값', normalizeSupabaseUrl('   ') === '' && normalizeSupabaseUrl(null) === '');
check('키 모양: JWT anon 허용', looksLikeAnonKey(ANON) === true);
check('키 모양: publishable 허용', looksLikeAnonKey('sb_publishable_abc123') === true);
check('키 모양: 짧은 문자열 거부', looksLikeAnonKey('abc') === false && looksLikeAnonKey('') === false);
check('키 모양: 공백 포함 거부', looksLikeAnonKey('eyJhbGciOiJIUzI1NiJ9.abc def.ghi') === false);

check('세션 키: reelpin 전용 키 사용', SESSION_STORAGE_KEY === 'reelpin.auth.session');
check('설정 엔드포인트: 같은 출처 /api/auth-config', AUTH_CONFIG_ENDPOINT === '/api/auth-config');

// v2.40.2 — Expo 의 EXPO_PUBLIC_ 치환은 **정적 접근**에만 동작합니다. `env.EXPO_PUBLIC_…` 로 읽으면
// 네이티브 번들에 값이 박히지 않아(빌드 18 에서 실제로 겪음) 기기에서 설정이 비어 보입니다.
const supabaseSource = fs
  .readFileSync(path.join(root, 'src/services/supabase.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
check(
  '설정: EXPO_PUBLIC_ 를 정적 접근으로 읽는다(번들에 값이 박히게)',
  /process\.env\.EXPO_PUBLIC_SUPABASE_URL/.test(supabaseSource) &&
    /process\.env\.EXPO_PUBLIC_SUPABASE_ANON_KEY/.test(supabaseSource) &&
    !/[^.\w]env\.EXPO_PUBLIC_SUPABASE_URL/.test(supabaseSource) &&
    !/[^.\w]env\.EXPO_PUBLIC_SUPABASE_ANON_KEY/.test(supabaseSource)
);

// 세션 저장소 — SSR(AsyncStorage 없음)에서도 예외 없이 메모리 폴백
await supabaseAuthStorage.setItem('k', 'v1');
check('저장소: set/get', (await supabaseAuthStorage.getItem('k')) === 'v1');
await supabaseAuthStorage.removeItem('k');
check('저장소: remove 후 null', (await supabaseAuthStorage.getItem('k')) === null);

/**
 * SSR/앱(비브라우저)에서는 서버 설정을 조회하지 않음
 *   → 이 시점에 환경변수가 남아 있으면 'env' 로 성공하기 때문에 먼저 지웁니다.
 */
clearEnv();
const notWeb = await loadSupabaseConfig();
check('서버설정: 비브라우저에서는 요청하지 않음 (not-web)', notWeb.ok === false && notWeb.reason === 'not-web');

// 브라우저 흉내 — window 를 잠깐 세우고 /api/auth-config 조회 경로를 검사
const fetchCalls = [];
const realFetch = globalThis.fetch;
globalThis.window = { document: {}, location: { origin: 'https://reelpin.vercel.app' } };
try {
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({ url: 'https://demo.supabase.co', anonKey: ANON }) };
  };
  clearEnv();
  check('브라우저 판정: window 가 있으면 isBrowser true', isBrowser() === true);
  check('리다이렉트 주소: 웹은 현재 origin 루트', authRedirectUrl() === 'https://reelpin.vercel.app/');
  const loaded = await loadSupabaseConfig();
  check('서버설정: /api/auth-config 로 받아 옴', loaded.ok === true && loaded.source === 'server' && fetchCalls.length === 1, JSON.stringify(fetchCalls.map((c) => c.url)));
  check('서버설정: 요청은 GET + 같은 출처', fetchCalls[0].url === '/api/auth-config' && (!fetchCalls[0].init || fetchCalls[0].init.method === 'GET'), fetchCalls[0].url);
  check('서버설정: 받은 값으로 configured true', isSupabaseConfigured() === true);
  const cachedLoad = await loadSupabaseConfig();
  check('서버설정: 두 번째 호출은 캐시 사용 (네트워크 1회)', cachedLoad.ok === true && fetchCalls.length === 1, String(fetchCalls.length));

  // 503 → 실패로 처리하고 미설정 유지
  clearEnv();
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'supabase-not-configured' }) });
  const bad = await loadSupabaseConfig();
  check('서버설정: 503 이면 실패(미설정 유지)', bad.ok === false && bad.reason === 'http-503' && isSupabaseConfigured() === false);

  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  clearEnv();
  const thrown = await loadSupabaseConfig();
  check('서버설정: 네트워크 예외도 조용히 실패', thrown.ok === false && thrown.reason === 'network');

  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ url: 'https://demo.supabase.co' }) });
  clearEnv();
  const incomplete = await loadSupabaseConfig();
  check('서버설정: 키가 빠진 응답은 거부', incomplete.ok === false && incomplete.reason === 'incomplete');
} finally {
  globalThis.fetch = realFetch;
  delete globalThis.window;
  clearEnv();
}
check('SSR 복귀: window 삭제 후 isBrowser false', isBrowser() === false);
check('SSR 복귀: 앱 리다이렉트는 reelpin:// 스킴', authRedirectUrl() === 'reelpin://auth-callback');

// ── v2.40.1 · 네이티브(iOS·Android) — 같은 출처가 없어도 **절대 주소**로 설정을 받아 옵니다 ──
{
  const nativeCalls = [];
  const keepFetch = globalThis.fetch;
  // React Native 는 전역 navigator.product 를 'ReactNative' 로 둡니다. (node 의 navigator 는 읽기 전용이라 defineProperty)
  Object.defineProperty(globalThis, 'navigator', { value: { product: 'ReactNative' }, configurable: true, writable: true });
  try {
    globalThis.fetch = async (url) => {
      nativeCalls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ url: 'https://demo.supabase.co', anonKey: ANON }) };
    };
    clearEnv();
    resetSupabaseConfigCache();
    check('네이티브 판정: navigator.product=ReactNative 면 true (window 없음)', isNativeRuntime() === true && isBrowser() === false);
    check(
      '네이티브 주소: /api/auth-config → https://reelpin.vercel.app/api/auth-config',
      NATIVE_AUTH_CONFIG_ENDPOINT === 'https://reelpin.vercel.app/api/auth-config' &&
        apiUrl('/api/reverse-place') === API_ORIGIN + '/api/reverse-place'
    );
    const nativeLoad = await loadSupabaseConfig();
    check(
      '네이티브 설정: 절대 주소로 받아 옴',
      nativeCalls.length === 1 && nativeCalls[0] === NATIVE_AUTH_CONFIG_ENDPOINT,
      JSON.stringify(nativeCalls)
    );
    check('네이티브 설정: 받은 값으로 configured true', nativeLoad.ok === true && nativeLoad.source === 'server' && isSupabaseConfigured() === true);
  } finally {
    globalThis.fetch = keepFetch;
    delete globalThis.navigator;
    resetSupabaseConfigCache();
    clearEnv();
  }
  check('네이티브 아닌 SSR: 다시 not-web (fetch 안 부름)', (await loadSupabaseConfig()).reason === 'not-web');
}

// ─────────────────────────────────────────────────────────────
// 4. 핀 ↔ DB 행 변환
// ─────────────────────────────────────────────────────────────
const USER = '11111111-2222-3333-4444-555555555555';
const LOCAL_PIN = {
  id: 'pin-1699999999999',
  name: '베통 성수',
  area: '성수동',
  category: '카페',
  menuTags: ['소금빵', '크루아상'],
  address: '서울특별시 성동구 연무장7가길 8',
  lat: 37.5429356,
  lng: 127.0552214,
  placeUrl: 'https://place.map.kakao.com/12345',
  placeUrlLabel: '카카오맵',
  phone: '02-123-4567',
  naverPlaceId: '1736095566',
  providers: ['kakao', 'naver'],
  confidence: 0.92,
  sourceUrl: 'https://www.instagram.com/reel/xyz/',
  platform: 'instagram',
  note: '웨이팅 있음',
  createdAt: '2026-11-15T01:00:00.000Z',
};

const row = pinToRow(USER, LOCAL_PIN, { now: '2026-11-15T02:00:00.000Z' });
check('변환: user_id 포함', row.user_id === USER);
check('변환: snake_case 컬럼', row.source_url === LOCAL_PIN.sourceUrl && row.place_url === LOCAL_PIN.placeUrl && row.naver_place_id === '1736095566' && row.menu_tags.length === 2, JSON.stringify(row));
check('변환: providers/menu_tags 는 jsonb 배열', Array.isArray(row.providers) && row.providers[0] === 'kakao' && Array.isArray(row.menu_tags));
check('변환: created_at 유지 · updated_at 갱신', row.created_at === '2026-11-15T01:00:00.000Z' && row.updated_at === '2026-11-15T02:00:00.000Z');
check('변환: 스키마에 없는 필드(placeUrlLabel·confidence)는 보내지 않음', !('placeUrlLabel' in row) && !('confidence' in row));
check('변환: user 없으면 null', pinToRow('', LOCAL_PIN) === null);
check('변환: 이름 없으면 null', pinToRow(USER, { id: 'x' }) === null);
const sparse = pinToRow(USER, { id: 'pin-1', name: '이름만' });
check('변환: 빈 값 기본값 채움', sparse.area === '' && sparse.category === '맛집' && sparse.address === '' && Array.isArray(sparse.providers) && sparse.naver_place_id === null);
check('변환: 좌표가 숫자가 아니면 null', pinToRow(USER, { id: 'p', name: 'n', lat: 'abc', lng: null }).lat === null);

const back = rowToPin(row);
check('역변환: camelCase 복원', back.name === '베통 성수' && back.sourceUrl === LOCAL_PIN.sourceUrl && back.placeUrl === LOCAL_PIN.placeUrl && back.naverPlaceId === '1736095566' && back.phone === '02-123-4567');
check('역변환: 배열 복원', back.providers.join(',') === 'kakao,naver' && back.menuTags.length === 2);
check('역변환: 없는 필드 기본값', back.placeUrlLabel === '' && back.confidence === null);
check('역변환: 이름 없는 행은 버림', rowToPin({ id: 'x' }) === null && rowToPin(null) === null);
check('역변환: rowsToPins 는 깨진 행을 걸러냄', rowsToPins([row, { id: 'bad' }, null]).length === 1);
const roundtrip = rowToPin(pinToRow(USER, LOCAL_PIN));
check(
  '왕복: 핵심 필드 유지',
  roundtrip.id === LOCAL_PIN.id && roundtrip.name === LOCAL_PIN.name && roundtrip.lat === LOCAL_PIN.lat && roundtrip.lng === LOCAL_PIN.lng && roundtrip.note === LOCAL_PIN.note,
  JSON.stringify(roundtrip)
);

// ─────────────────────────────────────────────────────────────
// 5. 로컬 + 클라우드 병합
// ─────────────────────────────────────────────────────────────
const cloudOnly = { ...LOCAL_PIN, id: 'pin-cloud-1', name: '클라우드만', naverPlaceId: '', placeUrl: '', lat: 35.1, lng: 129.1 };
const localOnly = { ...LOCAL_PIN, id: 'pin-local-1', name: '로컬만', naverPlaceId: '', placeUrl: '', lat: 33.1, lng: 126.1 };

check('병합: 빈 로컬 + 클라우드 → 클라우드', mergeLocalAndCloudPins([], [cloudOnly]).length === 1);
check('병합: 로컬 + 빈 클라우드 → 로컬', mergeLocalAndCloudPins([localOnly], []).length === 1);
check('병합: 둘 다 없으면 빈 배열', mergeLocalAndCloudPins(null, undefined).length === 0);
check('병합: 서로 다른 곳은 모두 유지', mergeLocalAndCloudPins([localOnly], [cloudOnly]).length === 2);

// 같은 id — 로컬이 더 최근
const olderCloud = { ...LOCAL_PIN, note: '예전 메모', createdAt: '2026-11-14T00:00:00.000Z' };
const newerLocal = { ...LOCAL_PIN, note: '새 메모', createdAt: '2026-11-15T00:00:00.000Z' };
const sameId = mergeLocalAndCloudPins([newerLocal], [olderCloud]);
check('병합: 같은 id 는 하나로', sameId.length === 1, String(sameId.length));
check('병합: 같은 id — 더 최근 로컬 값 유지', sameId[0].note === '새 메모', sameId[0].note);
const cloudNewer = mergeLocalAndCloudPins([olderCloud], [newerLocal]);
check('병합: 같은 id — 클라우드가 더 최근이면 클라우드 값', cloudNewer[0].note === '새 메모');

// 다른 id, 같은 장소 (네이버 placeId)
const dupCloud = { ...LOCAL_PIN, id: 'pin-cloud-dup', name: '베통 성수', createdAt: '2026-11-10T00:00:00.000Z' };
const dupLocal = { ...LOCAL_PIN, id: 'pin-local-dup', createdAt: '2026-11-15T00:00:00.000Z' };
const placeDedup = mergeLocalAndCloudPins([dupLocal], [dupCloud]);
check('병합: placeId 같은 곳은 한 개', placeDedup.length === 1, String(placeDedup.length));
check('병합: 같은 곳은 클라우드 id 유지 (기기마다 같은 핀)', placeDedup[0].id === 'pin-cloud-dup', placeDedup[0].id);

// 이름 + 200m 이내
const nearCloud = { ...LOCAL_PIN, id: 'pin-near-cloud', naverPlaceId: '', placeUrl: '', lat: 37.54295, lng: 127.05523 };
const nearLocal = { ...LOCAL_PIN, id: 'pin-near-local', naverPlaceId: '', placeUrl: '', lat: 37.5435, lng: 127.0556 };
check('병합: 이름 같고 200m 안이면 한 개', mergeLocalAndCloudPins([nearLocal], [nearCloud]).length === 1);
const farLocal = { ...nearLocal, lat: 37.6, lng: 127.1 };
check('병합: 이름 같아도 멀면 두 개', mergeLocalAndCloudPins([farLocal], [nearCloud]).length === 2);

// 같은 id 이면서 동시에 '같은 장소' 판정이 겹치지 않는지 (3개 → 2개)
const mixed = mergeLocalAndCloudPins([localOnly, newerLocal, farLocal], [cloudOnly, olderCloud]);
check('병합: 섞인 목록에서 중복 없음', mixed.length === 4, String(mixed.length));

const sorted = mergeLocalAndCloudPins(
  [{ ...localOnly, createdAt: '2026-11-13T00:00:00.000Z' }, { ...farLocal, createdAt: '2026-11-15T05:00:00.000Z' }],
  [{ ...cloudOnly, createdAt: '2026-11-14T00:00:00.000Z' }]
);
check('병합: 최근 저장 순 정렬', sorted[0].createdAt === '2026-11-15T05:00:00.000Z' && sorted[2].createdAt === '2026-11-13T00:00:00.000Z', JSON.stringify(sorted.map((p) => p.createdAt)));
check('병합: 입력 배열을 바꾸지 않음', newerLocal.note === '새 메모' && olderCloud.note === '예전 메모');

const plan = planCloudSync([localOnly, newerLocal], [cloudOnly, olderCloud]);
check('동기화 계획: 병합 결과 사용', plan.merged.length === 3, String(plan.merged.length));
check('동기화 계획: 클라우드에 없는 로컬 핀만 올림', plan.toUpload.some((p) => p.id === 'pin-local-1') && !plan.toUpload.some((p) => p.id === 'pin-cloud-1'));
check('동기화 계획: 로컬이 더 최근인 핀도 올림', plan.toUpload.some((p) => p.id === newerLocal.id));
check('동기화 계획: 클라우드 개수 보고', plan.cloudCount === 2, String(plan.cloudCount));
check('동기화 계획: 클라우드 핀을 지우지 않음', Array.isArray(plan.toUpload) && !('toDelete' in plan));

// ─────────────────────────────────────────────────────────────
// 6. 미설정 폴백 — 네트워크를 타지 않는다
// ─────────────────────────────────────────────────────────────
let networkCalls = 0;
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkCalls++;
  return { ok: true, status: 200, json: async () => ({}) };
};
const unconfiguredResults = [
  ['로그인', await signInWithEmail('a@b.com', 'secret12')],
  ['회원가입', await signUpWithEmail('a@b.com', 'secret12')],
  ['매직링크', await signInWithMagicLink('a@b.com')],
  ['소셜 로그인', await signInWithOAuth('kakao')],
  ['핀 읽기', await fetchCloudPins(USER)],
  ['핀 올리기', await upsertCloudPin(USER, LOCAL_PIN)],
  ['핀 여러 개', await upsertCloudPins(USER, [LOCAL_PIN])],
  ['핀 지우기', await deleteCloudPin(USER, 'pin-1')],
  ['세션 읽기', await getSession()],
  ['개수 세기', await fetchCloudPinCount(USER)],
  ['전체 동기화', await syncPinsWithCloud(USER, [LOCAL_PIN])],
];
check('미설정: 모든 함수가 not-configured 로 실패', unconfiguredResults.every(([, r]) => r.ok === false && r.error === 'not-configured'), unconfiguredResults.filter(([, r]) => r.error !== 'not-configured').map(([n]) => n).join(','));
check('미설정: 사용자에게 보일 안내 문구가 있음', typeof unconfiguredResults[0][1].message === 'string' && unconfiguredResults[0][1].message.length > 5);
check('미설정: 핀 읽기는 빈 배열 (화면이 깨지지 않게)', Array.isArray(unconfiguredResults[4][1].pins) && unconfiguredResults[4][1].pins.length === 0);
check('미설정: 네트워크 요청 0건', networkCalls === 0, String(networkCalls));
const unconfiguredSignOut = await signOut();
check('미설정: 로그아웃은 조용히 성공(크래시 없음)', unconfiguredSignOut.ok === true);
check('미설정: 인증 구독 해제 함수는 no-op', typeof onAuthStateChange(() => {}) === 'function');
globalThis.fetch = savedFetch;

// ─────────────────────────────────────────────────────────────
// 7. 가짜 클라이언트 — 로그인 함수 · CRUD 쿼리 모양
// ─────────────────────────────────────────────────────────────
function makeBuilder(calls, result) {
  const b = {};
  const rec = (name) => (...args) => {
    calls.push([name, ...args]);
    return b;
  };
  b.select = rec('select');
  b.eq = rec('eq');
  b.order = rec('order');
  b.limit = rec('limit');
  b.delete = rec('delete');
  b.upsert = rec('upsert');
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return b;
}
function makeClient(options = {}) {
  const calls = [];
  const results = options.results || {};
  const client = {
    calls,
    from(table) {
      calls.push(['from', table]);
      return makeBuilder(calls, results[table] || { data: [], error: null, count: 0 });
    },
    auth: {
      signInWithPassword: async (args) => {
        calls.push(['auth.signInWithPassword', args]);
        return options.signIn || { data: { user: { id: USER, email: args.email }, session: { user: { id: USER }, access_token: 't' } }, error: null };
      },
      signUp: async (args) => {
        calls.push(['auth.signUp', args]);
        return options.signUp || { data: { user: { id: USER, email: args.email }, session: null }, error: null };
      },
      signInWithOtp: async (args) => {
        calls.push(['auth.signInWithOtp', args]);
        return options.otp || { data: {}, error: null };
      },
      signInWithOAuth: async (args) => {
        calls.push(['auth.signInWithOAuth', args]);
        return (
          options.oauth || {
            data: { url: 'https://demo.supabase.co/oauth?provider=' + String(args.provider), provider: args.provider },
            error: null,
          }
        );
      },
      // v2.40.0 빌드 21 — 네이티브 OAuth 는 돌아온 `?code=…` 를 세션으로 바꿉니다.
      exchangeCodeForSession: async (code) => {
        calls.push(['auth.exchangeCodeForSession', code]);
        return options.exchange || { data: { session: { user: { id: USER, email: 'andy@b.com' }, access_token: 't2' } }, error: null };
      },
      signOut: async () => {
        calls.push(['auth.signOut']);
        return { error: null };
      },
      getSession: async () => {
        calls.push(['auth.getSession']);
        return options.session || { data: { session: null }, error: null };
      },
      onAuthStateChange: (cb) => {
        calls.push(['auth.onAuthStateChange']);
        options.onAuthStateChange && options.onAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: () => calls.push(['auth.unsubscribe']) } } };
      },
    },
  };
  return client;
}

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON;

const client = makeClient();
__setSupabaseClient(client);
check('가짜 클라이언트: isCloudAvailable true', isCloudAvailable() === true);

const signedIn = await signInWithEmail('  Andy.Lee@Example.COM ', 'secret12');
const signInCall = client.calls.find((c) => c[0] === 'auth.signInWithPassword');
check('로그인: 이메일 소문자·공백 정리', signInCall && signInCall[1].email === 'andy.lee@example.com', signInCall && signInCall[1].email);
check('로그인: 성공 시 session 반환', signedIn.ok === true && signedIn.session.user.id === USER);
check('로그인: 잘못된 이메일은 요청 전에 거름', (await signInWithEmail('not-an-email', 'secret12')).error === 'invalid-email');
check('로그인: 짧은 비밀번호 거름', (await signInWithEmail('a@b.com', '123')).error === 'weak-password');

const badLoginClient = makeClient({ signIn: { data: {}, error: { message: 'Invalid login credentials', status: 400 } } });
__setSupabaseClient(badLoginClient);
const badLogin = await signInWithEmail('a@b.com', 'secret12');
check('로그인 실패: 한국어 안내', badLogin.ok === false && badLogin.message === '이메일이나 비밀번호가 맞지 않아요', badLogin.message);

const signUpClient = makeClient();
__setSupabaseClient(signUpClient);
const signedUp = await signUpWithEmail('new@b.com', 'secret12');
const signUpCall = signUpClient.calls.find((c) => c[0] === 'auth.signUp');
check('회원가입: emailRedirectTo 전달', signUpCall && typeof signUpCall[1].options.emailRedirectTo === 'string' && signUpCall[1].options.emailRedirectTo.length > 0);
check('회원가입: 세션 없으면 needsEmailConfirm', signedUp.ok === true && signedUp.needsEmailConfirm === true);
const dupClient = makeClient({ signUp: { data: {}, error: { message: 'User already registered' } } });
__setSupabaseClient(dupClient);
check('회원가입 실패: 이미 가입 안내', (await signUpWithEmail('a@b.com', 'secret12')).message === '이미 가입된 이메일이에요. 로그인해 주세요');

const otpClient = makeClient();
__setSupabaseClient(otpClient);
const magic = await signInWithMagicLink('andy@b.com');
const otpCall = otpClient.calls.find((c) => c[0] === 'auth.signInWithOtp');
check('매직링크: signInWithOtp + emailRedirectTo', magic.ok === true && otpCall && otpCall[1].email === 'andy@b.com' && !!otpCall[1].options.emailRedirectTo);
check('매직링크: shouldCreateUser 허용', otpCall && otpCall[1].options.shouldCreateUser === true);

// v2.40.0 빌드 21 — node 에는 window 가 없어 **네이티브 경로**로 들어갑니다.
// 인증 세션 스텁이 '사용자가 로그인을 마치고 돌아옴' 을 돌려주게 둡니다.
const oauthStub = (globalThis.__expoWebBrowserStub =
  globalThis.__expoWebBrowserStub || { calls: [], next: null });
oauthStub.calls.length = 0;
oauthStub.next = { type: 'success', url: 'reelpin://auth-callback?code=E2E-CODE' };

const oauthClient = makeClient();
__setSupabaseClient(oauthClient);
const kakao = await signInWithOAuth('kakao');
const oauthCall = oauthClient.calls.find((c) => c[0] === 'auth.signInWithOAuth');
check('소셜: 카카오 provider 전달', kakao.ok === true && oauthCall && oauthCall[1].provider === 'kakao');
check('소셜: 네이티브에서는 직접 리다이렉트하지 않음(skipBrowserRedirect)', oauthCall && oauthCall[1].options.skipBrowserRedirect === true);
check('소셜: 지원하지 않는 provider 거름', (await signInWithOAuth('naver')).error === 'unsupported-provider');
check('소셜: 3개 provider (카카오·구글·Apple)', OAUTH_PROVIDERS.map((p) => p.id).join(',') === 'kakao,google,apple');
check(
  '소셜: 카카오에는 queryParams 를 붙이지 않음',
  oauthCall && oauthCall[1].options.queryParams === undefined,
  oauthCall && JSON.stringify(oauthCall[1].options.queryParams)
);

const googleClient = makeClient();
__setSupabaseClient(googleClient);
const google = await signInWithOAuth('google', { redirectTo: 'https://reelpin.vercel.app/admin' });
const googleCall = googleClient.calls.find((c) => c[0] === 'auth.signInWithOAuth');
check('소셜: 구글 provider 전달', google.ok === true && googleCall && googleCall[1].provider === 'google');
check(
  '소셜: 구글은 prompt=select_account 로 계정 선택 화면',
  googleCall && googleCall[1].options.queryParams && googleCall[1].options.queryParams.prompt === 'select_account',
  googleCall && JSON.stringify(googleCall[1].options.queryParams)
);
check(
  '소셜: 구글도 redirectTo 는 그대로',
  googleCall && googleCall[1].options.redirectTo === 'https://reelpin.vercel.app/admin',
  googleCall && googleCall[1].options.redirectTo
);

// ─────────────────────────────────────────────────────────────
// 7-b. v2.40.0 빌드 21 · #28574 — React Native 에도 전역 `window` 가 있어
//      네이티브 앱이 스스로를 웹으로 착각하던 문제 (카카오·구글·Apple 세 버튼 무반응)
//      · RN: `window` 는 있고 `window.document` 는 없음  → isBrowser() false
//      · 웹: `window.document` 있음                     → isBrowser() true
// ─────────────────────────────────────────────────────────────
{
  const stub = (globalThis.__expoWebBrowserStub = globalThis.__expoWebBrowserStub || { calls: [], next: null });
  const keepWindow = globalThis.window;

  // (1) React Native 흉내 — window 는 있지만 document 가 없습니다.
  globalThis.window = {};
  check('RN 판정: window 만 있고 document 가 없으면 isBrowser false', typeof window !== 'undefined' && isBrowser() === false, String(isBrowser()));
  check('RN 판정: 리다이렉트 주소는 앱 스킴', authRedirectUrl() === 'reelpin://auth-callback', authRedirectUrl());

  for (const provider of ['kakao', 'google', 'apple']) {
    const rnClient = makeClient();
    __setSupabaseClient(rnClient);
    stub.calls.length = 0;
    stub.next = { type: 'success', url: 'reelpin://auth-callback?code=RN-' + provider.toUpperCase() };
    const rn = await signInWithOAuth(provider);
    const rnCall = rnClient.calls.find((c) => c[0] === 'auth.signInWithOAuth');
    check(
      'RN(' + provider + '): skipBrowserRedirect true — 웹으로 오판하지 않음',
      rnCall && rnCall[1].options.skipBrowserRedirect === true,
      rnCall && JSON.stringify(rnCall[1].options.skipBrowserRedirect)
    );
    check(
      'RN(' + provider + '): 인증 세션(expo-web-browser)으로 로그인 창을 연다',
      stub.calls.length === 1 && stub.calls[0].url === 'https://demo.supabase.co/oauth?provider=' + provider,
      JSON.stringify(stub.calls.map((c) => c.url))
    );
    check(
      'RN(' + provider + '): 돌아올 주소는 reelpin://auth-callback',
      stub.calls[0] && stub.calls[0].redirectUrl === 'reelpin://auth-callback',
      stub.calls[0] && stub.calls[0].redirectUrl
    );
    check(
      'RN(' + provider + '): 돌아온 code 를 세션으로 교환',
      rnClient.calls.some((c) => c[0] === 'auth.exchangeCodeForSession' && c[1] === 'RN-' + provider.toUpperCase()) &&
        rn.completed === true &&
        rn.ok === true,
      JSON.stringify(rn)
    );
    check(
      'RN(' + provider + '): 아무것도 안 하고 redirected:true 로 끝나지 않음',
      rn.redirected !== true && !!(stub.calls[0] && stub.calls[0].url),
      JSON.stringify({ redirected: rn.redirected })
    );
  }

  // (2) 사용자가 창을 그냥 닫으면 조용히 취소 — 화면은 그대로 둔다
  const cancelClient = makeClient();
  __setSupabaseClient(cancelClient);
  stub.calls.length = 0;
  stub.next = { type: 'dismiss' };
  const cancelled = await signInWithOAuth('kakao');
  check('RN: 창을 닫으면 cancelled (오류 토스트 없음)', cancelled.ok === false && cancelled.cancelled === true, JSON.stringify(cancelled));

  // (3) 앱인데 Supabase 가 주소를 안 주면 조용히 성공하지 않는다
  const noUrlClient = makeClient({ oauth: { data: {}, error: null } });
  __setSupabaseClient(noUrlClient);
  stub.calls.length = 0;
  stub.next = { type: 'dismiss' };
  const noUrl = await signInWithOAuth('google');
  check('RN: 로그인 주소가 없으면 실패로 알린다', noUrl.ok === false && noUrl.error === 'no-url' && stub.calls.length === 0, JSON.stringify(noUrl));

  // (4) 진짜 브라우저 — document 가 있으면 웹 경로(페이지 이동) 그대로
  globalThis.window = { document: {}, location: { origin: 'https://reelpin.vercel.app' } };
  check('웹 판정: window.document 가 있으면 isBrowser true', isBrowser() === true);
  const webClient = makeClient();
  __setSupabaseClient(webClient);
  stub.calls.length = 0;
  const onWeb = await signInWithOAuth('kakao');
  const webCall = webClient.calls.find((c) => c[0] === 'auth.signInWithOAuth');
  check('웹: skipBrowserRedirect false (Supabase 가 페이지를 넘김)', webCall && webCall[1].options.skipBrowserRedirect === false);
  check('웹: 인증 세션을 열지 않는다', stub.calls.length === 0, JSON.stringify(stub.calls));
  check('웹: redirectTo 는 현재 사이트 루트', webCall && webCall[1].options.redirectTo === 'https://reelpin.vercel.app/', webCall && webCall[1].options.redirectTo);
  check('웹: redirected true 로 끝난다 (예전 동작 유지)', onWeb.ok === true && onWeb.redirected === true, JSON.stringify(onWeb));

  globalThis.window = keepWindow;
  if (typeof keepWindow === 'undefined') delete globalThis.window;
  __setSupabaseClient(null);
}

// 회귀 방지 — 웹/네이티브 판정은 `typeof window` 만으로 하지 않습니다(문서 없는 window = RN).
{
  const cloudSource = fs
    .readFileSync(path.join(root, 'src/services/cloudSync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  check('회귀 방지: signInWithOAuth 의 웹 판정은 isBrowser()', /const web = isBrowser\(\);/.test(cloudSource), 'cloudSync.js');
  check(
    '회귀 방지: typeof window 만으로 웹을 판정하는 곳이 없다',
    !/const web\s*=\s*typeof window/.test(cloudSource),
    'cloudSync.js'
  );
  const supabaseSourceForBrowser = fs
    .readFileSync(path.join(root, 'src/services/supabase.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  check(
    '회귀 방지: isBrowser() 는 window.document 까지 확인',
    /typeof window !== 'undefined' && !!window && typeof window\.document !== 'undefined'/.test(supabaseSourceForBrowser),
    'supabase.js'
  );
}

const sessionClient = makeClient({ session: { data: { session: { user: { id: USER, email: 'andy@b.com' } } }, error: null } });
__setSupabaseClient(sessionClient);
check('세션: 저장된 세션 읽기', (await getSession()).session.user.email === 'andy@b.com');
let authEvents = 0;
const unsubscribe = onAuthStateChange(() => {
  authEvents++;
});
sessionClient.calls.push(['manual-callback']);
check('세션: 구독 해제 함수', typeof unsubscribe === 'function');

const signOutClient = makeClient();
__setSupabaseClient(signOutClient);
check('로그아웃: 세션 지우기 호출', (await signOut()).ok === true && signOutClient.calls.some((c) => c[0] === 'auth.signOut'));

// CRUD 쿼리 모양
const readClient = makeClient({ results: { pins: { data: [row], error: null } } });
__setSupabaseClient(readClient);
const fetched = await fetchCloudPins(USER);
check('읽기: 테이블 pins', readClient.calls[0][0] === 'from' && readClient.calls[0][1] === PIN_TABLE);
check('읽기: 내 핀만 (user_id 조건)', readClient.calls.some((c) => c[0] === 'eq' && c[1] === 'user_id' && c[2] === USER));
check('읽기: 최근 저장 순', readClient.calls.some((c) => c[0] === 'order' && c[1] === 'created_at' && c[2] && c[2].ascending === false));
check('읽기: 요구 컬럼을 모두 select', readClient.calls[0][0] === 'from' && readClient.calls.some((c) => c[0] === 'select' && PIN_COLUMNS.every((col) => String(c[1]).indexOf(col) >= 0)));
check('읽기: 행 → 핀 변환', fetched.ok === true && fetched.pins.length === 1 && fetched.pins[0].name === '베통 성수');
check('읽기: 결과 없으면 빈 배열', (await (async () => {
  const empty = makeClient({ results: { pins: { data: null, error: null } } });
  __setSupabaseClient(empty);
  const res = await fetchCloudPins(USER);
  return res.pins;
})()).length === 0);
const readErrorClient = makeClient({ results: { pins: { data: null, error: { message: 'permission denied', code: '42501' } } } });
__setSupabaseClient(readErrorClient);
check('읽기: RLS 거부 시 실패로 보고', (await fetchCloudPins(USER)).ok === false);
check('읽기: user 없으면 요청하지 않음', (await fetchCloudPins('')).error === 'missing-user');

const writeClient = makeClient({ results: { pins: { data: [row], error: null } } });
__setSupabaseClient(writeClient);
const one = await upsertCloudPin(USER, LOCAL_PIN);
const upsertCall = writeClient.calls.find((c) => c[0] === 'upsert');
check('쓰기: upsert 한 줄', one.ok === true && upsertCall && upsertCall[1].length === 1);
check('쓰기: 충돌 기준은 (user_id, id)', upsertCall && upsertCall[2] && upsertCall[2].onConflict === 'user_id,id');
check('쓰기: 행에 user_id 포함', upsertCall && upsertCall[1][0].user_id === USER && upsertCall[1][0].name === '베통 성수');

const chunkClient = makeClient({ results: { pins: { data: [], error: null } } });
__setSupabaseClient(chunkClient);
const many = Array.from({ length: 250 }, (_, i) => ({ ...LOCAL_PIN, id: 'pin-bulk-' + i, name: '가게 ' + i }));
const bulk = await upsertCloudPins(USER, many);
const chunks = chunkClient.calls.filter((c) => c[0] === 'upsert').map((c) => c[1].length);
check('쓰기: 250개는 ' + UPSERT_CHUNK + '개씩 나눠 전송', chunks.join(',') === [100, 100, 50].join(','), chunks.join(','));
check('쓰기: 나눠 보내도 전부 성공', bulk.ok === true && bulk.count === 250, String(bulk.count));
check('쓰기: 빈 목록은 요청 없이 성공', (await upsertCloudPins(USER, [])).ok === true);
check('쓰기: 이름 없는 핀은 걸러짐', (await upsertCloudPins(USER, [{ id: 'x' }])).count === 0);

const upsertErrorClient = makeClient({ results: { pins: { data: null, error: { message: 'relation "pins" does not exist' } } } });
__setSupabaseClient(upsertErrorClient);
const upsertFailed = await upsertCloudPins(USER, [LOCAL_PIN]);
check('쓰기: 실패는 ok:false 로 (throw 하지 않음)', upsertFailed.ok === false && typeof upsertFailed.message === 'string');

const deleteClient = makeClient({ results: { pins: { data: [], error: null } } });
__setSupabaseClient(deleteClient);
const deleted = await deleteCloudPin(USER, 'pin-1');
check('삭제: user_id + id 두 조건', deleted.ok === true && deleteClient.calls.some((c) => c[0] === 'delete') && deleteClient.calls.some((c) => c[0] === 'eq' && c[1] === 'user_id') && deleteClient.calls.some((c) => c[0] === 'eq' && c[1] === 'id' && c[2] === 'pin-1'));
check('삭제: 인자 없으면 요청하지 않음', (await deleteCloudPin(USER, '')).error === 'missing-arguments');

const countClient = makeClient({ results: { pins: { data: null, error: null, count: 7 } } });
__setSupabaseClient(countClient);
const counted = await fetchCloudPinCount(USER);
check('개수: head + count exact', counted.ok === true && counted.count === 7 && countClient.calls.some((c) => c[0] === 'select' && c[1] === 'id' && c[2] && c[2].head === true && c[2].count === 'exact'));

const syncClient = makeClient({ results: { pins: { data: [row], error: null } } });
__setSupabaseClient(syncClient);
const syncResult = await syncPinsWithCloud(USER, [{ ...LOCAL_PIN, id: 'pin-new-local', name: '새로 저장한 곳', naverPlaceId: '', placeUrl: '', lat: 34.1, lng: 127.1 }]);
check('첫 동기화: 클라우드 + 로컬 병합', syncResult.ok === true && syncResult.pins.length === 2, String(syncResult.pins && syncResult.pins.length));
check('첫 동기화: 로컬만 있던 핀을 올림', syncClient.calls.some((c) => c[0] === 'upsert' && c[1].length === 1 && c[1][0].id === 'pin-new-local'));

// ─────────────────────────────────────────────────────────────
// 8. 도우미 — 이메일 · 오류 문구
// ─────────────────────────────────────────────────────────────
check('이메일: 정리·검사', normalizeEmail(' A@B.CO ') === 'a@b.co' && isValidEmail('a@b.co') === true && isValidEmail('a@b') === false && isValidEmail('') === false);
const errorCases = [
  ['Email not confirmed', '메일함에서 인증 링크를 먼저 눌러 주세요'],
  ['Password should be at least 6 characters', '비밀번호는 6자 이상으로 정해 주세요'],
  ['provider is not enabled', null],
  ['For security purposes, you can only request this after 30 seconds', '요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요'],
  ['Failed to fetch', '네트워크가 불안정해요. 잠시 뒤 다시 시도해 주세요'],
];
for (const [raw, expected] of errorCases) {
  const message = friendlyAuthError({ message: raw });
  if (expected) check('오류 문구: "' + raw.slice(0, 26) + '" → 한국어', message === expected, message);
  else check('오류 문구: "' + raw.slice(0, 26) + '" → 설정 안내', message.indexOf('Providers') > 0 || message.indexOf('켜지지 않았어요') > 0, message);
}
check('오류 문구: 모르는 오류는 원문 유지', friendlyAuthError({ message: 'something odd' }) === 'something odd');
check('오류 문구: 빈 오류도 안내', friendlyAuthError(null).length > 3);
check('비밀번호 최소 길이 상수 = 6', MIN_PASSWORD_LENGTH === 6);

clearEnv();
__setSupabaseClient(null);

if (fails) {
  console.log('\nCLOUD_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nCLOUD_TESTS_OK');
