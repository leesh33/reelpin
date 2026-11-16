/**
 * utils/searchPins.js — v2.5
 * ─────────────────────────────────────────────────────────────
 * 🔍 내 핀 검색 + 📋 목록 정렬의 **순수 규칙**만 모읍니다. (화면·지도와 무관 → 단위 테스트 가능)
 *
 *   · 검색 대상 … 가게명(name) · 지역(area) · 주소(address) · 분류(category) · 메뉴태그(menuTags)
 *                · 📝 한줄 메모(memo) — v2.10 ("아기의자" 검색 → 메모에 적어 둔 핀 매칭)
 *   · 대소문자·공백에 흔들리지 않는 매칭
 *       '베 통' → '베통 성수'   (공백을 지우고 비교)
 *       'BETONG' → 'betong'     (소문자로 비교)
 *       '검단 치킨' → 두 낱말이 **모두** 어딘가에 있으면 통과 (낱말 AND)
 *   · 분류 필터는 **AND** 조건 — filterAndSearchPins(pins, { filter, query })
 *   · 목록 정렬 … 내 위치가 있으면 **가까운 순**, 없으면 **최신순(createdAt 내림차순)**
 *     (좌표가 없는 핀은 거리순에서 뒤로 밀립니다 — 사라지지는 않습니다)
 */
import { matchesFilter, mapLegacyCategory } from './categories';
import { pinDistanceMeters } from './pins';

/** 비교용 정규화 — 소문자 + 모든 공백 제거 ('  베 통 ' → '베통') */
export function normalizeSearchText(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '');
}

/** 검색어를 낱말 단위로 (낱말마다 공백은 이미 제거된 상태) */
export function searchTokens(query) {
  return String(query == null ? '' : query)
    .toLowerCase()
    .split(/[\s\u00a0]+/)
    .map((token) => token.replace(/[\s\u00a0]+/g, ''))
    .filter(Boolean);
}

/** 핀 하나가 검색되는 글자들 — 가게명·지역·주소·분류(옛 이름 포함)·메뉴태그·한줄 메모 */
export function pinSearchFields(pin) {
  if (!pin) return [];
  const tags = Array.isArray(pin.menuTags) ? pin.menuTags : [];
  const category = String(pin.category == null ? '' : pin.category);
  const fields = [pin.name, pin.area, pin.address, category, mapLegacyCategory(category), pin.memo];
  return fields.concat(tags).filter((field) => field != null && String(field).trim() !== '');
}

// ─────────────────────────────────────────────────────────────
// ✅ 방문 상태 필터 — 지도·목록 상단의 '전체 / 미방문 / 가봤어요'
// ─────────────────────────────────────────────────────────────
export const VISIT_ALL = '전체';
export const VISIT_TODO = '미방문';
export const VISIT_DONE = '가봤어요';
/** 화면에 그리는 순서 (전체 → 미방문 → 가봤어요) */
export const VISIT_FILTERS = [VISIT_ALL, VISIT_TODO, VISIT_DONE];

/** 모르는 값·빈 값은 '전체' 로 (칩이 사라지지 않게) */
export function normalizeVisitFilter(value) {
  return VISIT_FILTERS.indexOf(value) >= 0 ? value : VISIT_ALL;
}

/** 핀 하나가 방문 필터에 맞는가? (값이 없던 예전 핀 = 미방문) */
export function matchesVisit(pin, visit) {
  const filter = normalizeVisitFilter(visit);
  if (filter === VISIT_ALL) return true;
  const visited = Boolean(pin) && pin.visited === true;
  return filter === VISIT_DONE ? visited : !visited;
}

/** '{전체:N, 미방문:N, 가봤어요:N}' — 칩 옆 숫자 */
export function countByVisit(pins, options = {}) {
  const list = Array.isArray(pins) ? pins.filter(Boolean) : [];
  const base = typeof options.base === 'function' ? list.filter(options.base) : list;
  const done = base.filter((pin) => pin.visited === true).length;
  return { [VISIT_ALL]: base.length, [VISIT_TODO]: base.length - done, [VISIT_DONE]: done };
}

/** 방문 필터만 적용한 목록 */
export function filterByVisit(pins, visit) {
  const list = Array.isArray(pins) ? pins.filter(Boolean) : [];
  return list.filter((pin) => matchesVisit(pin, visit));
}

/** 핀 하나를 정규화한 한 줄로 — 낱말 매칭용 */
export function pinSearchText(pin) {
  return pinSearchFields(pin).map(normalizeSearchText).join(' ');
}

/** 검색어가 비어 있으면 모두 통과. 낱말이 여러 개면 **모두** 들어 있어야 통과. */
export function pinMatchesSearch(pin, query) {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  if (!pin) return false;
  const text = pinSearchText(pin);
  return tokens.every((token) => text.indexOf(token) >= 0);
}

/** 검색만 적용한 목록 */
export function searchPins(pins, query) {
  const list = Array.isArray(pins) ? pins.filter(Boolean) : [];
  if (!searchTokens(query).length) return list.slice();
  return list.filter((pin) => pinMatchesSearch(pin, query));
}

/**
 * 지도 필터(분류) **AND** 검색어 — 지도·목록이 같은 함수를 씁니다.
 * @param {Array<object>} pins
 * @param {{filter?:string, query?:string}} options
 */
export function filterAndSearchPins(pins, options = {}) {
  const list = Array.isArray(pins) ? pins.filter(Boolean) : [];
  const filter = options.filter;
  const query = options.query;
  // v2.10 — ✅ 방문 상태도 같은 자리에서 AND 조건으로 겁니다 (기본 '전체')
  const visit = normalizeVisitFilter(options.visit);
  const base = list.filter((pin) => matchesFilter(pin, filter) && matchesVisit(pin, visit));
  if (!searchTokens(query).length) return base;
  return base.filter((pin) => pinMatchesSearch(pin, query));
}

/** 핀의 저장 시각(ms). 값이 없거나 깨졌으면 0 (가장 오래된 것으로 취급) */
export function pinTimestamp(pin) {
  const time = Date.parse(String((pin && pin.createdAt) || ''));
  return Number.isFinite(time) ? time : 0;
}

/** 내 위치를 쓸 수 있는 좌표인지 */
export function usableOrigin(myCoords) {
  if (!myCoords) return null;
  const lat = Number(myCoords.lat);
  const lng = Number(myCoords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** 목록에서 보여 줄 정렬 이름 */
export function listSortLabel(myCoords) {
  return usableOrigin(myCoords) ? '가까운 순' : '최신순';
}

/**
 * 📋 목록 정렬
 *   · 내 위치가 있으면 … 좌표 있는 핀을 가까운 순으로, 좌표 없는 핀은 뒤에 최신순으로
 *   · 내 위치가 없으면 … 최신순 (createdAt 내림차순, 같으면 원래 순서 유지)
 * 원본 배열은 건드리지 않고 새 배열을 돌려줍니다.
 */
export function sortPinsForList(pins, myCoords) {
  const list = Array.isArray(pins) ? pins.filter(Boolean) : [];
  const origin = usableOrigin(myCoords);
  const rows = list.map((pin, index) => ({
    pin,
    index,
    time: pinTimestamp(pin),
    distance: origin ? pinDistanceMeters(origin, pin) : Infinity,
  }));

  if (!origin) {
    rows.sort((a, b) => b.time - a.time || a.index - b.index);
    return rows.map((row) => row.pin);
  }

  rows.sort((a, b) => {
    const aHas = Number.isFinite(a.distance);
    const bHas = Number.isFinite(b.distance);
    if (aHas && bHas && a.distance !== b.distance) return a.distance - b.distance;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return b.time - a.time || a.index - b.index;
  });
  return rows.map((row) => row.pin);
}
