/**
 * services/placeInfo.js (v2.20)
 * ─────────────────────────────────────────────────────────────
 * 저장한 핀의 **영업시간·추천 메뉴·주차**를 서버 프록시로 가져옵니다.
 *
 *   · 네이버 placeId  → `/api/naver-place?id=…`
 *   · 카카오 placeId  → `/api/kakao-place?id=…`
 *     (카카오 로컬 검색이 주는 `placeUrl` 이 `place.map.kakao.com/{id}` 라서,
 *      카카오로 찾은 핀 대부분이 이 경로로 영업시간을 얻습니다)
 *
 * 원칙
 *   1. 서버(프록시)가 있는 **웹에서만** 부릅니다. 네이티브에는 서버 키·프록시가 없습니다.
 *   2. id 를 못 찾은 핀은 요청하지 않습니다 → 화면은 `영업시간 미확인` 으로 둡니다.
 *   3. 실패해도 예외를 던지지 않습니다. (영업시간은 없어도 핀은 그대로 씁니다)
 */

/** 같은 매장 정보를 다시 부르지 않는 시간 — 6시간 */
export const PLACE_INFO_TTL_MS = 6 * 60 * 60 * 1000;
/** 서버 프록시 응답 대기 (업스트림 4.5초 + 여유) */
export const PLACE_INFO_TIMEOUT_MS = 9000;

export const NAVER_PLACE_ENDPOINT = '/api/naver-place';
export const KAKAO_PLACE_ENDPOINT = '/api/kakao-place';

/** 네이버 플레이스 링크·id 에서 placeId (없으면 '') */
export function extractNaverPlaceId(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (/^\d{5,15}$/.test(text)) return text;
  const patterns = [
    /map\.naver\.com\/p\/entry\/place\/(\d{5,})/i,
    /map\.naver\.com\/p\/place\/(\d{5,})/i,
    /map\.naver\.com\/v5\/entry\/place\/(\d{5,})/i,
    /(?:m\.)?place\.naver\.com\/[a-z]+\/(\d{5,})/i,
    /[?&]placeId=(\d{5,})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return '';
}

/** 카카오 placeUrl(`place.map.kakao.com/{id}`) 에서 placeId (없으면 '') */
export function extractKakaoPlaceId(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (/^\d{4,15}$/.test(text)) return text;
  const m = text.match(/place\.map\.kakao\.com\/(\d{4,15})/i) || text.match(/map\.kakao\.com\/places\/(\d{4,15})/i);
  return m ? m[1] : '';
}

/**
 * 핀에서 매장 상세를 부를 수 있는 대상 — { provider:'naver'|'kakao', id }
 *   · 핀에 저장된 naverPlaceId 를 가장 먼저 봅니다. (네이버 플레이스 직행 저장)
 *   · 그다음 매장 URL. 카카오 URL 이면 카카오, 네이버 URL 이면 네이버.
 *   · 둘 다 없으면 null — 요청하지 않습니다.
 */
export function placeInfoTargetOf(pin) {
  if (!pin) return null;
  const naverId =
    extractNaverPlaceId(pin.naverPlaceId) || extractNaverPlaceId(pin.placeUrl) || extractNaverPlaceId(pin.sourceUrl);
  if (naverId) return { provider: 'naver', id: naverId };
  const kakaoId = extractKakaoPlaceId(pin.placeUrl);
  if (kakaoId) return { provider: 'kakao', id: kakaoId };
  return null;
}

export function placeInfoPathOf(target) {
  if (!target || !target.id) return '';
  return (target.provider === 'kakao' ? KAKAO_PLACE_ENDPOINT : NAVER_PLACE_ENDPOINT) + '?id=' + encodeURIComponent(target.id);
}

/** 지금 다시 불러야 하는가 — 없거나 6시간 넘은 것만 */
export function needsPlaceInfo(pin, now) {
  if (!pin || pin.readOnly) return false;
  if (!placeInfoTargetOf(pin)) return false;
  const at = Date.parse(String(pin.hoursCheckedAt || ''));
  if (!Number.isFinite(at)) return true;
  const current = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  return current - at > PLACE_INFO_TTL_MS;
}

/** 서버 프록시가 있는 웹인가 (Platform.OS === 'web' 과 같은 판정) */
function isWebRuntime() {
  try {
    const { Platform } = require('react-native');
    return Boolean(Platform && Platform.OS === 'web');
  } catch (e) {
    return typeof window !== 'undefined';
  }
}

/** 타임아웃 있는 GET JSON — 실패는 null (예외 없음) */
async function getJson(url, timeoutMs) {
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        /* 이미 끝남 */
      }
    }, timeoutMs);
  }
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 핀 하나의 매장 상세를 가져옵니다.
 * @returns {Promise<{ok:boolean, place?:object, reason?:string}>}
 *   ok:true 면 place.hours(영업시간) · place.tips(추천 메뉴·주차) 가 들어 있습니다.
 */
export async function fetchPlaceInfo(pin, options = {}) {
  const target = placeInfoTargetOf(pin);
  if (!target) return { ok: false, reason: 'no-place-id' };
  if (!isWebRuntime()) return { ok: false, reason: 'web-only' };
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : PLACE_INFO_TIMEOUT_MS;
  const url = (options.baseUrl || '') + placeInfoPathOf(target);
  const json = await getJson(url, timeoutMs);
  if (!json || typeof json !== 'object') return { ok: false, reason: 'network' };
  if (json.ok === false) return { ok: false, reason: String(json.error || 'place-info-failed') };
  const hours = json.hours && typeof json.hours === 'object' ? json.hours : null;
  const tips = json.tips && typeof json.tips === 'object' ? json.tips : {};
  const name = String(json.name || '').trim();
  const hasHours = Boolean(hours && (hours.hasHours || (Array.isArray(hours.days) && hours.days.length)));
  return {
    ok: true,
    provider: target.provider,
    place: {
      provider: String(json.provider || target.provider),
      placeId: String(json.placeId || target.id),
      name,
      url: String(json.url || ''),
      hours: hasHours ? hours : null,
      tips,
      fetchedAt: String(json.fetchedAt || new Date().toISOString()),
    },
  };
}

/**
 * 핀 + 매장 상세 → 핀에 저장할 값
 *   · hours        … 영업시간(배지 계산용). 확인되지 않았으면 null
 *   · hoursCheckedAt … 확인한 시각(6시간 캐시)
 *   · hoursName    … 서버가 확인한 매장 이름(이름이 다르면 화면에서 조용히 무시)
 */
export function pinHoursPatch(place, now) {
  const at = now instanceof Date ? now : new Date();
  return {
    hours: place && place.hours ? place.hours : null,
    hoursCheckedAt: at.toISOString(),
    hoursName: place ? String(place.name || '') : '',
  };
}
