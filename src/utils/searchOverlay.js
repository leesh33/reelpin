/**
 * utils/searchOverlay.js — v2.16
 * ─────────────────────────────────────────────────────────────
 * 🔍 검색 레이어 팝업(헤더 돋보기)의 **순수 규칙**만 모읍니다. (화면·지도 없이 단위 테스트)
 *
 *   ① 입력 검색   … 내 핀(가게명·지역·주소·분류·메뉴·메모) 실시간 매칭
 *                   (매칭 규칙은 v2.5 `utils/searchPins.js` 를 **그대로** 씁니다 — 같은 검색이 두 곳에서
 *                    다르게 동작하지 않도록)
 *   ② 추천 장소   … 내 위치를 알면 **가까운 저장 장소**, 모르면 **아직 안 가본(!visited)** 저장 장소
 *   ③ 인기 검색   … `data/popularPlaces.js` 의 큐레이션 목록 + 내 핀에 이미 있으면 그 핀
 *
 * 화면은 이 함수들이 돌려준 값만 그립니다 — 숫자를 지어내지 않습니다.
 */
import { pinDistanceMeters } from './pins';
import { pinTimestamp, searchPins as matchPins } from './searchPins';

/** 입력 중 결과 행에 한 번에 보여 줄 최대 개수 */
export const OVERLAY_RESULT_MAX = 6;

/** 추천 장소에 보여 줄 최대 개수 */
export const RECOMMEND_MAX = 4;

/** 위경도로 쓸 수 있는 값인지 (숫자·범위) */
export function usableCoords(coords) {
  if (!coords) return null;
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** 저장한 핀 목록에서 좌표·id 가 있는 것만 (그릴 수 없는 행은 빼고 셉니다) */
export function usablePins(pins) {
  return (Array.isArray(pins) ? pins : []).filter((pin) => pin && pin.id);
}

/**
 * 내 위치에서 가까운 저장 장소 (좌표 없는 핀은 제외 — 거리를 잴 수 없으니까)
 * @returns {{pin: object, distanceMeters: number}[]}
 */
export function nearestSavedPins(pins, myCoords, limit = RECOMMEND_MAX) {
  const origin = usableCoords(myCoords);
  if (!origin) return [];
  return usablePins(pins)
    .map((pin) => ({ pin, distanceMeters: pinDistanceMeters(origin, pin) }))
    .filter((item) => Number.isFinite(item.distanceMeters))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, Math.max(0, limit));
}

/** 아직 안 가본 저장 장소 — 최신 저장 순 (v2.10 `visited`) */
export function unvisitedSavedPins(pins, limit = RECOMMEND_MAX) {
  return usablePins(pins)
    .filter((pin) => pin.visited !== true)
    .sort((a, b) => pinTimestamp(b) - pinTimestamp(a))
    .slice(0, Math.max(0, limit));
}

/**
 * ② 추천 장소 — 위치가 있으면 '가까운 저장 장소', 없으면 '안 가본 저장 장소'
 * @returns {{ kind: 'near'|'todo'|'empty', label: string, sub: string, hasLocation: boolean,
 *            items: {pin: object, distanceMeters: number|null}[] }}
 */
export function recommendPlaces(pins, myCoords, options = {}) {
  const limit = options.limit == null ? RECOMMEND_MAX : options.limit;
  const origin = usableCoords(myCoords);
  const near = nearestSavedPins(pins, origin, limit);
  if (origin && near.length) {
    return {
      kind: 'near',
      label: '내 위치에서 가까운 곳',
      sub: '눌러서 지도에서 바로 보기',
      hasLocation: true,
      items: near,
    };
  }
  const todo = unvisitedSavedPins(pins, limit);
  if (todo.length) {
    return {
      kind: 'todo',
      label: '아직 안 가본 곳',
      sub: '저장만 해 두고 못 가본 장소',
      hasLocation: Boolean(origin),
      items: todo.map((pin) => ({
        pin,
        distanceMeters: origin ? pinDistanceMeters(origin, pin) : null,
      })),
    };
  }
  return {
    kind: 'empty',
    label: origin ? '내 위치에서 가까운 곳' : '아직 안 가본 곳',
    sub: origin ? '눌러서 지도에서 바로 보기' : '저장만 해 두고 못 가본 장소',
    hasLocation: Boolean(origin),
    items: [],
  };
}

/**
 * ① 입력 검색 — 검색어가 비면 결과 없음(추천·인기 목록을 그대로 보여 주기 위해)
 * @returns {{ query: string, items: object[], total: number, limit: number, truncated: boolean }}
 */
export function overlaySearchResults(pins, query, options = {}) {
  const limit = options.limit == null ? OVERLAY_RESULT_MAX : options.limit;
  const text = String(query == null ? '' : query).trim();
  if (!text) return { query: '', items: [], total: 0, limit, truncated: false };
  // v2.5 검색 규칙(낱말 AND · 공백 무시 · 소문자)을 그대로 씁니다.
  const matcher = typeof options.searchPins === 'function' ? options.searchPins : matchPins;
  const matches = matcher(usablePins(pins), text);
  const origin = usableCoords(options.myCoords);
  const rows = matches.map((pin) => ({
    pin,
    distanceMeters: origin ? pinDistanceMeters(origin, pin) : null,
  }));
  return {
    query: text,
    items: rows.slice(0, limit),
    total: rows.length,
    limit,
    truncated: rows.length > limit,
  };
}

/** 인기 검색 장소 이름이 내 핀에 있는지 — 이름 정규화 후 포함 비교('베통 성수' ↔ '베통') */
export function pinForPopularPlace(pins, place) {
  if (!place) return null;
  const tokens = [place.name, place.query]
    .map((value) =>
      String(value == null ? '' : value)
        .toLowerCase()
        .replace(/[\s\u00a0]+/g, '')
    )
    .filter(Boolean);
  if (!tokens.length) return null;
  const list = usablePins(pins);
  for (const pin of list) {
    const name = String(pin.name == null ? '' : pin.name)
      .toLowerCase()
      .replace(/[\s\u00a0]+/g, '');
    if (!name) continue;
    if (tokens.some((token) => name.indexOf(token) >= 0 || token.indexOf(name) >= 0)) return pin;
  }
  return null;
}

/**
 * ③ 인기 검색 장소 줄 — 큐레이션 목록에 '내 핀에 있으면 그 핀'을 붙입니다.
 * @returns {{place: object, pin: object|null}[]}
 */
export function popularPlaceRows(pins, places) {
  return (Array.isArray(places) ? places : []).filter(Boolean).map((place) => ({
    place,
    pin: pinForPopularPlace(pins, place),
  }));
}
