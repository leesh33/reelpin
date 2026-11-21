/**
 * test/visits-test.mjs — v2.41 📊 어드민 접속자 통계
 * ─────────────────────────────────────────────────────────────
 *   ① DB (supabase/app_visits.sql) — 테이블·RLS·비로그인 기록 RPC·관리자 통계 RPC·
 *      KST 날짜·앱별 분리·빈 날짜 0 채움·권한(anon 은 통계 불가)
 *   ② 앱 (src/services/visits.js) — 기기별 UUID 생성·저장·재사용, 앱 실행당 한 번,
 *      설정이 없거나 실패하면 조용히 넘어감
 *   ③ 서버 (/api/admin?view=visits) — 관리자 토큰만, app_visit_stats 호출, 7·14·30일
 *   ④ 화면 (AdminScreen) — 미리보기에 오늘/전체 접속자·그래프가 있다
 *
 * 실제 네트워크는 쓰지 않습니다(스텁). 실서버 확인은 390×844 라이브 검증에서 했습니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import adminHandler from '../api/admin.js';
import { rpcCall } from '../server/admin-db.js';
import {
  VISIT_APP_ID,
  VISITOR_ID_PATTERN,
  VISITOR_STORAGE_KEY,
  createVisitorId,
  getVisitorId,
  isValidVisitorId,
  resetVisitTracking,
  trackVisit,
} from '../src/services/visits.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails++;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// ── ① DB SQL ────────────────────────────────────────────────
const sql = read('supabase/app_visits.sql');
check('DB: app_visits 테이블 정의', sql.indexOf('create table if not exists public.app_visits') >= 0);
check('DB: 앱 구분 check (reelpin · life-turn)', /check \(app_id in \('reelpin', 'life-turn'\)\)/.test(sql));
check('DB: KST 날짜 기본값', sql.indexOf("now() at time zone 'Asia/Seoul'") >= 0);
check('DB: 방문자당 하루 한 줄 (PK)', /primary key \(app_id, visit_date, visitor_id\)/.test(sql));
check('DB: RLS 켜고 정책 없음', sql.indexOf('enable row level security') >= 0 && sql.indexOf('create policy') < 0);
check('DB: 직접 접근 회수', /revoke all on table public\.app_visits from (public|anon|authenticated)/.test(sql));
check('DB: 방문 기록 RPC = app_visit_track', /function public\.app_visit_track\(p_app_id text, p_visitor_id text\)/.test(sql));
check('DB: 통계 RPC = app_visit_stats(p_app_id, p_days default 14)', /function public\.app_visit_stats\(p_app_id text, p_days integer default 14\)/.test(sql));
check('DB: 통계는 관리자만 (auth.jwt email 화이트리스트)', sql.indexOf("auth.jwt() ->> 'email'") >= 0 && sql.indexOf('andy.leesh33@gmail.com') >= 0);
check('DB: 비관리자 forbidden', sql.indexOf("raise exception 'forbidden' using errcode = '42501'") >= 0);
check('DB: 통계 anon 실행 회수', /revoke all on function public\.app_visit_stats\(text, integer\) from anon/.test(sql));
check('DB: 방문 기록은 anon 에 허용', /grant execute on function public\.app_visit_track\(text, text\) to anon, authenticated/.test(sql));
check('DB: 빈 날짜 0 채움 (generate_series + left join)', sql.indexOf('generate_series') >= 0 && sql.indexOf('left join') >= 0);
check('DB: 추이 상한 90일', sql.indexOf('least(coalesce(p_days, 14), 90)') >= 0);
check('DB: 응답 필드 today_visitors · total_visitors · daily', sql.indexOf("'today_visitors'") >= 0 && sql.indexOf("'total_visitors'") >= 0 && sql.indexOf("'daily'") >= 0);
check('DB: service_role 을 쓰지 않는다(주석 밖)', !/grant[^;]*service_role|to\s+service_role|role\s+service_role|set\s+role\s+service_role/i.test(sql));

// SQL 체크섬 — README 와 파일이 같은지(문서에 적힌 값이 곧 이 파일)
const sqlHash = crypto.createHash('sha256').update(sql).digest('hex');
const readme = read('README.md');
check('DB: README 에 SQL SHA-256 이 파일과 일치', readme.indexOf(sqlHash) >= 0, sqlHash.slice(0, 16) + '…');
check('문서: README 에 접속자 통계 절', readme.indexOf('접속자 통계') >= 0 && readme.indexOf('app_visit_stats') >= 0);

// ── ② 앱 방문자 id · 기록 ────────────────────────────────────
check('앱: 통계 앱 id = reelpin', VISIT_APP_ID === 'reelpin');
const id1 = createVisitorId();
const id2 = createVisitorId();
check('앱: 만든 id 가 DB 규칙(8~64자)에 맞음', isValidVisitorId(id1) && isValidVisitorId(id2), id1);
check('앱: UUID 모양(하이픈 4개)', (id1.match(/-/g) || []).length === 4, id1);
check('앱: 매번 새 id', id1 !== id2);
check('앱: 너무 짧은 id 거부', !isValidVisitorId('short'));
check('앱: 65자 id 거부', !isValidVisitorId('a'.repeat(65)));
check('앱: 공백·특수문자 거부', !isValidVisitorId('bad id here') && !isValidVisitorId('한글아이디입니다'));
check('앱: 64자 id 허용', isValidVisitorId('a'.repeat(64)));
check('앱: 저장 키는 reelpin.visitor.id', VISITOR_STORAGE_KEY === 'reelpin.visitor.id' && VISITOR_ID_PATTERN.test(id1));

function memoryStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    map,
    getItem: async (k) => (map.has(k) ? map.get(k) : null),
    setItem: async (k, v) => {
      map.set(k, String(v));
    },
  };
}

const storage = memoryStorage();
const first = await getVisitorId({ storage });
const second = await getVisitorId({ storage });
check('앱: 첫 방문에 id 를 만들어 저장', isValidVisitorId(first) && storage.map.get(VISITOR_STORAGE_KEY) === first);
check('앱: 다음에 같은 id 를 다시 씀(누적 접속자 왜곡 없음)', first === second, first + ' / ' + second);

const kept = memoryStorage({ [VISITOR_STORAGE_KEY]: 'saved-visitor-id-0001' });
check('앱: 저장된 정상 id 는 그대로', (await getVisitorId({ storage: kept })) === 'saved-visitor-id-0001');
const broken = memoryStorage({ [VISITOR_STORAGE_KEY]: 'x' });
const repaired = await getVisitorId({ storage: broken });
check('앱: 저장된 값이 규칙에 안 맞으면 새로 만든다', isValidVisitorId(repaired) && repaired !== 'x');

const storageOff = { getItem: async () => null, setItem: async () => { throw new Error('quota'); } };
const fallback = await getVisitorId({ storage: storageOff });
check('앱: 저장이 안 돼도 이번 실행용 id 로 계속', isValidVisitorId(fallback));

// trackVisit — RPC 인자·한 번만
resetVisitTracking();
const calls = [];
const fakeClient = {
  rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: { ok: true, views: 1 }, error: null };
  },
};
const t1 = await trackVisit({ client: fakeClient, visitorId: 'visit-test-visitor-01' });
const t2 = await trackVisit({ client: fakeClient, visitorId: 'visit-test-visitor-01' });
check('앱: trackVisit 성공', t1.ok === true, JSON.stringify(t1));
check('앱: RPC 이름 app_visit_track · 인자 reelpin/방문자', calls.length === 1 && calls[0].name === 'app_visit_track' && calls[0].args.p_app_id === 'reelpin' && calls[0].args.p_visitor_id === 'visit-test-visitor-01', JSON.stringify(calls[0] || {}));
check('앱: 앱 실행 안에서 두 번 부르지 않는다', t2.ok === false && t2.reason === 'already-tracked' && calls.length === 1);

resetVisitTracking();
const errCalls = [];
const errorClient = {
  rpc: async (name, args) => {
    errCalls.push(name);
    return { data: null, error: { message: 'boom' } };
  },
};
const tErr = await trackVisit({ client: errorClient, visitorId: 'visit-test-visitor-02' });
check('앱: RPC 오류는 조용히 실패(앱은 계속)', tErr.ok === false && tErr.reason === 'rpc' && errCalls.length === 1);

resetVisitTracking();
const tBad = await trackVisit({ client: fakeClient, visitorId: 'bad' });
check('앱: 규칙에 안 맞는 id 는 보내지 않는다', tBad.ok === false && tBad.reason === 'invalid-visitor');

resetVisitTracking();
const tNone = await trackVisit({ client: null });
check('앱: 설정이 없으면(로컬 전용) 조용히 넘어감', tNone.ok === false && tNone.reason === 'not-configured');

// App.js 가 앱을 열 때 한 번 부르는지 (소스)
const appSource = read('App.js');
check('앱: App.js 가 loadCuration 뒤에 trackVisit 을 한 번', /trackVisit\(\);/.test(appSource) && appSource.indexOf("from './src/services/visits'") >= 0);
check('앱: 방문자 id 를 서버에만 보낸다(이메일·위치 없음)', read('src/services/visits.js').indexOf('p_visitor_id') >= 0 && read('src/services/visits.js').indexOf('email') < 0);

// ── ③ 서버 /api/admin?view=visits ────────────────────────────
function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    setHeader(n, v) {
      this.headers[String(n).toLowerCase()] = String(v);
    },
    end(chunk) {
      if (chunk != null) this.body = String(chunk);
      this.ended = true;
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
const jsonRes = (data, status = 200) => ({ ok: status < 300, status, json: async () => data });
const errRes = (status, data) => ({ ok: false, status, json: async () => data || {} });

let authStatus = 200;
let authEmail = 'andy.leesh33@gmail.com';
let rpcReply = {
  ok: true,
  body: { app_id: 'reelpin', today_visitors: 7, total_visitors: 41, daily: [{ date: '2026-11-22', visitors: 7, views: 12 }] },
};
let seen = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  seen.push({ url: u, init });
  if (u.indexOf('/auth/v1/user') >= 0) {
    if (authStatus !== 200) return errRes(authStatus, { message: 'invalid token' });
    return jsonRes({ user: { id: 'u-admin', email: authEmail } });
  }
  if (u.indexOf('/rest/v1/rpc/') >= 0) {
    if (!rpcReply.ok) return errRes(rpcReply.status || 400, rpcReply.body || {});
    return jsonRes(rpcReply.body);
  }
  return errRes(404, {});
};
process.env.SUPABASE_URL = 'https://zdcdvjlssncsawpqsjwe.supabase.co';
process.env.SUPABASE_ANON_KEY = 'sb_publishable_test_key_1234567890';
delete process.env.ADMIN_EMAILS;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// 토큰 없음 → 401
let res = makeRes();
await adminHandler({ method: 'GET', headers: {}, url: '/api/admin?view=visits', query: { view: 'visits' } }, res);
check('서버: 토큰 없으면 401', res.statusCode === 401, res.body.slice(0, 100));

// 관리자 → 200 · RPC 인자 확인
seen = [];
res = makeRes();
await adminHandler(
  { method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=visits&days=14', query: { view: 'visits', days: '14' } },
  res
);
const body = res.json();
const rpcSeen = seen.filter((c) => c.url.indexOf('/rest/v1/rpc/') >= 0);
check('서버: 관리자 200', res.statusCode === 200 && body.ok === true, res.body.slice(0, 120));
check('서버: RPC app_visit_stats', rpcSeen.length === 1 && rpcSeen[0].url.endsWith('/rest/v1/rpc/app_visit_stats'), rpcSeen[0] && rpcSeen[0].url);
check(
  '서버: app_id=reelpin · days=14',
  rpcSeen[0] && JSON.parse(rpcSeen[0].init.body).p_app_id === 'reelpin' && JSON.parse(rpcSeen[0].init.body).p_days === 14,
  rpcSeen[0] && rpcSeen[0].init.body
);
check('서버: 응답에 오늘/전체 접속자', body.data && body.data.today_visitors === 7 && body.data.total_visitors === 41);

// 30일
seen = [];
res = makeRes();
await adminHandler(
  { method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=visits&days=30', query: { view: 'visits', days: '30' } },
  res
);
const rpc30 = seen.filter((c) => c.url.indexOf('/rest/v1/rpc/') >= 0)[0];
check('서버: 30일 요청 그대로', res.statusCode === 200 && JSON.parse(rpc30.init.body).p_days === 30);

// 잘못된 기간
res = makeRes();
await adminHandler(
  { method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=visits&days=90', query: { view: 'visits', days: '90' } },
  res
);
check('서버: 7·14·30 이외는 400', res.statusCode === 400 && res.json().error === 'bad-request');

// 비관리자 → 403
authStatus = 200;
authEmail = 'someone@example.com';
res = makeRes();
await adminHandler(
  { method: 'GET', headers: { authorization: 'Bearer user-token' }, url: '/api/admin?view=visits', query: { view: 'visits' } },
  res
);
check('서버: 비관리자 403', res.statusCode === 403, res.body.slice(0, 100));

// 스키마 미적용 → 503 안내(app_visits.sql)
authEmail = 'andy.leesh33@gmail.com';
rpcReply = { ok: false, status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.app_visit_stats' } };
res = makeRes();
await adminHandler(
  { method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=visits', query: { view: 'visits' } },
  res
);
const missing = res.json();
check('서버: SQL 미적용이면 503 + app_visits.sql 안내', res.statusCode === 503 && missing.error === 'admin-schema-missing' && missing.message.indexOf('app_visits.sql') >= 0, res.body.slice(0, 160));
rpcReply = { ok: true, body: {} };

// service_role 키는 응답에 없다
const anyResponse = JSON.stringify(body) + JSON.stringify(missing);
check('서버: 응답에 service_role 없음', anyResponse.indexOf('service_role') < 0 && anyResponse.indexOf('SERVICE_ROLE') < 0);

// rpcCall 자체도 토큰 없으면 설정 오류로 막힌다
const noToken = await rpcCall('app_visit_stats', {}, { cfg: { url: 'https://x.supabase.co', anonKey: 'k' }, token: '', fetchImpl: globalThis.fetch });
check('서버: 토큰 없으면 RPC 를 부르지 않는다', noToken.ok === false && noToken.error === 'not-configured');

// ── ④ 어드민 화면 ───────────────────────────────────────────
const screen = read('src/screens/AdminScreen.js');
check('화면: 접속자 절 + 오늘/전체 접속자 카드', screen.indexOf('>접속자<') >= 0 && screen.indexOf('오늘 접속자') >= 0 && screen.indexOf('전체 접속자') >= 0);
check('화면: 14일 / 30일 전환', screen.indexOf('VISIT_DAY_OPTIONS = [14, 30]') >= 0 && screen.indexOf('최근 ${d}일 추이') >= 0);
check('화면: 일별 막대 그래프(외부 차트 라이브러리 없음)', screen.indexOf('function VisitChart') >= 0 && screen.indexOf('chartBar') >= 0 && screen.indexOf('victory') < 0 && screen.indexOf('chart.js') < 0);
check('화면: 미리보기에도 접속자 통계', screen.indexOf('visits: previewVisitStats(14)') >= 0);
check('화면: 접속자 통계는 /api/admin 만 쓴다(키 없음)', screen.indexOf("'/api/admin'") > 0 && screen.indexOf("view: 'visits'") > 0 && screen.indexOf('SUPABASE_SERVICE') < 0);

// 서버 모듈이 고를 수 있는 기간은 7·14·30
const adminDb = await import('../server/admin-db.js');
check('서버: VISIT_DAYS = 7 · 14 · 30', JSON.stringify(adminDb.VISIT_DAYS) === JSON.stringify([7, 14, 30]));

console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
process.exitCode = fails ? 1 : 0;
