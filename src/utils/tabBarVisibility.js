/**
 * src/utils/tabBarVisibility.js — v2.28.0
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청(2026-11-18):
 *   "상세 시트가 열리면 하단 탭바가 바닥 버튼(지도에서 보기 · 네이버지도 열기 ·
 *    카카오맵 열기) 위에 떠 있어. 시트가 열려 있는 동안엔 하단바를 숨겨 줘."
 *
 * 왜 규칙을 따로 두나
 *   · 하단바는 App.js 가 화면 맨 위 레이어에 그리고, 시트·레이어는 각 화면(MapScreen ·
 *     CollectionsScreen)과 App(🔍 · 🔔 · ☰ · 💬)이 따로 엽니다. 한 곳에서 "지금 어떤
 *     레이어가 떠 있는가" 만 모아 판단해야, 어느 화면에서 열어도 같은 결과가 나옵니다.
 *   · 그래서 화면 없이 검사할 수 있는 순수 함수로 둡니다(`test/ssr-smoke.jsx`).
 *
 * 숨기는 레이어 (`hiddenBy` 로 어떤 레이어 때문인지 돌려줍니다)
 *   pinDetail   … 장소 상세 시트 (PinDetailSheet) — 지도 탭에서 핀을 열었을 때
 *   listSheet   … 지도 목록 보기 레이어 (LayerSheet)
 *   placeSheet  … 지도 꾹 눌러 장소 등록 시트 (LongPressPlaceSheet · v2.33.0)
 *   collection  … 컬렉션 새로 만들기 시트 (CollectionsScreen)
 *   curated     … 기획전·공유받은 컬렉션 미리보기 시트 (CollectionPreviewSheet)
 *   search      … 🔍 검색 레이어 팝업
 *   alerts      … 🔔 알림 모음
 *   menu        … ☰ 메뉴 시트
 *   feedback    … 💬 제안 · 버그 제보
 *
 * 지도 탭이 아닐 때는 `pinDetail` · `listSheet` 를 세지 않습니다 — 탭을 옮겨도
 * `selectedPinId` 는 남아 있기 때문입니다(지도로 돌아오면 그때 다시 숨깁니다).
 */

/** 레이어별 사람이 읽는 이름 (검사·문서·토스트용) */
export const TAB_BAR_LAYERS = {
  pinDetail: '장소 상세 시트',
  listSheet: '목록 보기',
  placeSheet: '장소 등록 시트',
  collection: '새 컬렉션 시트',
  curated: '기획전 미리보기',
  search: '검색',
  alerts: '알림 모음',
  menu: '메뉴',
  feedback: '제안 · 버그 제보',
};

/**
 * 하단 탭바를 그릴지 판단합니다.
 * @param {object} state
 * @param {string} [state.tab]  지금 탭 ('map' | 'paste' | 'collections')
 * @param {boolean} [state.pinDetail]  장소 상세 시트가 열려 있는가
 * @param {boolean} [state.listSheet]  지도 목록 보기 레이어가 열려 있는가
 * @param {boolean} [state.placeSheet] 지도 꾹 눌러 장소 등록 시트가 열려 있는가
 * @param {boolean} [state.collection] 새 컬렉션 시트가 열려 있는가
 * @param {boolean} [state.curated] 기획전·공유받은 컬렉션 미리보기 시트가 열려 있는가
 * @param {boolean} [state.search]  🔍 검색 레이어
 * @param {boolean} [state.alerts]  🔔 알림 모음
 * @param {boolean} [state.menu]    ☰ 메뉴 시트
 * @param {boolean} [state.feedback] 💬 제보 시트
 * @returns {{visible: boolean, hiddenBy: string}}
 */
export function tabBarVisibility(state = {}) {
  const tab = state.tab || 'map';
  const onMap = tab === 'map';
  const open = [
    ['pinDetail', onMap && Boolean(state.pinDetail)],
    ['listSheet', onMap && Boolean(state.listSheet)],
    ['placeSheet', onMap && Boolean(state.placeSheet)],
    ['collection', Boolean(state.collection)],
    ['curated', Boolean(state.curated)],
    ['search', Boolean(state.search)],
    ['alerts', Boolean(state.alerts)],
    ['menu', Boolean(state.menu)],
    ['feedback', Boolean(state.feedback)],
  ];
  const hit = open.find((entry) => entry[1]);
  return hit ? { visible: false, hiddenBy: hit[0] } : { visible: true, hiddenBy: '' };
}

/** 숨김 이유의 한글 이름 (없으면 빈 문자열) */
export function tabBarHiddenReason(state) {
  const { hiddenBy } = tabBarVisibility(state);
  return hiddenBy ? TAB_BAR_LAYERS[hiddenBy] || hiddenBy : '';
}
