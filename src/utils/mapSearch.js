/**
 * src/utils/mapSearch.js — v2.35.0
 * ─────────────────────────────────────────────────────────────
 * 🔍 지도 상단 **통합 검색창**(내 핀 + 새 장소 찾기)의 순수 규칙만 모읍니다.
 * (화면·지도 컴포넌트를 모르는 계산만 → 단위 테스트 가능)
 *
 * 상훈 님 요청(2026-11-21): "써보다보니 바로 검색하고 싶으면 몇 단계 찾아 들어가는 게
 * 좀 불편하긴 하네" → 지도 화면 **카테고리 칩 바로 위**에 검색 입력창 하나를 상시 두고,
 *   ① 입력하면 **내가 저장한 핀**을 먼저 보여 주고(드롭다운)
 *   ② 그 아래 **[‘검색어’ 네이버/카카오에서 새 장소 찾기]** 로 저장 탭의 `가게명 찾기`를
 *      **그 검색어로 바로 실행**합니다.
 *
 *   · MAP_SEARCH_PLACEHOLDER … 입력창 안내 문구 (내 핀 + 새 장소 둘 다라는 걸 한 줄로)
 *   · MAP_SEARCH_BAR_HEIGHT  … 390×844 에서 지도를 덮지 않는 알약 높이(42px)
 *   · shouldShowMapSearchPanel … 검색어가 있을 때만, 지도 보기 + 상세 시트가 닫혀 있을 때
 *   · newPlaceSearchLabel    … 결과 목록 아래 버튼 글씨
 *   · pasteSearchRequest     … 저장 탭에 넘기는 요청(넘기자마자 자동 실행 = auto)
 */
import { filterAndSearchPins } from './searchPins';

/** 입력창 안내 문구 — '내 핀'과 '새 장소' 둘 다 찾는 통합 검색임을 알립니다. */
export const MAP_SEARCH_PLACEHOLDER = '내 핀 · 새 장소 검색';

/** 알약 높이 — 요구사항 40~44px 안에서 지도와 분류 칩 사이에 얇게 놓입니다. */
export const MAP_SEARCH_BAR_HEIGHT = 42;

/** 내 핀 0곳일 때 결과 목록 안내 (아래 [새 장소 찾기] 버튼으로 이어짐) */
export const MAP_SEARCH_EMPTY_HINT = '내 핀에는 없어요';

/** 검색어 정리 — 앞뒤 공백만 제거 (검색 규칙은 utils/searchPins 가 맡습니다) */
export function mapSearchQuery(query) {
  return String(query == null ? '' : query).trim();
}

/**
 * 지도에서 검색 결과 드롭다운을 띄울지.
 *   · 지도 보기일 때만 (목록 보기는 목록 자체가 결과)
 *   · 상세 시트가 열려 있으면 숨김 (시트를 가리지 않게)
 *   · 검색어가 있을 때만 (비어 있으면 지도만)
 */
export function shouldShowMapSearchPanel({ view, query, selected } = {}) {
  if (view !== 'map') return false;
  if (selected) return false;
  return mapSearchQuery(query).length > 0;
}

/** 결과 목록 아래 버튼 글씨 — `‘한성’ 네이버/카카오에서 새 장소 찾기` */
export function newPlaceSearchLabel(query) {
  const keyword = mapSearchQuery(query);
  if (!keyword) return '';
  return '‘' + keyword + '’ 네이버/카카오에서 새 장소 찾기';
}

/** 결과 목록에 띄울 내 핀 — 지도와 같은 규칙(분류 칩 · 검색어 · 방문 상태 AND) */
export function mapSearchPins(pins, options = {}) {
  return filterAndSearchPins(pins, {
    filter: options.filter,
    query: options.query,
    visit: options.visit,
  });
}

/**
 * 저장 탭(`가게명 찾기`)에 넘기는 요청.
 *   auto: true → 저장 탭이 열리자마자 그 검색어로 카카오·네이버 조회를 실행합니다.
 *   (예전 돋보기 팝업의 [저장 탭에서 찾기]는 검색어만 채웠고, 이번 통합 검색창은 바로 찾습니다)
 */
export function pasteSearchRequest(query) {
  const keyword = mapSearchQuery(query);
  if (!keyword) return null;
  return { mode: 'search', query: keyword, auto: true };
}
