/**
 * test/map-search-test.mjs — v2.35.0 🔍 지도 상단 통합 검색창(내 핀 + 새 장소 찾기)
 *
 *   npm test                     … 전체
 *   node test/run-tests.mjs mapsearch  … 이 파일만
 *
 * 검사하는 것
 *   ① 검색창 모양·문구 (42px 알약 · `내 핀 · 새 장소 검색` · ✕ 지우기)
 *   ② 배치 (헤더 🔍 제거 · 분류 칩 바로 위 · 같은 상단 오버레이)
 *   ③ 통합 검색 동작
 *      · 입력하면 내 핀 결과 드롭다운 (지도 보기 + 검색어 + 상세 시트 닫힘)
 *      · 결과 아래 [‘검색어’ 네이버/카카오에서 새 장소 찾기] — 0곳일 때도
 *      · 저장 탭 `가게명 찾기`가 그 검색어로 **바로** 실행 (auto)
 *      · 바깥 탭 · ✕ → 검색어를 비우고 지도 보기로 복귀
 *   ④ 버전 2.35.0 일관성
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  MAP_SEARCH_BAR_HEIGHT,
  MAP_SEARCH_EMPTY_HINT,
  MAP_SEARCH_PLACEHOLDER,
  mapSearchPins,
  mapSearchQuery,
  newPlaceSearchLabel,
  pasteSearchRequest,
  shouldShowMapSearchPanel,
} from '../src/utils/mapSearch.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  }
};

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const expo = JSON.parse(read('app.json')).expo;

// ── 1. 검색창 모양 ─────────────────────────────────────────
check('검색창: 안내문구 = `내 핀 · 새 장소 검색`', MAP_SEARCH_PLACEHOLDER === '내 핀 · 새 장소 검색', MAP_SEARCH_PLACEHOLDER);
check(
  '검색창: 높이 40~44px (지도를 과도하게 가리지 않음)',
  MAP_SEARCH_BAR_HEIGHT >= 40 && MAP_SEARCH_BAR_HEIGHT <= 44,
  MAP_SEARCH_BAR_HEIGHT
);

const barSource = read('src/components/MapSearchBar.js');
check(
  '검색창: 알약(pill) · 반투명 흰색 · 그림자',
  barSource.indexOf('borderRadius: radius.pill') > 0 &&
    barSource.indexOf('rgba(255,255,255,0.96)') > 0 &&
    barSource.indexOf('shadowOpacity') > 0 &&
    barSource.indexOf('height: MAP_SEARCH_BAR_HEIGHT') > 0
);
check(
  '검색창: 좌우 16px · 돋보기 · ✕ 는 입력이 있을 때만',
  barSource.indexOf('marginHorizontal: 16') > 0 &&
    barSource.indexOf('name="search"') > 0 &&
    barSource.indexOf('hasValue &&') > 0 &&
    barSource.indexOf('testID="map-search-clear"') > 0
);
check(
  '검색창: 웹 입력 테두리·포커스 링 제거 + 한글 IME 안심(자동수정·대문자 끔)',
  barSource.indexOf('outlineStyle') > 0 && barSource.indexOf('autoCorrect={false}') > 0 && barSource.indexOf('autoCapitalize="none"') > 0
);

// ── 2. 배치 ────────────────────────────────────────────────
const headerSource = read('src/components/AppHeader.js');
check('헤더: 🔍 돋보기 제거 (header-search 없음)', headerSource.indexOf('header-search') < 0);
check(
  '헤더: 🔔 알림 모음 · ☰ 메뉴는 그대로',
  headerSource.indexOf('testID="header-alerts"') > 0 && headerSource.indexOf('testID="header-menu"') > 0
);
check(
  '헤더: 오른쪽 아이콘 순서 = alerts · menu',
  /HEADER_ACTIONS = \['alerts', 'menu'\]/.test(headerSource)
);

const appSource = read('App.js');
check(
  '앱: 헤더에 검색 핸들러를 넘기지 않음 (중복 방지)',
  appSource.indexOf('onPressSearch') < 0 && appSource.indexOf('onPressMenu: openMenu') > 0
);
check(
  '앱: 지도 탭에 [새 장소 찾기] 핸들러를 넘김',
  appSource.indexOf('onSearchNewPlace={goPasteSearch}') > 0 && appSource.indexOf('pasteSearchRequest(query)') > 0
);

const mapSource = read('src/screens/MapScreen.js');
check(
  '지도: 검색창이 분류 칩 바로 위 (같은 상단 오버레이)',
  mapSource.indexOf('<MapSearchBar') > 0 &&
    mapSource.indexOf('<MapSearchBar') < mapSource.indexOf('<FilterChips') &&
    mapSource.indexOf('styles.topOverlay') < mapSource.indexOf('<MapSearchBar')
);
check(
  '지도: 검색 결과 드롭다운은 검색창 바로 아래(MapSearchPanel)',
  mapSource.indexOf('<MapSearchPanel') > 0 &&
    mapSource.indexOf('<MapSearchBar') < mapSource.indexOf('<MapSearchPanel') &&
    mapSource.indexOf('<MapSearchPanel') < mapSource.indexOf('<FilterChips')
);
check(
  '지도: 지도 여백도 검색창만큼 늘어남 (SEARCH_RESULT_PADDING.top 260)',
  read('src/utils/searchNav.js').indexOf('top: 260') > 0
);

// ── 3. 통합 검색 규칙 ──────────────────────────────────────
check('규칙: 검색어 앞뒤 공백은 지운다', mapSearchQuery('  한성  ') === '한성' && mapSearchQuery(null) === '');
check(
  '규칙: 드롭다운은 지도 보기 + 검색어 있음 + 상세 시트 닫힘일 때만',
  shouldShowMapSearchPanel({ view: 'map', query: '한성', selected: false }) === true &&
    shouldShowMapSearchPanel({ view: 'map', query: '   ', selected: false }) === false &&
    shouldShowMapSearchPanel({ view: 'map', query: '', selected: false }) === false &&
    shouldShowMapSearchPanel({ view: 'list', query: '한성', selected: false }) === false &&
    shouldShowMapSearchPanel({ view: 'map', query: '한성', selected: true }) === false
);
check(
  '규칙: 결과 아래 버튼 글씨 = `‘검색어’ 네이버/카카오에서 새 장소 찾기`',
  newPlaceSearchLabel('  한성 ') === '‘한성’ 네이버/카카오에서 새 장소 찾기' && newPlaceSearchLabel('  ') === '',
  newPlaceSearchLabel('한성')
);
check('규칙: 0곳 안내 문구가 따로 있음(아래 [새 장소 찾기]로 이어짐)', MAP_SEARCH_EMPTY_HINT === '내 핀에는 없어요', MAP_SEARCH_EMPTY_HINT);

// 내 핀 검색 — 지도와 같은 규칙(분류 칩 · 방문 · 검색어 AND)
const PINS = [
  { id: 'p1', name: '한성치킨', area: '검단', category: '맛집', visited: false, lat: 37.58, lng: 126.71 },
  { id: 'p2', name: '한성돈까스', area: '마전동', category: '카페', visited: true, lat: 37.581, lng: 126.712 },
  { id: 'p3', name: '베통 성수', area: '성수동', category: '카페', visited: false, lat: 37.543, lng: 127.055 },
];
check(
  '검색: 내 핀에서 검색어로 찾는다 (2곳)',
  mapSearchPins(PINS, { filter: '전체', query: '한성', visit: '전체' }).map((p) => p.id).join(',') === 'p1,p2'
);
check(
  '검색: 분류 칩·방문 필터와 AND (지도 핀과 같은 목록)',
  mapSearchPins(PINS, { filter: '카페', query: '한성', visit: '전체' }).map((p) => p.id).join(',') === 'p2' &&
    mapSearchPins(PINS, { filter: '전체', query: '한성', visit: '가봤어요' }).map((p) => p.id).join(',') === 'p2'
);
check('검색: 맞는 핀이 없으면 0곳 (새 장소 찾기로 안내)', mapSearchPins(PINS, { filter: '전체', query: '없는가게' }).length === 0);

// 저장 탭 요청
check(
  '저장 탭: 검색어 + mode:search + auto (넘기자마자 조회)',
  JSON.stringify(pasteSearchRequest(' 한성 ')) === JSON.stringify({ mode: 'search', query: '한성', auto: true }),
  pasteSearchRequest(' 한성 ')
);
check('저장 탭: 빈 검색어는 요청하지 않는다', pasteSearchRequest('   ') === null && pasteSearchRequest(undefined) === null);

const pasteSource = read('src/screens/PasteScreen.js');
check(
  '저장 탭: auto 요청이면 그 검색어로 바로 검색 (runSearch)',
  pasteSource.indexOf('request.auto') > 0 && pasteSource.indexOf('runSearch(wantedQuery)') > 0
);
check(
  '저장 탭: 기존 가게명 찾기 흐름 그대로 (v2.34.0 정확도·거리순)',
  pasteSource.indexOf('searchPlacesDirect(value, { limit: MAX_DIRECT_CANDIDATES, near })') > 0
);

// 닫기 — ✕ · 바깥 탭
check(
  '닫기: ✕ · 바깥 탭 모두 검색어를 비우고 지도로 복귀(clearSearch)',
  mapSource.indexOf('onClear={clearSearch}') > 0 &&
    mapSource.indexOf('map-search-backdrop') > 0 &&
    mapSource.indexOf('onPress={clearSearch}') > 0 &&
    /const clearSearch = useCallback\(\(\) => \{\s*setQuery\(''\);\s*setNavQuery\(''\);\s*\}, \[\]\)/.test(mapSource)
);
check(
  '닫기: 검색어를 비우면 planSearchNavigation 이 보던 지도로 되돌린다',
  read('src/utils/searchNav.js').indexOf("if (mode === 'idle')") > 0
);

// 0곳 토스트는 드롭다운과 겹치지 않게 생략
check(
  '지도: 0곳 안내는 드롭다운 한 곳에서만 (토스트 중복 없음)',
  mapSource.indexOf("if (plan.mode !== 'empty') showToast(action.message);") > 0
);

// ── 4. 결과 목록이 재사용하는 컴포넌트 ─────────────────────
const resultsSource = read('src/components/PinSearchResults.js');
const panelSource = read('src/components/MapSearchPanel.js');
check(
  '결과 목록: 기존 PinSearchResults 재사용 (분류 색 점 · 행 testID)',
  panelSource.indexOf("from './PinSearchResults'") > 0 &&
    resultsSource.indexOf('getCategoryColor') > 0 &&
    resultsSource.indexOf('pin-result-row-') > 0
);
check(
  '결과 목록: footer(새 장소 찾기) · emptyHint(0곳 안내) 슬롯',
  resultsSource.indexOf('footer ? <View style={styles.footer}>{footer}</View>') > 0 &&
    resultsSource.indexOf('total === 0 && !!emptyHint') > 0
);
check(
  '결과 목록: [전체 N곳] 은 목록 보기로 (기존 동작 유지)',
  mapSource.indexOf('onShowAll={toggleView}') > 0
);
check(
  '결과 목록: 0곳일 때 [전체 0곳] 버튼은 그리지 않음',
  resultsSource.indexOf('{total > 0 && (') > 0
);
check(
  '결과 목록: 오른쪽 칸은 거리만 (아래 줄 주소와 중복되지 않게)',
  resultsSource.indexOf("? formatDistance(distance) : ''") > 0 && resultsSource.indexOf(': place;') < 0
);

// ── 5. 버전 ────────────────────────────────────────────────
check('버전: package.json · app.json = 2.35.0', pkg.version === '2.35.0' && expo.version === '2.35.0', pkg.version + '/' + expo.version);
check(
  '버전: 메뉴 · 앱 정보 · 제보 첨부값도 2.35.0',
  read('src/components/MenuDrawerModal.js').indexOf("APP_VERSION_LABEL = '릴스핀 v2.35.0'") > 0 &&
    read('src/screens/ProfileScreen.js').indexOf("APP_INFO_VERSION = '릴스핀 v2.35.0'") > 0 &&
    read('src/services/feedback.js').indexOf("APP_VERSION_NAME = '2.35.0'") > 0
);
check('버전: 예전 2.34.0 표기가 남아 있지 않다', !/릴스핀 v2\.34\.0/.test(read('src/components/MenuDrawerModal.js')));

if (fails) {
  console.log('\nMAP_SEARCH_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nMAP_SEARCH_OK');
