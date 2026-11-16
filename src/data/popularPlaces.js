/**
 * data/popularPlaces.js — v2.16
 * ─────────────────────────────────────────────────────────────
 * 🔍 검색 레이어 팝업의 **요즘 인기 검색 장소** 목록.
 *
 *   · 이 목록은 **릴스핀에서 실제로 자주 저장된 곳 + 상훈 님이 저장해 둔 단골**을 사람이 골라
 *     적어 둔 **큐레이션**입니다. 실시간 집계 숫자가 아닙니다 → 화면에서도 '조회수' 같은 숫자는
 *     쓰지 않습니다(없는 통계를 지어내지 않기).
 *   · `query` 는 저장 탭 [가게명으로 찾기] 로 넘길 검색어입니다 (동네까지 붙여 정확도↑).
 *   · 내 핀에 이미 있는 곳이면(이름 정규화 포함 비교) 목록에서 '내 지도에 있음' 표시가 붙고,
 *     누르면 검색이 아니라 **그 핀의 지도 상세**로 바로 갑니다.
 */
export const POPULAR_PLACES = [
  { id: 'betong', name: '베통', area: '성수', menu: '소금빵', query: '베통 성수', label: '베통 성수 · 소금빵' },
  { id: 'onion', name: '어니언', area: '성수', menu: '카페', query: '어니언 성수', label: '어니언 성수 · 카페' },
  { id: 'yeonghwajang', name: '영화장', area: '동대문', menu: '고추삼선간짜장', query: '영화장 동대문', label: '영화장 · 고추삼선간짜장' },
  { id: 'hwamok', name: '화목순대국', area: '여의도', menu: '순대국', query: '화목순대국 여의도', label: '화목순대국 · 여의도' },
  { id: 'diodia', name: '디오디아', area: '강남', menu: '이탈리안', query: '디오디아 강남', label: '디오디아 강남 · 이탈리안' },
  { id: 'eommasone', name: '엄마손횟집', area: '연동', menu: '회', query: '엄마손횟집 연동', label: '엄마손횟집 연동 · 회' },
];

/** 목록 위에 붙는 짧은 설명 (숫자가 아니라 '고른 목록'이라는 사실만 말합니다) */
export const POPULAR_PLACES_TITLE = '요즘 인기 검색 장소';
export const POPULAR_PLACES_SUB = '많이 찾는 곳을 골라 뒀어요 · 눌러서 바로 찾기';

/** 한 줄 표기 — 예: `베통 성수 · 소금빵` (label 이 있으면 그 값을 그대로) */
export function popularPlaceLabel(place) {
  if (!place) return '';
  if (place.label) return String(place.label);
  const head = [place.name, place.area].filter(Boolean).join(' ');
  return place.menu ? head + ' · ' + place.menu : head;
}

/** 검색 입력으로 넘길 말 — query 가 없으면 이름+동네 */
export function popularPlaceQuery(place) {
  if (!place) return '';
  return String(place.query || [place.name, place.area].filter(Boolean).join(' ')).trim();
}
