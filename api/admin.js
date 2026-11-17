/**
 * api/admin.js — Vercel Serverless Function (v2.21)
 * ─────────────────────────────────────────────────────────────
 * 🛡️ 릴스핀 어드민 API — `/admin` 화면만 씁니다.
 *
 *   GET  /api/admin?view=session                     … 지금 토큰이 어드민인지 확인
 *   GET  /api/admin?view=overview                    … 대시보드 요약(회원·핀·인기 장소 TOP 10)
 *   GET  /api/admin?view=members&q=<이메일|이름>       … 회원 목록
 *   GET  /api/admin?view=pins&q=<검색>&category=<분류>  … 장소(핀) 목록
 *   GET  /api/admin?view=feedback&kind=<idea|bug>&status=<open|applied|fixed>  … 💬 제보 목록 (v2.23)
 *   POST /api/admin  { action:'set-plan',    userId, plan:'free'|'pro' }
 *   POST /api/admin  { action:'delete-user', userId }
 *   POST /api/admin  { action:'update-pin',  userId, pinId, name, category }
 *   POST /api/admin  { action:'delete-pin',  userId, pinId }
 *   POST /api/admin  { action:'update-feedback-status', id, status:'open'|'applied'|'fixed' }  … v2.23
 *   POST /api/admin  { action:'delete-feedback', id }                                          … v2.23
 *
 * 보안 (이 파일이 지키는 선)
 *   1. 모든 요청은 **서버에서** Supabase `/auth/v1/user` 로 토큰을 검증합니다.
 *      → 미인증 401 · 비관리자 403. 클라이언트가 보낸 이메일은 절대 믿지 않습니다.
 *   2. 관리자 화이트리스트는 `andy.leesh33@gmail.com` · `shhy@kakao.com` (+ `ADMIN_EMAILS`).
 *   3. DB 접근은 관리자 본인 토큰으로 RPC(`reelpin_admin_*`)만 호출합니다.
 *      → `SUPABASE_SERVICE_ROLE_KEY` 없이 동작하고, 키가 응답·번들에 나가지 않습니다.
 *   4. 실패 응답에는 업스트림 본문·키를 담지 않습니다.
 */
const { sendJson, queryParam, warn } = require('../server/http.js');
const { authorizeAdmin, readSupabaseEnv, adminEmails } = require('../server/admin-auth.js');
const adminDb = require('../server/admin-db.js');

/** v2.23 — 제보 상태 값 (DB check 제약과 같습니다) */
const FEEDBACK_STATUSES = ['open', 'applied', 'fixed'];

/** 요청 본문(JSON) — Vercel 이 파싱해 둔 경우와 스트림인 경우를 모두 받습니다. */
async function readJsonBody(req) {
  if (!req) return {};
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) || {};
    } catch (e) {
      return {};
    }
  }
  if (typeof req.on !== 'function') return {};
  return new Promise((resolve) => {
    let raw = '';
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on('data', (chunk) => {
      raw += chunk;
      // 본문 폭주 방지 — 어드민 요청은 작은 JSON 하나입니다.
      if (raw.length > 100000) finish({});
    });
    req.on('end', () => {
      try {
        finish(JSON.parse(raw || '{}') || {});
      } catch (e) {
        finish({});
      }
    });
    req.on('error', () => finish({}));
  });
}

/** 문자열 인자 정리 (길이 상한) */
function clean(value, max = 120) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** GET 라우팅 */
async function handleGet(req, res, ctx) {
  const view = clean(queryParam(req, 'view', 20) || 'overview', 20).toLowerCase();

  if (view === 'session') {
    return sendJson(res, 200, {
      ok: true,
      admin: true,
      email: ctx.email,
      adminEmails: adminEmails(ctx.env),
    });
  }

  if (view === 'overview') {
    const result = await adminDb.overview(ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data, email: ctx.email });
  }

  if (view === 'members') {
    const q = clean(queryParam(req, 'q', 120));
    const result = await adminDb.members(q, ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data, query: q });
  }

  if (view === 'pins') {
    const search = clean(queryParam(req, 'q', 120));
    const category = clean(queryParam(req, 'category', 40));
    const result = await adminDb.pins({ search, category }, ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data, query: search, category });
  }

  // v2.23 — 💬 제안 · 버그 제보 목록 (유형·상태 필터)
  if (view === 'feedback') {
    const kind = clean(queryParam(req, 'kind', 8)).toLowerCase();
    const status = clean(queryParam(req, 'status', 10)).toLowerCase();
    if (kind && kind !== 'idea' && kind !== 'bug') {
      return sendJson(res, 400, { ok: false, error: 'bad-request', message: '유형은 idea · bug 중 하나예요.' });
    }
    if (status && !FEEDBACK_STATUSES.includes(status)) {
      return sendJson(res, 400, { ok: false, error: 'bad-request', message: '상태는 open · applied · fixed 중 하나예요.' });
    }
    const result = await adminDb.feedback({ kind, status }, ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data, kind, status });
  }

  return sendJson(res, 400, { ok: false, error: 'unknown-view', message: '알 수 없는 요청이에요.' });
}

/** POST 라우팅 — 상태를 바꾸는 요청만 */
async function handlePost(req, res, ctx) {
  const body = await readJsonBody(req);
  const action = clean(body.action, 24).toLowerCase();

  if (action === 'set-plan') {
    const userId = clean(body.userId, 64);
    const plan = clean(body.plan, 8).toLowerCase();
    if (!userId || (plan !== 'free' && plan !== 'pro')) {
      return sendJson(res, 400, { ok: false, error: 'bad-request', message: '회원과 플랜(free·pro)을 확인해 주세요.' });
    }
    const result = await adminDb.setPlan(userId, plan, ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data });
  }

  if (action === 'delete-user') {
    const userId = clean(body.userId, 64);
    if (!userId) return sendJson(res, 400, { ok: false, error: 'bad-request', message: '지울 회원을 확인해 주세요.' });
    const result = await adminDb.deleteUser(userId, ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data });
  }

  if (action === 'update-pin') {
    const userId = clean(body.userId, 64);
    const pinId = clean(body.pinId, 80);
    const name = clean(body.name, 60);
    const category = clean(body.category, 20);
    if (!userId || !pinId || !name) {
      return sendJson(res, 400, { ok: false, error: 'bad-request', message: '핀·상호명을 확인해 주세요.' });
    }
    const result = await adminDb.updatePin({ userId, pinId, name, category }, ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data });
  }

  if (action === 'delete-pin') {
    const userId = clean(body.userId, 64);
    const pinId = clean(body.pinId, 80);
    if (!userId || !pinId) return sendJson(res, 400, { ok: false, error: 'bad-request', message: '지울 핀을 확인해 주세요.' });
    const result = await adminDb.deletePin({ userId, pinId }, ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data });
  }

  // v2.23 — 💬 제보 상태 변경 (접수됨 ↔ 반영됨 ↔ 수정됨)
  if (action === 'update-feedback-status') {
    const id = clean(body.id, 64);
    const status = clean(body.status, 10).toLowerCase();
    if (!id || !FEEDBACK_STATUSES.includes(status)) {
      return sendJson(res, 400, { ok: false, error: 'bad-request', message: '제보와 상태(open·applied·fixed)를 확인해 주세요.' });
    }
    const result = await adminDb.updateFeedbackStatus({ id, status }, ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data });
  }

  // v2.23 — 💬 제보 삭제
  if (action === 'delete-feedback') {
    const id = clean(body.id, 64);
    if (!id) return sendJson(res, 400, { ok: false, error: 'bad-request', message: '지울 제보를 확인해 주세요.' });
    const result = await adminDb.deleteFeedback(id, ctx.db);
    if (!result.ok) return sendJson(res, result.status, { ok: false, error: result.error, message: result.message });
    return sendJson(res, 200, { ok: true, data: result.data });
  }

  return sendJson(res, 400, { ok: false, error: 'unknown-action', message: '알 수 없는 요청이에요.' });
}

module.exports = async function handler(req, res) {
  const env = process.env || {};
  const cfg = readSupabaseEnv(env);

  // 1) 서버 측 인증 — 토큰 검증 + 관리자 화이트리스트
  const auth = await authorizeAdmin(req, { env });
  if (!auth.ok) {
    if (auth.error === 'not-admin') warn('admin: non-admin blocked (' + (auth.email || 'unknown') + ')');
    return sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message });
  }

  const ctx = {
    env,
    email: auth.email,
    user: auth.user,
    db: { cfg, token: auth.token },
  };

  const method = String((req && req.method) || 'GET').toUpperCase();
  try {
    if (method === 'GET') return await handleGet(req, res, ctx);
    if (method === 'POST') return await handlePost(req, res, ctx);
    return sendJson(res, 405, { ok: false, error: 'method-not-allowed', message: 'GET·POST 만 쓸 수 있어요.' });
  } catch (e) {
    warn('admin: handler error ' + String((e && e.message) || e).slice(0, 120));
    return sendJson(res, 500, { ok: false, error: 'server-error', message: '잠시 후 다시 시도해 주세요.' });
  }
};
