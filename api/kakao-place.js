/**
 * api/kakao-place.js — Vercel Serverless Function (v2.20)
 * ─────────────────────────────────────────────────────────────
 * GET /api/kakao-place?id=<카카오 placeId>
 *
 * 카카오맵 장소 패널(place-api.map.kakao.com/places/panel3/{id})을 서버가 대신 읽어
 * **요일별 영업시간 · 브레이크타임 · 라스트오더 · 정기휴무**와
 * **추천 메뉴 · 주차 여부**를 구조화해 돌려줍니다.
 *   → 릴스핀의 후보는 대부분 카카오 로컬 검색에서 오므로(placeUrl 이 place.map.kakao.com/…),
 *     이 경로가 있으면 저장한 핀 대부분의 영업 상태를 실제 데이터로 보여 줄 수 있습니다.
 *
 * ⚠️ 규칙
 *   1. **확인된 값만** 돌려줍니다. `open_hours` 가 없으면 `hours.hasHours=false` →
 *      앱은 배지를 지어내지 않고 `영업시간 미확인` 으로 둡니다.
 *   2. id 는 숫자만 허용(4~15자리) — 다른 주소로는 한 번도 요청하지 않습니다.
 *   3. 실패는 `{ ok:false, error }` 고정 모양. 업스트림 본문·키를 담지 않습니다.
 *   4. 4초 안에 끊습니다. (Vercel 무료 플랜 함수 시간 보호)
 *
 * 응답(200): `api/naver-place.js` 와 **같은 모양**(provider 만 'kakao')
 */
const { queryParam, fetchWithTimeout, sendJson, isGet, readJson, warn } = require('../server/http.js');
const { normalizeDayLabel, timeRangeOf, timesIn, parkingPhrase } = require('../server/place-info.js');

const PANEL_ENDPOINT = 'https://place-api.map.kakao.com/places/panel3/';
const FETCH_TIMEOUT_MS = 4500;
const CACHE_SECONDS = 300;
/** 카카오는 모바일 브라우저가 아니면 403 을 줍니다 — 지도 화면과 같은 머리글을 씁니다. */
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://map.kakao.com/',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

/** '화(11/17)' → '화' */
function dayFromKakao(label) {
  const text = String(label == null ? '' : label);
  const m = text.match(/^([일월화수목금토])/);
  return m ? m[1] : normalizeDayLabel(text);
}

/** 카카오 open_hours → 앱이 쓰는 영업시간 모양 */
function hoursFromKakao(openHours) {
  const hours = openHours && typeof openHours === 'object' ? openHours : {};
  const headline = hours.headline || {};
  const week = hours.week_from_today || {};
  const periods = Array.isArray(week.week_periods) ? week.week_periods : [];
  const days = [];
  const closedDays = [];
  periods.forEach((period) => {
    const list = (period && Array.isArray(period.days)) ? period.days : [];
    list.forEach((day) => {
      if (!day) return;
      const label = dayFromKakao(day.day_of_the_week_desc);
      if (!label || label === '매일') return;
      const on = day.on_days;
      if (!on) {
        if (closedDays.indexOf(label) < 0) closedDays.push(label);
        return;
      }
      const range = timeRangeOf(on.start_end_time_desc);
      const breaks = [];
      (Array.isArray(on.break_times_desc) ? on.break_times_desc : []).forEach((desc) => {
        const t = timesIn(desc);
        if (t[0] && t[1]) breaks.push({ start: t[0], end: t[1] });
      });
      const lastOrder = [];
      (Array.isArray(on.last_order_times_desc) ? on.last_order_times_desc : []).forEach((desc) => {
        const t = timesIn(desc)[0];
        if (t) lastOrder.push({ type: '', time: t });
      });
      days.push({
        day: label,
        start: range.start,
        end: range.end,
        closed: false,
        breaks,
        lastOrder,
        endsNextDay: false,
        note: '',
      });
    });
  });
  const hasHours = days.some((d) => d.start || d.end) || closedDays.length > 0;
  return {
    source: 'kakao',
    headline: {
      code: String(headline.code || ''),
      text: String(headline.display_text || ''),
      info: String(headline.display_text_info || ''),
    },
    days,
    closedDays,
    closedDates: [],
    freeText: String(hours.headline_addition && hours.headline_addition.business_hours_desc || ''),
    hasHours,
  };
}

/** 패널 JSON → 한줄 메모 재료 (추천 메뉴·주차·아기/대기) — 확인된 값만 */
function tipsFromKakao(panel) {
  const recommendedMenu = [];
  const menuItems = panel && panel.menu && panel.menu.menus && Array.isArray(panel.menu.menus.items)
    ? panel.menu.menus.items
    : [];
  menuItems.forEach((item) => {
    const name = String((item && item.name) || '').trim();
    if (item && item.is_recommend === true && name && recommendedMenu.indexOf(name) < 0) {
      recommendedMenu.push(name);
    }
  });

  const addInfo = (panel && panel.place_add_info) || {};
  const facilities = addInfo.facilities || {};
  const tags = Array.isArray(addInfo.tags) ? addInfo.tags.map((t) => String(t)) : [];
  const aiMate = addInfo.ai_mate || {};
  const mateInfos = Array.isArray(aiMate.store_infos) ? aiMate.store_infos : [];
  const parkingInfo = mateInfos.find((info) => info && /주차/.test(String(info.title || '')));

  let parking = '';
  if (facilities.is_parking === false) parking = '주차 불가';
  else if (facilities.is_parking === true) parking = '주차 가능';
  else if (parkingInfo) parking = parkingPhrase(parkingInfo.summary) || parkingPhrase(parkingInfo.title);

  let kids = '';
  if (tags.some((t) => /노키즈/.test(t))) kids = '노키즈존';
  else if (tags.some((t) => /아기\s*의자|유아\s*의자|키즈\s*체어/.test(t))) kids = '아기의자 있음';

  return {
    recommendedMenu: recommendedMenu.slice(0, 3),
    parking,
    kids,
    waiting: '',
  };
}

/** 카카오 패널 JSON → 정규화된 매장 정보 (순수 함수 — 테스트가 이걸 씁니다) */
function parseKakaoPlacePanel(json, placeId) {
  if (!json || typeof json !== 'object') return { ok: false, error: 'kakao-place-unreadable' };
  const summary = json.summary || {};
  const id = String(summary.confirm_id || placeId || '');
  const name = String(summary.name || '').trim();
  return {
    ok: true,
    provider: 'kakao',
    placeId: id,
    name,
    url: id ? 'https://place.map.kakao.com/' + id : '',
    hours: hoursFromKakao(json.open_hours),
    tips: tipsFromKakao(json),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  if (!isGet(req)) return sendJson(res, 405, { error: 'method-not-allowed' });

  const id = queryParam(req, 'id', 20);
  if (!/^\d{4,15}$/.test(id)) {
    return sendJson(res, 400, { error: 'bad-place-id', message: 'id(카카오 placeId, 숫자)가 필요합니다.' });
  }

  const response = await fetchWithTimeout(
    PANEL_ENDPOINT + id,
    { method: 'GET', headers: REQUEST_HEADERS },
    FETCH_TIMEOUT_MS
  );
  if (!response) {
    warn('kakao-place: network/timeout');
    return sendJson(res, 504, { error: 'kakao-place-timeout' });
  }
  if (!response.ok) {
    warn('kakao-place: upstream ' + response.status);
    return sendJson(res, 502, { error: 'kakao-place-failed', status: response.status });
  }
  const json = await readJson(response);
  if (!json) return sendJson(res, 502, { error: 'kakao-place-bad-body' });

  const parsed = parseKakaoPlacePanel(json, id);
  if (!parsed.ok) return sendJson(res, 200, parsed);
  return sendJson(res, 200, parsed, CACHE_SECONDS);
};

module.exports.parseKakaoPlacePanel = parseKakaoPlacePanel;
module.exports.hoursFromKakao = hoursFromKakao;
module.exports.tipsFromKakao = tipsFromKakao;
module.exports.PANEL_ENDPOINT = PANEL_ENDPOINT;
