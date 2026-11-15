/**
 * utils/searchNav.js — v2.6
 * ─────────────────────────────────────────────────────────────
 * 🔍 검색 결과 수에 따라 **지도를 어디로 옮기고 / 무엇을 보여 줄지** 정하는 순수 규칙.
 * (지도·화면을 모르는 계산만 → 단위 테스트 가능)
 *
 *   검색어 없음        … 아무것도 하지 않음 (검색을 지웠다면 원래 보던 지도 상태로 복귀)
 *   0곳                … 지도는 그대로, 안내 토스트만
 *   1곳 (좌표 있음)     … 그 핀으로 지도 이동·확대 (목록 보기였다면 지도 보기로 전환)
 *   1곳 (좌표 없음)     … 지도에 찍을 수 없으니 목록에서 보여 주고 안내 토스트
 *   2곳 이상           … 지도에서는 검색창 아래 **결과 목록**(PinSearchResults),
 *                        목록 보기에서는 이미 걸러진 행 목록
 *
 *   · 한글 IME 조합 중 글자마다 지도가 튀지 않도록 화면은 SEARCH_DEBOUNCE_MS 만큼 기다렸다가 묻습니다.
 *   · 같은 검색 결과로 두 번 이동하지 않도록 searchNavigationKey() 로 한 번만 실행합니다.
 */
import { filterAndSearchPins, searchTokens } from './searchPins';

/** 입력이 멈추길 기다리는 시간 (한글 조합·빠른 타이핑 대비) */
export const SEARCH_DEBOUNCE_MS = 300;

/** 검색한 핀 하나로 이동할 때의 확대 단계 */
export const SEARCH_FOCUS_ZOOM = 16;

/** 지도 위 결과 목록에 한 번에 보여 주는 최대 행 수 */
export const SEARCH_RESULT_MAX = 4;

/**
 * 검색 결과 여러 곳을 한 화면에 담을 때 지도 여백(px).
 * 위쪽은 배너·검색창·분류 칩이 덮고, 아래쪽은 버튼 스택이 덮어서 넉넉히 비웁니다.
 */
export const SEARCH_RESULT_PADDING = { top: 210, right: 56, bottom: 150, left: 56 };

/** 핀에서 지도 좌표만 뽑기 (숫자가 아니면 null) */
export function pinMapCoords(pin) {
  if (!pin) return null;
  const lat = Number(pin.lat);
  const lng = Number(pin.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** 핀 목록 → 지도 좌표 목록 (좌표 없는 핀은 빠짐) */
export function mapCoordsOf(pins) {
  return (Array.isArray(pins) ? pins : []).map(pinMapCoords).filter(Boolean);
}

/** 분류 필터 **AND** 검색어 — 지도·목록과 같은 함수를 씁니다. */
export function searchMatches(pins, options = {}) {
  return filterAndSearchPins(pins, { filter: options.filter, query: options.query });
}

/**
 * 검색 상태 구분
 *   'idle'     검색어 없음
 *   'empty'    0곳
 *   'single'   1곳 + 좌표 있음
 *   'noCoords' 1곳 + 좌표 없음
 *   'multi'    2곳 이상
 */
export function searchMode(query, matches) {
  if (!searchTokens(query).length) return 'idle';
  const list = (Array.isArray(matches) ? matches : []).filter(Boolean);
  if (!list.length) return 'empty';
  if (list.length === 1) return pinMapCoords(list[0]) ? 'single' : 'noCoords';
  return 'multi';
}

/** 지도 보기에서 검색창 아래 결과 목록을 띄울지 (2곳 이상이고 상세 시트가 닫혀 있을 때) */
export function showSearchResultPanel({ view, query, matches, selected } = {}) {
  if (view !== 'map' || selected) return false;
  if (!String(query == null ? '' : query).trim()) return false;
  return searchMode(query, matches) === 'multi';
}

/**
 * 검색어를 지웠을 때 돌아갈 화면 — 내 위치를 알면 그곳으로, 모르면 핀 전체가 보이게.
 * @returns {{focus: {lat:number,lng:number}|null, fit: Array<{lat:number,lng:number}>}}
 */
export function restoreTarget({ myCoords, pins } = {}) {
  const origin = pinMapCoords(myCoords);
  if (origin) return { focus: origin, fit: [] };
  return { focus: null, fit: mapCoordsOf(pins) };
}

/**
 * 검색 결과 → 지도·화면이 할 일.
 * @param {object} input
 * @param {string} input.query      검색어(디바운스된 값)
 * @param {Array}  input.matches    분류 필터 AND 검색어에 맞는 핀
 * @param {'map'|'list'} input.view 지금 화면
 * @param {'map'|'list'} input.viewBefore 검색을 시작하기 전 화면
 * @param {object|null} input.myCoords
 * @param {Array} input.pins        저장된 핀 전체 (검색을 지웠을 때 복귀용)
 * @param {boolean} input.wasActive 이미 검색 중이었는지
 * @returns {{mode:string, count:number, actions:Array<object>, pinIds:Array<string>}}
 *   actions … { type:'view', view } | { type:'focus', coords } | { type:'fit', coords } | { type:'toast', message }
 */
export function planSearchNavigation(input = {}) {
  const query = String(input.query == null ? '' : input.query).trim();
  const matches = (Array.isArray(input.matches) ? input.matches : []).filter(Boolean);
  const view = input.view === 'list' ? 'list' : 'map';
  const viewBefore = input.viewBefore === 'list' ? 'list' : 'map';
  const wasActive = input.wasActive === true;
  const mode = searchMode(query, matches);
  const pinIds = matches.map((pin) => String(pin.id));

  if (mode === 'idle') {
    if (!wasActive) return { mode, count: 0, actions: [], pinIds: [] };
    const actions = [];
    if (view !== viewBefore) actions.push({ type: 'view', view: viewBefore });
    const restore = restoreTarget({ myCoords: input.myCoords, pins: input.pins });
    if (restore.focus) actions.push({ type: 'focus', coords: restore.focus });
    else if (restore.fit.length >= 2) actions.push({ type: 'fit', coords: restore.fit });
    else if (restore.fit.length === 1) actions.push({ type: 'focus', coords: restore.fit[0] });
    return { mode, count: 0, actions, pinIds };
  }

  if (mode === 'empty') {
    return {
      mode,
      count: 0,
      actions: [{ type: 'toast', message: '‘' + query + '’ 검색 결과가 없어요' }],
      pinIds,
    };
  }

  if (mode === 'noCoords') {
    const actions = [];
    if (view !== 'list') actions.push({ type: 'view', view: 'list' });
    actions.push({
      type: 'toast',
      message: '좌표가 없어 지도에 표시할 수 없어요 · ' + String(matches[0].name || query),
    });
    return { mode, count: 1, actions, pinIds };
  }

  if (mode === 'single') {
    const actions = [];
    if (view !== 'map') actions.push({ type: 'view', view: 'map' });
    actions.push({ type: 'focus', coords: pinMapCoords(matches[0]) });
    return { mode, count: 1, actions, pinIds, pin: matches[0] };
  }

  // 2곳 이상 — 지도에서는 결과 목록이 검색창 아래에 뜨고(showSearchResultPanel),
  // 목록 보기에서는 이미 걸러진 행이 보이므로 지도를 옮기지 않습니다.
  return { mode: 'multi', count: matches.length, actions: [], pinIds };
}

/** 같은 검색 결과로 지도를 두 번 옮기지 않기 위한 지문 */
export function searchNavigationKey(plan, query) {
  const mode = plan && plan.mode ? plan.mode : 'idle';
  const text = String(query == null ? '' : query).trim();
  const ids = plan && Array.isArray(plan.pinIds) ? plan.pinIds.join(',') : '';
  return mode + '|' + text + '|' + ids;
}
