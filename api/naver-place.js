/**
 * api/naver-place.js — Vercel Serverless Function (v2.20)
 * ─────────────────────────────────────────────────────────────
 * GET /api/naver-place?id=<네이버 placeId>
 *
 * 네이버 플레이스 **상세 페이지**(m.place.naver.com)를 서버가 대신 읽어
 * **영업시간 · 브레이크타임 · 라스트오더 · 정기휴무**를 구조화해 돌려줍니다.
 *   → 브라우저는 m.place.naver.com 을 읽지 못하고(CORS), 읽어도 460KB HTML 입니다.
 *   · 페이지 안 `window.__APOLLO_STATE__` 의 `placeDetail` 에
 *     `newBusinessHours`(요일별 영업시간·브레이크·라스트오더·정기휴무) 와
 *     `informationTab`(주차·시설·키워드) 이 들어 있습니다.
 *   · 메뉴는 `PlaceMenuCategory:recommend`(추천 메뉴) 순서를 그대로 씁니다.
 *
 * ⚠️ 규칙
 *   1. **확인된 값만** 돌려줍니다. 영업시간이 페이지에 없으면 `hours.hasHours=false` →
 *      앱은 배지를 지어내지 않고 `영업시간 미확인` 으로 둡니다.
 *   2. placeId 는 숫자만 허용(5~15자리) — 다른 주소로는 한 번도 요청하지 않습니다.
 *   3. 실패는 `{ ok:false, error }` 고정 모양. 업스트림 본문·키를 담지 않습니다.
 *   4. 4초 안에 끊습니다. (Vercel 무료 플랜 함수 시간 보호)
 *
 * 응답(200):
 *   { ok:true, provider:'naver', placeId, name, url,
 *     hours:{ source, headline:{code,text,info}, days:[{day,start,end,closed,breaks,lastOrder,endsNextDay,note}],
 *             closedDays:['화'], closedDates:['2026-11-20'], weekText, hasHours },
 *     tips:{ recommendedMenu:['지로케 라멘'], parking:'주차 불가', kids:'', waiting:'' },
 *     fetchedAt }
 */
const { queryParam, fetchWithTimeout, sendJson, isGet, warn } = require('../server/http.js');
const { normalizeDayLabel, weekdaysFromText, isoDatesFrom, parkingPhrase } = require('../server/place-info.js');

const PLACE_PAGE = 'https://m.place.naver.com/place/';
const FETCH_TIMEOUT_MS = 4500;
const MAX_HTML_CHARS = 900000;
const CACHE_SECONDS = 300;

/**
 * 문자열에서 `window.__APOLLO_STATE__ = {…};` 의 JSON 만 꺼냅니다.
 *   · 중괄호 짝을 문자열/이스케이프를 건너뛰며 세어 정확히 자릅니다.
 * @returns {object|null}
 */
function extractApolloState(html) {
  const text = String(html || '');
  const marker = 'window.__APOLLO_STATE__';
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const braceAt = text.indexOf('{', at);
  if (braceAt < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = braceAt; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(braceAt, i + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

/** 상태 트리에서 `placeDetail({…})` 객체를 찾습니다. (키 이름이 쿼리마다 달라 값으로 찾습니다) */
function findPlaceDetail(state) {
  if (!state || typeof state !== 'object') return null;
  const root = state.ROOT_QUERY;
  if (root && typeof root === 'object') {
    for (const key of Object.keys(root)) {
      if (key.indexOf('placeDetail(') === 0 && root[key] && typeof root[key] === 'object') return root[key];
    }
  }
  for (const key of Object.keys(state)) {
    const value = state[key];
    if (value && typeof value === 'object' && (value.newBusinessHours || value.informationTab)) return value;
  }
  return null;
}

/** `{__ref:'PlaceMenuItem:abc'}` 목록 → 실제 객체 목록 */
function resolveRefs(state, list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((item) => {
    if (!item) return;
    if (typeof item === 'string') {
      if (state[item]) out.push(state[item]);
      return;
    }
    if (item.__ref && state[item.__ref]) out.push(state[item.__ref]);
    else out.push(item);
  });
  return out;
}

/** 네이버 placeDetail → 앱이 쓰는 영업시간 모양 */
function hoursFromNaver(detail, state) {
  const blocks = Array.isArray(detail && detail.newBusinessHours) ? detail.newBusinessHours : [];
  const block = blocks[0] || null;
  const rows = block && Array.isArray(block.businessHours) ? block.businessHours : [];
  const days = rows.map((row) => {
    const span = row && row.businessHours;
    return {
      day: normalizeDayLabel(row && row.day),
      start: span ? String(span.start || '') : '',
      end: span ? String(span.end || '') : '',
      closed: !span || (!span.start && !span.end),
      breaks: (Array.isArray(row && row.breakHours) ? row.breakHours : [])
        .map((b) => ({ start: String((b && b.start) || ''), end: String((b && b.end) || '') }))
        .filter((b) => b.start && b.end),
      lastOrder: (Array.isArray(row && row.lastOrderTimes) ? row.lastOrderTimes : [])
        .map((t) => ({ type: String((t && t.type) || ''), time: String((t && t.time) || '') }))
        .filter((t) => t.time),
      endsNextDay: Boolean(row && row.showEndsNextDay),
      note: String((row && row.description) || ''),
    };
  });
  // 휴무 요일 — 정기휴무 문장 + 요일 칸이 비어 있는 행 둘 다 반영합니다.
  const closedDays = weekdaysFromText(block && block.comingRegularClosedDays);
  days.forEach((d) => {
    if (d.closed && d.day && d.day !== '매일' && closedDays.indexOf(d.day) < 0) closedDays.push(d.day);
  });
  const closedDates = isoDatesFrom(block && block.comingIrregularClosedDays);
  const headline = (block && block.businessStatusDescription) || {};
  const hasHours = days.some((d) => !d.closed && (d.start || d.end)) || closedDays.length > 0;
  return {
    source: 'naver',
    headline: {
      code: '',
      text: String(headline.status || ''),
      info: String(headline.description || headline.blindDescription || ''),
    },
    days,
    closedDays,
    closedDates,
    freeText: String((block && block.freeText) || ''),
    hasHours,
  };
}

/** placeDetail → 한줄 메모 재료 (추천 메뉴·주차·아기/대기) — 확인된 값만 */
function tipsFromNaver(detail, state) {
  const recommendedMenu = [];
  Object.keys(state || {}).forEach((key) => {
    if (key.indexOf('PlaceMenuCategory:') !== 0) return;
    const category = state[key];
    if (!category || category.kind !== 'recommend' || !Array.isArray(category.itemIds)) return;
    resolveRefs(state, category.itemIds).forEach((item) => {
      const name = String((item && item.name) || '').trim();
      if (name && recommendedMenu.indexOf(name) < 0) recommendedMenu.push(name);
    });
  });
  if (!recommendedMenu.length) {
    Object.keys(state || {}).forEach((key) => {
      if (key.indexOf('PlaceMenuItem:') !== 0) return;
      const item = state[key];
      const badges = (item && item.badges) || [];
      const name = String((item && item.name) || '').trim();
      if (name && badges.indexOf('repr') >= 0 && recommendedMenu.indexOf(name) < 0) recommendedMenu.push(name);
    });
  }
  const info = (detail && detail.informationTab) || {};
  const facilities = resolveRefs(state, info.facilities).map((f) => String((f && f.name) || '').trim());
  const noKids = Boolean(info.noKidsZone);
  let kids = '';
  if (noKids) kids = '노키즈존';
  else if (facilities.some((name) => /아기\s*의자|유아\s*의자|키즈\s*체어|아기의자/.test(name))) kids = '아기의자 있음';
  return {
    recommendedMenu: recommendedMenu.slice(0, 3),
    parking: parkingPhrase(info.parkingInfo && info.parkingInfo.description),
    kids,
    waiting: '',
  };
}

/** 네이버 플레이스 상세 페이지 HTML → 정규화된 매장 정보 (순수 함수 — 테스트가 이걸 씁니다) */
function parseNaverPlacePage(html, placeId) {
  const state = extractApolloState(html);
  if (!state) return { ok: false, error: 'naver-place-unreadable' };
  const detail = findPlaceDetail(state);
  if (!detail) return { ok: false, error: 'naver-place-no-detail' };
  const base = (placeId && state['PlaceDetailBase:' + placeId]) || {};
  const id = String(base.id || placeId || '');
  const hours = hoursFromNaver(detail, state);
  return {
    ok: true,
    provider: 'naver',
    placeId: id,
    name: String(base.name || '').trim(),
    url: id ? 'https://m.place.naver.com/place/' + id + '/home' : '',
    hours,
    tips: tipsFromNaver(detail, state),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  if (!isGet(req)) return sendJson(res, 405, { error: 'method-not-allowed' });

  const id = queryParam(req, 'id', 20);
  if (!/^\d{5,15}$/.test(id)) {
    return sendJson(res, 400, { error: 'bad-place-id', message: 'id(네이버 placeId, 숫자)가 필요합니다.' });
  }

  const response = await fetchWithTimeout(
    PLACE_PAGE + id + '/home',
    {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    },
    FETCH_TIMEOUT_MS
  );
  if (!response) {
    warn('naver-place: network/timeout');
    return sendJson(res, 504, { error: 'naver-place-timeout' });
  }
  if (!response.ok) {
    warn('naver-place: upstream ' + response.status);
    return sendJson(res, 502, { error: 'naver-place-failed', status: response.status });
  }
  let html = '';
  try {
    html = String(await response.text()).slice(0, MAX_HTML_CHARS);
  } catch (e) {
    html = '';
  }
  if (!html) return sendJson(res, 502, { error: 'naver-place-empty' });

  const parsed = parseNaverPlacePage(html, id);
  if (!parsed.ok) return sendJson(res, 200, { ...parsed, placeId: id });
  return sendJson(res, 200, parsed, CACHE_SECONDS);
};

module.exports.parseNaverPlacePage = parseNaverPlacePage;
module.exports.extractApolloState = extractApolloState;
module.exports.hoursFromNaver = hoursFromNaver;
module.exports.tipsFromNaver = tipsFromNaver;
module.exports.parkingPhrase = parkingPhrase;
module.exports.weekdaysFromText = weekdaysFromText;
module.exports.normalizeDayLabel = normalizeDayLabel;
module.exports.PLACE_PAGE = PLACE_PAGE;
