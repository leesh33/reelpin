/**
 * src/utils/placeRanking.js — v2.34.0
 * ─────────────────────────────────────────────────────────────
 * `가게명 찾기`(직접 검색) 결과의 **정렬 규칙**만 모읍니다. (지도·화면 없이 단위 테스트)
 *
 * 상훈 님 요청 (IMG_9273)
 *   "저렇게 중복 명칭이 검색 될 때는 첫번째는 제일 정확한 명칭,
 *    두번째는 나한테 제일 가까운 곳부터 상위에 노출 했으면 좋겠어"
 *
 *   · `버거리` 를 찾으면 `버거리 홍대점`·`버거리 선정릉역점`·`버거리 제주점` 이
 *     거리와 무관하게(카카오 정확도 순) 15곳 안에 들어와, 정작 **내 집 앞 `버거리 인천검단점`**
 *     은 15곳 밖으로 밀려 보이지 않았습니다.
 *   · 그래서 ① **이름이 얼마나 정확한가** → ② **내 위치에서 얼마나 가까운가** 순으로 정렬합니다.
 *       정확도: 완전 일치(0) > 접두·핵심 이름 일치(1) > 부분 일치(2) > 이름과 무관(3)
 *       거리  : Haversine(m) — 가까운 곳이 먼저, 좌표를 모르는 곳은 같은 정확도 그룹의 맨 뒤
 *   · 정확도가 다르면 **먼 곳이라도 정확한 이름이 먼저** 옵니다. (요청 그대로)
 *   · 거리는 카카오 `sort=distance` 응답의 `distanceM` 이 있으면 그 값을 쓰고,
 *     없으면(네이버·정확도 응답) Haversine 으로 직접 잽니다.
 */

/** 이름 정확도 등급 — 작을수록 먼저 */
export const MATCH_EXACT = 0;
export const MATCH_PREFIX = 1;
export const MATCH_PARTIAL = 2;
export const MATCH_NONE = 3;

/**
 * 이름 비교용 정규화 — 소문자 · 공백 제거 · 괄호/따옴표/가운뎃점 같은 장식 제거.
 *   '버거리 (홍대점)' → '버거리홍대점'
 *   'Burger  King'    → 'burgerking'
 */
export function normalizePlaceName(name) {
  return String(name == null ? '' : name)
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[()[\]{}'"'`·・.,]/g, '');
}

/** 검색어의 낱말들(2글자 이상만) — '성수동 소금빵' → ['성수동', '소금빵'] */
function queryTokens(query) {
  return String(query == null ? '' : query)
    .trim()
    .split(/[\s\u00a0]+/)
    .map(normalizePlaceName)
    .filter((token) => token.length >= 2);
}

/**
 * 이름 정확도 등급 (0 완전 일치 → 3 이름과 무관)
 *
 *   exact   : '버거리' === '버거리'
 *   prefix  : '버거리 홍대점' / '버거리(홍대점)' — 검색어로 시작하는 지점명
 *             (검색어가 '성수동 소금빵'처럼 동네를 포함하면 마지막 낱말 '소금빵'으로 시작하는 이름도)
 *   partial : '수제버거 버거리' / '버거리' ⊂ '성수동 버거리' — 이름이 검색어 안/밖에 일부로 들어감
 *   none    : 이름에 검색어 낱말이 하나도 없음 (메뉴·분류로만 걸린 결과)
 */
export function nameMatchTier(name, query) {
  const n = normalizePlaceName(name);
  const q = normalizePlaceName(query);
  if (!n || !q) return MATCH_NONE;
  if (n === q) return MATCH_EXACT;

  const tokens = queryTokens(query);
  const lastToken = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  if (n.startsWith(q) || (lastToken && n.startsWith(lastToken))) return MATCH_PREFIX;
  if (n.includes(q) || q.includes(n)) return MATCH_PARTIAL;
  if (tokens.some((token) => n.includes(token))) return MATCH_PARTIAL;
  return MATCH_NONE;
}

/** 숫자로 바꿀 수 있는 값만 숫자로 — null / '' / boolean 은 NaN (Number(null)===0 함정) */
function toNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return NaN;
  return Number(value);
}

/** 위경도로 쓸 수 있는 값인지 (0,0 은 '위치 없음'으로 봅니다) */
export function usableOrigin(origin) {
  if (!origin || typeof origin !== 'object') return null;
  const lat = toNumber(origin.lat);
  const lng = toNumber(origin.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * 두 좌표 사이 직선거리(m) — Haversine.
 * 좌표가 없거나 이상하면 null (0 이 아닙니다).
 */
export function distanceBetweenMeters(origin, place) {
  const a = usableOrigin(origin);
  if (!a) return null;
  const lat2 = toNumber(place && place.lat);
  const lng2 = toNumber(place && place.lng);
  if (!Number.isFinite(lat2) || !Number.isFinite(lng2)) return null;
  if (Math.abs(lat2) > 90 || Math.abs(lng2) > 180) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - a.lat);
  const dLng = toRad(lng2 - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 후보 하나의 내 위치 기준 거리(m).
 *   · 카카오 `sort=distance` 가 재 준 `distanceM` 이 있으면 그 값을 그대로 (같은 지도가 잰 값)
 *   · 없으면 좌표로 Haversine
 *   · 좌표가 없으면 null
 */
export function candidateDistanceMeters(origin, candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const given = toNumber(candidate.distanceM);
  if (usableOrigin(origin) && Number.isFinite(given) && given >= 0) return given;
  return distanceBetweenMeters(origin, candidate);
}

/**
 * 검색 결과 정렬 — ① 이름 정확도 ② 내 위치에서 가까운 순 ③ 원래 순서(안정 정렬).
 *
 * @param {Array<object>} candidates 지도 3사에서 합친 후보
 * @param {string} query 사용자가 친 검색어
 * @param {{lat:number,lng:number}|null} [origin] 내 위치 (없으면 정확도만으로 정렬)
 * @returns {Array<object>} 정렬된 **새 배열**. 각 후보의 `distanceM`(반올림 m)을 채웁니다.
 */
export function rankPlaceCandidates(candidates, query, origin) {
  const list = Array.isArray(candidates) ? candidates : [];
  const hasOrigin = Boolean(usableOrigin(origin));
  const rows = list.map((candidate, index) => {
    const tier = nameMatchTier(candidate && candidate.name, query);
    const rawDistance = hasOrigin ? candidateDistanceMeters(origin, candidate) : null;
    const distanceM =
      rawDistance !== null && Number.isFinite(rawDistance) ? Math.round(rawDistance) : null;
    return { candidate, index, tier, distanceM };
  });

  rows.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ad = a.distanceM;
    const bd = b.distanceM;
    if (ad != null && bd != null && ad !== bd) return ad - bd;
    if (ad == null && bd != null) return 1; // 거리를 모르는 곳은 같은 정확도 그룹의 뒤로
    if (ad != null && bd == null) return -1;
    return a.index - b.index;
  });

  return rows.map(({ candidate, distanceM }) => {
    if (!hasOrigin) return { ...candidate };
    return { ...candidate, distanceM: distanceM == null ? candidate.distanceM : distanceM };
  });
}

/** 정렬 결과에서 '내 위치 기준 가까운 순'이 실제로 쓰였는지 (화면 안내 문구용) */
export function isDistanceRanked(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  return list.some((c) => c && Number.isFinite(Number(c.distanceM)));
}
