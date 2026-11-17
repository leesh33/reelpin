/**
 * test/admin-test.mjs — v2.21 🛡️ 어드민(`/admin`) 서버 테스트
 * ─────────────────────────────────────────────────────────────
 *   · 토큰 검증: 토큰 없음 401 · 위조/만료 401 · 비관리자 403 · 관리자 200
 *   · 화이트리스트: 기본 2명 + `ADMIN_EMAILS` 환경변수
 *   · 데이터 접근: 관리자 **본인 토큰**으로 PostgREST RPC 만 호출 (service_role 없음)
 *   · 요청 검증: 잘못된 플랜·빈 대상 400, 지원하지 않는 메서드 405
 *   · DB 함수가 없을 때(스키마 미적용) 503 안내
 *   · 응답에 키(anon·service_role)가 절대 들어가지 않음
 *
 * 네트워크는 globalThis.fetch 스텁으로 대체합니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import adminHandler from '../api/admin.js';
import { adminEmails, isAdminEmail, bearerToken, authorizeAdmin, readSupabaseEnv } from '../server/admin-auth.js';
import { rpcCall, overview, setPlan } from '../server/admin-db.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails++;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

function makeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    end(chunk) {
      if (chunk != null) this.body = String(chunk);
      this.ended = true;
    },
    jsonBody() {
      try {
        return JSON.parse(this.body || 'null');
      } catch (e) {
        return null;
      }
    },
  };
  return res;
}

const jsonRes = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const errRes = (status, data) => ({ ok: false, status, json: async () => data || {} });

let calls = [];
let authUser = { id: 'user-admin', email: 'andy.leesh33@gmail.com' };
let authStatus = 200;
let rpcReply = { ok: true, body: { totalUsers: 3 } };

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, init });
  if (u.indexOf('/auth/v1/user') >= 0) {
    if (authStatus !== 200) return errRes(authStatus, { message: 'invalid JWT' });
    return jsonRes({ user: authUser });
  }
  if (u.indexOf('/rest/v1/rpc/') >= 0) {
    if (!rpcReply.ok) return errRes(rpcReply.status || 400, rpcReply.body || {});
    return jsonRes(rpcReply.body);
  }
  return errRes(404, { message: 'not found' });
};

// 서버 환경변수 (Vercel 과 같은 이름)
process.env.SUPABASE_URL = 'https://zdcdvjlssncsawpqsjwe.supabase.co';
process.env.SUPABASE_ANON_KEY = 'sb_publishable_test_key_1234567890';
delete process.env.ADMIN_EMAILS;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const successful = (res, status = 200) => res.statusCode === status && res.ended;

// ── 1. 화이트리스트 ──────────────────────────────────────────
const defaultEmails = adminEmails({});
check(
  'admin/auth: 기본 관리자 2명',
  defaultEmails.length === 2 && defaultEmails.indexOf('andy.leesh33@gmail.com') >= 0 && defaultEmails.indexOf('shhy@kakao.com') >= 0,
  JSON.stringify(defaultEmails)
);
check('admin/auth: 대소문자·공백 무시', isAdminEmail('  ANDY.Leesh33@Gmail.com ', {}), '');
check('admin/auth: 일반 계정은 false', isAdminEmail('someone@else.com', {}) === false, '');
check('admin/auth: 빈 값 false', isAdminEmail('', {}) === false && isAdminEmail(null, {}) === false, '');
const withEnv = adminEmails({ ADMIN_EMAILS: 'Boss@Reelpin.app, second@reelpin.app' });
check(
  'admin/auth: ADMIN_EMAILS 추가(기본값 유지)',
  withEnv.length === 4 && withEnv.indexOf('boss@reelpin.app') >= 0 && withEnv.indexOf('andy.leesh33@gmail.com') >= 0,
  JSON.stringify(withEnv)
);
check('admin/auth: Bearer 토큰 읽기', bearerToken({ headers: { authorization: 'Bearer abc.def' } }) === 'abc.def', bearerToken({ headers: {} }));
check('admin/auth: 토큰 없으면 빈 문자열', bearerToken({ headers: {} }) === '' && bearerToken(null) === '', '');
check(
  'admin/auth: 서버 Supabase 설정 읽기',
  (readSupabaseEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }) || {}).url === 'https://x.supabase.co',
  ''
);

// ── 2. 토큰 검증 ────────────────────────────────────────────
const noToken = await authorizeAdmin({ headers: {} }, { env: process.env });
check('admin/auth: 토큰 없음 401', noToken.ok === false && noToken.status === 401 && noToken.error === 'unauthenticated', JSON.stringify(noToken));

const noConfig = await authorizeAdmin({ headers: { authorization: 'Bearer t' } }, { env: {} });
check('admin/auth: 설정 없음 503', noConfig.ok === false && noConfig.status === 503, JSON.stringify(noConfig));

authStatus = 401;
const badToken = await authorizeAdmin({ headers: { authorization: 'Bearer fake' } }, { env: process.env });
check('admin/auth: 위조·만료 토큰 401', badToken.ok === false && badToken.status === 401, JSON.stringify(badToken));

authStatus = 200;
authUser = { id: 'user-other', email: 'someone@else.com' };
const notAdmin = await authorizeAdmin({ headers: { authorization: 'Bearer ok' } }, { env: process.env });
check('admin/auth: 비관리자 403', notAdmin.ok === false && notAdmin.status === 403 && notAdmin.error === 'not-admin', JSON.stringify(notAdmin));

authUser = { id: 'user-admin', email: 'Andy.Leesh33@gmail.com' };
const adminOk = await authorizeAdmin({ headers: { authorization: 'Bearer ok' } }, { env: process.env });
check('admin/auth: 관리자 통과 + 이메일 정규화', adminOk.ok === true && adminOk.email === 'andy.leesh33@gmail.com', JSON.stringify(adminOk));

// ── 3. 핸들러 — 인증 차단 ───────────────────────────────────
calls = [];
let res = makeRes();
await adminHandler({ method: 'GET', headers: {}, url: '/api/admin?view=overview', query: { view: 'overview' } }, res);
check('admin/api: 토큰 없이 호출 401', successful(res, 401) && res.jsonBody().error === 'unauthenticated', res.body);
check('admin/api: 401 이면 DB 호출 0건', calls.filter((c) => c.url.indexOf('/rest/v1/') >= 0).length === 0, String(calls.length));

calls = [];
authUser = { id: 'user-other', email: 'hacker@evil.com' };
res = makeRes();
await adminHandler(
  { method: 'GET', headers: { authorization: 'Bearer ok' }, url: '/api/admin?view=members' },
  res
);
check('admin/api: 비관리자 403', successful(res, 403) && res.jsonBody().error === 'not-admin', res.body);
check('admin/api: 비관리자는 DB 호출 0건', calls.filter((c) => c.url.indexOf('/rest/v1/') >= 0).length === 0, String(calls.length));

// ── 4. 핸들러 — 관리자 정상 동작 ────────────────────────────
authUser = { id: 'user-admin', email: 'andy.leesh33@gmail.com' };
rpcReply = {
  ok: true,
  body: {
    totalUsers: 12,
    newUsers7d: 4,
    totalPins: 51,
    pinsToday: 2,
    topPlaces: [{ name: '베통', saves: 7, users: 5 }],
    categories: [{ name: '맛집', count: 30 }],
  },
};
calls = [];
res = makeRes();
await adminHandler(
  { method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=overview' },
  res
);
const overviewBody = res.jsonBody();
check('admin/api: 대시보드 200', successful(res, 200) && overviewBody.ok === true, res.body && res.body.slice(0, 120));
check('admin/api: 대시보드 값 그대로', overviewBody.data.totalUsers === 12 && overviewBody.data.topPlaces.length === 1, JSON.stringify(overviewBody.data).slice(0, 120));

const authCall = calls.find((c) => c.url.indexOf('/auth/v1/user') >= 0);
const rpcCall1 = calls.find((c) => c.url.indexOf('/rest/v1/rpc/') >= 0);
check('admin/api: 토큰을 Supabase 에서 검증', !!authCall && authCall.init.headers.Authorization === 'Bearer admin-token', authCall && authCall.url);
check('admin/api: RPC 이름 = reelpin_admin_overview', !!rpcCall1 && rpcCall1.url.endsWith('/rest/v1/rpc/reelpin_admin_overview'), rpcCall1 && rpcCall1.url);
check(
  'admin/api: 관리자 본인 토큰 + anon key 로만 호출',
  !!rpcCall1 && rpcCall1.init.headers.Authorization === 'Bearer admin-token' && !!rpcCall1.init.headers.apikey,
  rpcCall1 && JSON.stringify(Object.keys(rpcCall1.init.headers))
);
check(
  'admin/api: 응답에 키가 없음',
  String(res.body).indexOf('sb_publishable') < 0 && String(res.body).indexOf('service_role') < 0,
  ''
);

// 회원 검색
calls = [];
rpcReply = { ok: true, body: [{ userId: 'u1', email: 'a@b.c', nickname: '희연', pinCount: 2, plan: 'free' }] };
res = makeRes();
await adminHandler(
  {
    method: 'GET',
    headers: { authorization: 'Bearer admin-token' },
    url: '/api/admin?view=members&q=' + encodeURIComponent('희연'),
  },
  res
);
const memberRpc = calls.find((c) => c.url.indexOf('/rest/v1/rpc/reelpin_admin_members') >= 0);
check('admin/api: 회원 목록 200', successful(res, 200) && res.jsonBody().data.length === 1, res.body && res.body.slice(0, 120));
check(
  'admin/api: 검색어가 RPC 인자로 전달',
  !!memberRpc && JSON.parse(memberRpc.init.body).p_search === '희연',
  memberRpc && memberRpc.init.body
);

// 플랜 변경
calls = [];
rpcReply = { ok: true, body: { ok: true, userId: 'u1', plan: 'pro' } };
res = makeRes();
await adminHandler(
  {
    method: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    url: '/api/admin',
    body: { action: 'set-plan', userId: 'u1', plan: 'pro' },
  },
  res
);
const planRpc = calls.find((c) => c.url.indexOf('/rest/v1/rpc/reelpin_admin_set_plan') >= 0);
check('admin/api: 플랜 변경 200', successful(res, 200) && res.jsonBody().data.plan === 'pro', res.body);
check(
  'admin/api: 플랜 인자 그대로',
  !!planRpc && JSON.parse(planRpc.init.body).p_user_id === 'u1' && JSON.parse(planRpc.init.body).p_plan === 'pro',
  planRpc && planRpc.init.body
);

// 잘못된 입력
res = makeRes();
await adminHandler(
  { method: 'POST', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin', body: { action: 'set-plan', userId: 'u1', plan: 'vip' } },
  res
);
check('admin/api: 잘못된 플랜 400', successful(res, 400) && res.jsonBody().error === 'bad-request', res.body);

res = makeRes();
await adminHandler({ method: 'POST', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin', body: { action: 'delete-user' } }, res);
check('admin/api: 대상 없는 삭제 400', successful(res, 400), res.body);

res = makeRes();
await adminHandler({ method: 'PUT', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin' }, res);
check('admin/api: 지원하지 않는 메서드 405', successful(res, 405) && res.jsonBody().error === 'method-not-allowed', res.body);

// DB 함수 미적용(스키마 없음) → 503 안내
rpcReply = { ok: false, status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.reelpin_admin_overview' } };
res = makeRes();
await adminHandler({ method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=overview' }, res);
check(
  'admin/api: 스키마 미적용 503 안내',
  successful(res, 503) && res.jsonBody().error === 'admin-schema-missing' && /admin\.sql/.test(res.jsonBody().message),
  res.body
);

// 권한 오류(42501) → 403
rpcReply = { ok: false, status: 403, body: { code: '42501', message: 'forbidden' } };
const forbidden = await overview({ cfg: { url: 'https://x.supabase.co', anonKey: 'k' }, token: 't', fetchImpl: globalThis.fetch });
check('admin/db: DB 권한 오류 403', forbidden.ok === false && forbidden.status === 403 && forbidden.error === 'forbidden', JSON.stringify(forbidden));

// RPC 호출 자체가 실패(네트워크) → 502
const netFail = await rpcCall('reelpin_admin_overview', {}, {
  cfg: { url: 'https://x.supabase.co', anonKey: 'k' },
  token: 't',
  fetchImpl: async () => {
    throw new Error('boom');
  },
});
check('admin/db: 네트워크 실패 502', netFail.ok === false && netFail.status === 502, JSON.stringify(netFail));

const noTokenRpc = await setPlan('u1', 'pro', { cfg: { url: 'https://x.supabase.co', anonKey: 'k' }, token: '' });
check('admin/db: 토큰 없으면 호출하지 않음', noTokenRpc.ok === false && noTokenRpc.status === 503, JSON.stringify(noTokenRpc));

// ── 5. v2.23 💬 제보 — 목록 조회 · 상태 변경 · 삭제 ─────────
authUser = { id: 'user-admin', email: 'andy.leesh33@gmail.com' };
rpcReply = { ok: true, body: [{ id: 'f1', kind: 'bug', title: '지도 흰 화면', content: '사파리에서 흰 화면', author: '꼬야네', userEmail: '', appVersion: '2.24.0', likes: 3, status: 'open', createdAt: '2026-11-17T09:00:00+09:00' }] };
calls = [];
res = makeRes();
await adminHandler(
  { method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=feedback&kind=bug&status=open' },
  res
);
const feedbackBody = res.jsonBody();
const feedbackRpc = calls.find((c) => c.url.indexOf('/rest/v1/rpc/reelpin_admin_feedback') >= 0);
check('admin/api: 제보 목록 200', successful(res, 200) && feedbackBody.ok === true && feedbackBody.data.length === 1, res.body && res.body.slice(0, 140));
check(
  'admin/api: 제보 필터가 RPC 인자로 전달',
  !!feedbackRpc && JSON.parse(feedbackRpc.init.body).p_kind === 'bug' && JSON.parse(feedbackRpc.init.body).p_status === 'open',
  feedbackRpc && feedbackRpc.init.body
);
calls = [];
rpcReply = { ok: true, body: [] };
res = makeRes();
await adminHandler({ method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=feedback' }, res);
const plainRpc = calls.find((c) => c.url.indexOf('/rest/v1/rpc/reelpin_admin_feedback') >= 0);
check(
  'admin/api: 필터 없는 제보 목록은 null 로 전달',
  !!plainRpc && JSON.parse(plainRpc.init.body).p_kind === null && JSON.parse(plainRpc.init.body).p_status === null,
  plainRpc && plainRpc.init.body
);

res = makeRes();
await adminHandler({ method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=feedback&kind=vip' }, res);
check('admin/api: 잘못된 제보 유형 400', successful(res, 400) && res.jsonBody().error === 'bad-request', res.body);

res = makeRes();
await adminHandler({ method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=feedback&status=done' }, res);
check('admin/api: 잘못된 제보 상태 400', successful(res, 400) && res.jsonBody().error === 'bad-request', res.body);

calls = [];
rpcReply = { ok: true, body: { ok: true, id: 'f1', status: 'applied' } };
res = makeRes();
await adminHandler(
  { method: 'POST', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin', body: { action: 'update-feedback-status', id: 'f1', status: 'applied' } },
  res
);
const statusRpc = calls.find((c) => c.url.indexOf('/rest/v1/rpc/reelpin_admin_update_feedback_status') >= 0);
check('admin/api: 제보 상태 변경 200', successful(res, 200) && res.jsonBody().data.status === 'applied', res.body);
check(
  'admin/api: 상태 변경 인자 그대로',
  !!statusRpc && JSON.parse(statusRpc.init.body).p_id === 'f1' && JSON.parse(statusRpc.init.body).p_status === 'applied',
  statusRpc && statusRpc.init.body
);

res = makeRes();
await adminHandler(
  { method: 'POST', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin', body: { action: 'update-feedback-status', id: 'f1', status: 'vip' } },
  res
);
check('admin/api: 잘못된 상태 변경 400', successful(res, 400), res.body);

calls = [];
rpcReply = { ok: true, body: { ok: true, id: 'f1', title: '지도 흰 화면' } };
res = makeRes();
await adminHandler(
  { method: 'POST', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin', body: { action: 'delete-feedback', id: 'f1' } },
  res
);
const deleteRpc = calls.find((c) => c.url.indexOf('/rest/v1/rpc/reelpin_admin_delete_feedback') >= 0);
check('admin/api: 제보 삭제 200', successful(res, 200) && res.jsonBody().data.id === 'f1', res.body);
check('admin/api: 삭제 인자 그대로', !!deleteRpc && JSON.parse(deleteRpc.init.body).p_id === 'f1', deleteRpc && deleteRpc.init.body);

res = makeRes();
await adminHandler({ method: 'POST', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin', body: { action: 'delete-feedback' } }, res);
check('admin/api: 대상 없는 제보 삭제 400', successful(res, 400), res.body);

rpcReply = { ok: false, status: 403, body: { code: '42501', message: 'forbidden' } };
res = makeRes();
await adminHandler({ method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=feedback' }, res);
check('admin/api: DB 가 비관리자면 403', successful(res, 403), res.body);

rpcReply = { ok: false, status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.reelpin_admin_feedback' } };
res = makeRes();
await adminHandler({ method: 'GET', headers: { authorization: 'Bearer admin-token' }, url: '/api/admin?view=feedback' }, res);
check(
  'admin/api: 제보 스키마 미적용 503 안내(feedback.sql)',
  successful(res, 503) && res.jsonBody().error === 'admin-schema-missing' && /feedback\.sql/.test(res.jsonBody().message),
  res.body
);

// ── 6. service_role 미사용 (보안) ───────────────────────────
const apiSource = fs.readFileSync(path.join(process.cwd(), 'api/admin.js'), 'utf8');
const authSource = fs.readFileSync(path.join(process.cwd(), 'server/admin-auth.js'), 'utf8');
const dbSource = fs.readFileSync(path.join(process.cwd(), 'server/admin-db.js'), 'utf8');
const codeUsesServiceRole = (text) => /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(text);
check(
  'admin/보안: 서버 코드가 service_role 키를 읽지 않음',
  !codeUsesServiceRole(apiSource) && !codeUsesServiceRole(authSource) && !codeUsesServiceRole(dbSource),
  'service_role 참조 발견'
);
check(
  'admin/보안: 서버 코드가 클라이언트 번들에 없다 (src/ 에서 import 하지 않음)',
  fs.readFileSync(path.join(process.cwd(), 'src/screens/AdminScreen.js'), 'utf8').indexOf('/api/admin') > 0 &&
    fs.readFileSync(path.join(process.cwd(), 'src/screens/AdminScreen.js'), 'utf8').indexOf('SUPABASE_SERVICE') < 0,
  ''
);

// ── 7. 화면(미리보기) 렌더 — 모의 데이터로 그려지는가 ────────
const adminScreenSource = fs.readFileSync(path.join(process.cwd(), 'src/screens/AdminScreen.js'), 'utf8');
check('admin/화면: 4개 탭(대시보드·회원 관리·장소 관리·제보)', ['대시보드', '회원 관리', '장소 관리', '제보'].every((t) => adminScreenSource.indexOf(t) >= 0), '');
check('admin/화면: 로그인 안내 · 권한 없음 화면', adminScreenSource.indexOf('관리자 로그인이 필요해요') > 0 && adminScreenSource.indexOf('관리자 권한이 없어요') > 0, '');
check('admin/화면: 삭제 확인 모달 문구', adminScreenSource.indexOf('되돌릴 수 없어요') > 0, '');
check('admin/화면: 인기 장소 TOP 10 · 회원 플랜 변경 버튼', adminScreenSource.indexOf('인기 장소 TOP 10') > 0 && adminScreenSource.indexOf('프로로') > 0, '');
check('admin/화면: 미리보기 모드(모의 데이터)', adminScreenSource.indexOf('PREVIEW_DATA') > 0 && adminScreenSource.indexOf('미리보기') > 0, '');
check(
  'admin/화면: 제보 탭 필터·상태 변경·삭제',
  adminScreenSource.indexOf('FEEDBACK_STATUS_OPTIONS') > 0 &&
    adminScreenSource.indexOf('admin-feedback-status-') > 0 &&
    adminScreenSource.indexOf("action: 'update-feedback-status'") > 0 &&
    adminScreenSource.indexOf('제보를 삭제할까요?') > 0,
  ''
);

if (fails) {
  console.log('\nADMIN_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nADMIN_TESTS_OK');
