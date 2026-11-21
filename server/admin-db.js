/**
 * server/admin-db.js
 * ─────────────────────────────────────────────────────────────
 * v2.21 — 🛡️ 어드민 데이터 접근 계층 (`api/admin.js` 전용)
 *
 * 이 파일은 **PostgREST RPC 만** 씁니다.
 *   · 호출은 관리자 본인의 access_token + anon key 로 나갑니다 → service_role 키를 쓰지 않습니다.
 *   · 실제 권한 검사는 DB 함수(`public.reelpin_admin_*`)가 `auth.jwt()` 로 **한 번 더** 합니다.
 *     (서버 코드가 뚫려도 남의 핀·회원 정보를 건드릴 수 없습니다)
 *
 * 준비물: `supabase/admin.sql` 을 Supabase SQL Editor 에서 한 번 실행해 두면 됩니다.
 *
 * 응답 규칙
 *   성공 … { ok:true, data }
 *   실패 … { ok:false, status:400|403|404|502|503, error, message }
 */

const RPC_TIMEOUT_MS = 6000;

/** 오류 본문에서 사람이 읽을 수 있는 문구만 뽑습니다. (키·본문 전체는 응답에 담지 않습니다) */
function errorInfo(status, body) {
  const code = body && (body.code || body.error);
  const message = String((body && (body.message || body.error_description || body.details)) || '');
  if (code === 'PGRST202' || /function .* does not exist|schema cache/i.test(message)) {
    return {
      status: 503,
      error: 'admin-schema-missing',
      message:
        '어드민 DB 함수가 아직 없어요. Supabase SQL Editor 에서 supabase/admin.sql (제보 탭은 supabase/feedback.sql, 기획전·배너 탭은 supabase/curation.sql, 접속자 통계는 supabase/app_visits.sql)을 실행해 주세요.',
    };
  }
  if (code === '42501' || /forbidden|권한/i.test(message)) {
    return { status: 403, error: 'forbidden', message: '관리자 권한이 없어요.' };
  }
  if (code === '22023' || /invalid|잘못/i.test(message)) {
    return { status: 400, error: 'bad-request', message: message || '잘못된 요청이에요.' };
  }
  if (code === 'P0002' || /not found|없는/i.test(message)) {
    return { status: 404, error: 'not-found', message: message || '대상을 찾지 못했어요.' };
  }
  if (status === 401 || status === 403) {
    return { status, error: 'forbidden', message: '관리자 권한이 없어요.' };
  }
  return { status: 502, error: 'upstream', message: '데이터베이스 응답을 받지 못했어요.' };
}

/**
 * PostgREST RPC 한 번 호출.
 * @param {string} name `reelpin_admin_overview` 같은 함수 이름
 * @param {object} args 함수 인자 (JSON)
 * @param {{cfg:{url:string,anonKey:string}, token:string, fetchImpl?:Function}} options
 * @returns {Promise<{ok:boolean, data?:any, status?:number, error?:string, message?:string}>}
 */
async function rpcCall(name, args, options) {
  const cfg = options && options.cfg;
  const token = (options && options.token) || '';
  if (!cfg || !cfg.url || !cfg.anonKey || !token) {
    return { ok: false, status: 503, error: 'not-configured', message: 'Supabase 설정이 없어요.' };
  }
  const doFetch = (options && options.fetchImpl) || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return { ok: false, status: 502, error: 'no-fetch', message: '네트워크를 쓸 수 없어요.' };

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        /* 이미 끝남 */
      }
    }, RPC_TIMEOUT_MS);
  }
  let res = null;
  try {
    res = await doFetch(cfg.url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(args || {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (e) {
    return { ok: false, status: 502, error: 'network', message: '데이터베이스에 연결하지 못했어요.' };
  } finally {
    if (timer) clearTimeout(timer);
  }

  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  if (!res.ok) return { ok: false, ...errorInfo(res.status, body) };
  return { ok: true, data: body == null ? null : body };
}

/** 대시보드 요약 — 회원 수·핀 수·인기 장소 TOP 10·분류 */
function overview(options) {
  return rpcCall('reelpin_admin_overview', {}, options);
}

/** 회원 목록 (이메일·닉네임 검색) */
function members(query, options) {
  return rpcCall('reelpin_admin_members', { p_search: String(query || '') || null }, options);
}

/** 전체 저장 핀 목록 (검색·분류 필터) */
function pins(filters, options) {
  const f = filters || {};
  return rpcCall(
    'reelpin_admin_pins',
    { p_search: String(f.search || '') || null, p_category: String(f.category || '') || null },
    options
  );
}

/** 회원 플랜 변경 (free ↔ pro) */
function setPlan(userId, plan, options) {
  return rpcCall('reelpin_admin_set_plan', { p_user_id: userId, p_plan: plan }, options);
}

/** 회원 삭제 (그 회원의 핀도 함께 정리 — auth.users 삭제 cascade) */
function deleteUser(userId, options) {
  return rpcCall('reelpin_admin_delete_user', { p_user_id: userId }, options);
}

/** 잘못 저장된 핀 수정 (상호·분류) */
function updatePin(target, options) {
  const t = target || {};
  return rpcCall(
    'reelpin_admin_update_pin',
    { p_user_id: t.userId, p_pin_id: t.pinId, p_name: t.name, p_category: t.category },
    options
  );
}

/** 핀 삭제 */
function deletePin(target, options) {
  const t = target || {};
  return rpcCall('reelpin_admin_delete_pin', { p_user_id: t.userId, p_pin_id: t.pinId }, options);
}

/** v2.23 — 제보 목록 (유형·상태 필터) */
function feedback(filters, options) {
  const f = filters || {};
  return rpcCall(
    'reelpin_admin_feedback',
    { p_kind: String(f.kind || '') || null, p_status: String(f.status || '') || null },
    options
  );
}

/** v2.23 — 제보 상태 변경 (open ↔ applied ↔ fixed) */
function updateFeedbackStatus(target, options) {
  const t = target || {};
  return rpcCall('reelpin_admin_update_feedback_status', { p_id: t.id, p_status: t.status }, options);
}

/** v2.23 — 제보 삭제 */
function deleteFeedback(id, options) {
  return rpcCall('reelpin_admin_delete_feedback', { p_id: id }, options);
}

// ── v2.31 🗂️ 기획전 · 📌 배너 ────────────────────────────────
/** 📌 배너 목록 (꺼 둔 것 포함) */
function banners(options) {
  return rpcCall('reelpin_admin_banners', {}, options);
}

/**
 * v2.32 — DB 에 새 열(image_url · chip)이 아직 없을 때를 대비한 **안전한 재시도**.
 *   · 먼저 새 인자까지 붙여 부르고, 함수가 없다는 응답(PGRST202)이 오면
 *     예전 인자만으로 한 번 더 부릅니다 → /admin 저장이 줄어들지 않습니다.
 *   · 그때는 `extrasSkipped: true` 를 돌려주어 화면이 “사진은 DB 준비 후 저장” 이라고 알립니다.
 *     (필요한 SQL 은 supabase/curation.sql 의 `alter table … add column if not exists`)
 */
async function saveWithFallback(name, full, legacy, options) {
  const first = await rpcCall(name, full, options);
  if (first.ok || first.error !== 'admin-schema-missing') return first;
  const retry = await rpcCall(name, legacy, options);
  if (!retry.ok) return retry;
  return { ...retry, extrasSkipped: true };
}

/** 📌 배너 저장 (id 없으면 새로) */
function saveBanner(target, options) {
  const t = target || {};
  const base = {
    p_id: t.id || null,
    p_title: String(t.title || ''),
    p_subtitle: String(t.subtitle || ''),
    p_badge: String(t.badge || '기획전'),
    p_link_url: String(t.linkUrl || ''),
    p_active: t.active !== false,
    p_sort_order: Number.isFinite(Number(t.sortOrder)) ? Number(t.sortOrder) : 0,
  };
  const full = { ...base, p_image_url: String(t.imageUrl || '') };
  return saveWithFallback('reelpin_admin_save_banner', full, base, options);
}

/** 📌 배너 삭제 */
function deleteBanner(id, options) {
  return rpcCall('reelpin_admin_delete_banner', { p_id: id }, options);
}

/** 🗂️ 기획전 목록 (꺼 둔 것 포함) */
function curated(options) {
  return rpcCall('reelpin_admin_curated', {}, options);
}

/** 🗂️ 기획전 저장 (id 없으면 새로) */
function saveCurated(target, options) {
  const t = target || {};
  const base = {
    p_id: t.id || null,
    p_title: String(t.title || ''),
    p_description: String(t.description || ''),
    p_sponsor: String(t.sponsor || ''),
    p_badge: String(t.badge || '기획전'),
    p_emoji: String(t.emoji || '📂'),
    p_color: String(t.color || '#0D9488'),
    p_places: Array.isArray(t.places) ? t.places : [],
    p_active: t.active !== false,
    p_sort_order: Number.isFinite(Number(t.sortOrder)) ? Number(t.sortOrder) : 0,
  };
  const full = { ...base, p_image_url: String(t.imageUrl || ''), p_chip: String(t.chip || '') };
  return saveWithFallback('reelpin_admin_save_curated', full, base, options);
}

/** 🗂️ 기획전 삭제 */
function deleteCurated(id, options) {
  return rpcCall('reelpin_admin_delete_curated', { p_id: id }, options);
}

// ── v2.41 📊 접속자 통계 ─────────────────────────────────────
/** 화면이 고를 수 있는 추이 길이 — 그 밖의 값은 14일로 맞춥니다. */
const VISIT_DAYS = [7, 14, 30];

/**
 * 📊 오늘/전체 접속자 · 일별 추이 (supabase/app_visits.sql 의 `app_visit_stats`)
 *   관리자 본인 토큰으로만 호출되고, 함수가 `auth.jwt()` 로 한 번 더 확인합니다.
 */
function visits(days, options) {
  const value = Number(days);
  const pDays = VISIT_DAYS.indexOf(value) >= 0 ? value : 14;
  return rpcCall('app_visit_stats', { p_app_id: 'reelpin', p_days: pDays }, options);
}

module.exports = {
  RPC_TIMEOUT_MS,
  rpcCall,
  saveWithFallback,
  overview,
  members,
  pins,
  setPlan,
  deleteUser,
  updatePin,
  deletePin,
  feedback,
  updateFeedbackStatus,
  deleteFeedback,
  banners,
  saveBanner,
  deleteBanner,
  curated,
  saveCurated,
  deleteCurated,
  VISIT_DAYS,
  visits,
};
