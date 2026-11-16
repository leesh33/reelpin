/**
 * test/search-nav-test.mjs — v2.6 🔍 검색 결과에 따른 지도 이동 · 결과 목록
 *
 *   npm test                     … 전체
 *   node test/run-tests.mjs nav  … 이 파일만
 *
 * 검사하는 것 (모두 화면·지도 API 없이 도는 순수 로직)
 *   · 검색 결과 0곳 / 1곳 / 1곳(좌표 없음) / 2곳 이상 판정
 *   · 1곳 → 그 핀으로 지도 이동 (목록 보기였다면 지도 보기로 전환)
 *   · 2곳 이상 → 지도에서는 검색창 아래 결과 목록, 목록 보기에서는 그대로
 *   · 0곳 → 지도는 그대로, 안내 토스트만
 *   · 검색어를 지우면 보던 화면(지도/목록)으로 복귀 + 내 위치(없으면 핀 전체)로
 *   · 같은 결과로 지도를 두 번 옮기지 않음 (지문)
 *   · 화면·지도 컴포넌트가 이 규칙에 실제로 연결되어 있는지
 */
import fs from 'node:fs';
import path from 'node:path';
import { filterAndSearchPins } from '../src/utils/searchPins.js';
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_FOCUS_ZOOM,
  SEARCH_RESULT_MAX,
  SEARCH_RESULT_PADDING,
  mapCoordsOf,
  pinMapCoords,
  planSearchNavigation,
  restoreTarget,
  searchMode,
  searchNavigationKey,
  showSearchResultPanel,
} from '../src/utils/searchNav.js';
import { DEFAULT_CATEGORY_COLORS } from '../src/utils/categories.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  }
};

// ── 검사용 핀 ────────────────────────────────────────────────
const mkPin = (id, over = {}) => ({
  id,
  name: '이름',
  area: '검단',
  category: '맛집',
  menuTags: [],
  address: '인천 서구 당하동',
  lat: 37.5828,
  lng: 126.7141,
  createdAt: '2026-11-10T10:00:00+09:00',
  ...over,
});

const CHICKEN = mkPin('p-chicken', {
  name: '한성치킨',
  lat: 37.58282,
  lng: 126.71412,
  createdAt: '2026-11-15T09:00:00+09:00',
});
const DONKATSU = mkPin('p-donkatsu', {
  name: '한성돈까스',
  lat: 37.5825,
  lng: 126.7131,
  area: '마전동',
  createdAt: '2026-11-14T09:00:00+09:00',
});
const PARK = mkPin('p-park', {
  name: '검단호수공원',
  area: '검단',
  category: '가볼곳',
  lat: 37.5827,
  lng: 126.71395,
  createdAt: '2026-11-12T09:00:00+09:00',
});
const BETONG = mkPin('p-betong', {
  name: '베통 성수',
  area: '성수동',
  category: '카페',
  lat: 37.5429356,
  lng: 127.0552214,
  address: '서울특별시 성동구 연무장7가길 8',
  createdAt: '2026-11-13T09:00:00+09:00',
});
const NO_COORD = mkPin('p-nocoord', {
  name: '좌표없는핀',
  lat: undefined,
  lng: undefined,
  address: '주소 미확인',
  createdAt: '2026-11-11T09:00:00+09:00',
});

const ALL = [CHICKEN, DONKATSU, PARK, BETONG, NO_COORD];
const ME = { lat: 37.5828, lng: 126.7141 };

// ── 1. 좌표 뽑기 ────────────────────────────────────────────
check('좌표: 핀에서 lat/lng', JSON.stringify(pinMapCoords(CHICKEN)) === JSON.stringify({ lat: 37.58282, lng: 126.71412 }), pinMapCoords(CHICKEN));
check('좌표: 없는 핀은 null', pinMapCoords(NO_COORD) === null && pinMapCoords(null) === null);
check('좌표: 문자열 숫자도 받아들임', JSON.stringify(pinMapCoords({ lat: '37.5', lng: '127' })) === JSON.stringify({ lat: 37.5, lng: 127 }));
check('좌표 목록: 좌표 없는 핀은 빠짐', mapCoordsOf(ALL).length === 4, mapCoordsOf(ALL).length);
check('좌표 목록: 배열이 아니면 빈 목록', mapCoordsOf(null).length === 0);

// ── 2. 결과 수 판정 ─────────────────────────────────────────
const matchesOf = (query, pins = ALL) => filterAndSearchPins(pins, { filter: '전체', query });
check('판정: 검색어 없음 → idle', searchMode('', matchesOf('')) === 'idle');
check('판정: 공백 검색어 → idle', searchMode('   ', matchesOf('   ')) === 'idle');
check('판정: 1곳(좌표 있음) → single', searchMode('베통', matchesOf('베통')) === 'single');
check('판정: 2곳 → multi', searchMode('한성', matchesOf('한성')) === 'multi');
check('판정: 0곳 → empty', searchMode('없는가게', matchesOf('없는가게')) === 'empty');
check('판정: 1곳(좌표 없음) → noCoords', searchMode('좌표없는', matchesOf('좌표없는')) === 'noCoords');

// ── 3. 결과 목록(지도 위) 표시 여부 ─────────────────────────
check('결과 목록: 지도 + 2곳 → 표시', showSearchResultPanel({ view: 'map', query: '한성', matches: matchesOf('한성'), selected: false }) === true);
check('결과 목록: 지도 + 1곳 → 숨김', showSearchResultPanel({ view: 'map', query: '베통', matches: matchesOf('베통'), selected: false }) === false);
check('결과 목록: 목록 보기에서는 숨김 (목록 자체가 결과)', showSearchResultPanel({ view: 'list', query: '한성', matches: matchesOf('한성'), selected: false }) === false);
check('결과 목록: 상세 시트가 열려 있으면 숨김', showSearchResultPanel({ view: 'map', query: '한성', matches: matchesOf('한성'), selected: true }) === false);
check('결과 목록: 검색어 없으면 숨김', showSearchResultPanel({ view: 'map', query: '', matches: ALL, selected: false }) === false);
check('결과 목록: 최대 행 수 4', SEARCH_RESULT_MAX === 4);

// ── 4. 화면 시뮬레이션 (MapScreen 과 같은 규칙) ─────────────
/**
 * MapScreen 의 상태 전이를 그대로 흉내 냅니다.
 *   검색어 입력 → planSearchNavigation → actions 적용 → 지문으로 중복 방지
 */
function makeScreen(options = {}) {
  const screen = {
    view: options.view || 'map',
    focus: null,
    fit: null,
    toasts: [],
    moves: 0,
    viewBefore: options.view || 'map',
    active: false,
    lastKey: '',
    results: false,
    pins: options.pins || ALL,
    myCoords: 'myCoords' in options ? options.myCoords : ME,
    /** 타이핑 (디바운스가 끝난 뒤의 검색어) */
    type(query) {
      const matches = filterAndSearchPins(screen.pins, { filter: '전체', query });
      const plan = planSearchNavigation({
        query,
        matches,
        view: screen.view,
        viewBefore: screen.viewBefore,
        myCoords: screen.myCoords,
        pins: screen.pins,
        wasActive: screen.active,
      });
      const key = searchNavigationKey(plan, query);
      if (key === screen.lastKey) {
        screen.results = showSearchResultPanel({ view: screen.view, query, matches, selected: false });
        return plan;
      }
      screen.lastKey = key;
      if (plan.mode === 'idle') screen.active = false;
      else {
        if (!screen.active) screen.viewBefore = screen.view;
        screen.active = true;
      }
      plan.actions.forEach((action) => {
        if (action.type === 'view') screen.view = action.view;
        else if (action.type === 'focus') {
          screen.focus = action.coords;
          screen.moves += 1;
        } else if (action.type === 'fit') {
          screen.fit = action.coords;
          screen.moves += 1;
        } else if (action.type === 'toast') screen.toasts.push(action.message);
      });
      screen.results = showSearchResultPanel({ view: screen.view, query, matches, selected: false });
      return plan;
    },
  };
  return screen;
}

// (a) 1곳 일치 — 그 핀으로 지도 이동
{
  const s = makeScreen();
  s.type('베통');
  check('시나리오① 1곳: 지도는 그대로 map', s.view === 'map');
  check('시나리오① 1곳: 그 핀 좌표로 이동', JSON.stringify(s.focus) === JSON.stringify({ lat: 37.5429356, lng: 127.0552214 }), s.focus);
  check('시나리오① 1곳: 결과 목록은 뜨지 않음', s.results === false);
  check('시나리오① 1곳: 토스트 없음', s.toasts.length === 0);

  // 같은 검색어를 다시 입력해도 지도를 또 옮기지 않음
  const movesBefore = s.moves;
  s.type('베통');
  check('시나리오① 1곳: 같은 결과로 두 번 이동하지 않음', s.moves === movesBefore, { before: movesBefore, after: s.moves });

  // 검색어를 지우면 내 위치로 복귀
  s.type('');
  check('시나리오① 1곳: 검색어를 지우면 내 위치로', JSON.stringify(s.focus) === JSON.stringify(ME), s.focus);
  check('시나리오① 1곳: 지우면 검색 비활성', s.active === false);
  check('시나리오① 1곳: 지우면 지도 보기', s.view === 'map');
}

// (b) 1곳 일치 — 목록 보기에서 검색하면 지도로 전환
{
  const s = makeScreen({ view: 'list' });
  s.type('베통');
  check('시나리오② 목록에서 1곳: 지도 보기로 전환', s.view === 'map');
  check('시나리오② 목록에서 1곳: 그 핀으로 이동', JSON.stringify(s.focus) === JSON.stringify({ lat: 37.5429356, lng: 127.0552214 }), s.focus);
  s.type('');
  check('시나리오② 목록에서 검색 후 지우면: 원래 목록 보기로 복귀', s.view === 'list', s.view);
}

// (c) 2곳 이상 — 지도에서는 검색창 아래 결과 목록
{
  const s = makeScreen();
  const plan = s.type('한성');
  check('시나리오③ 2곳: 판정 multi', plan.mode === 'multi');
  check('시나리오③ 2곳: 지도를 옮기지 않음', s.moves === 0 && s.focus === null);
  check('시나리오③ 2곳: 지도 보기 유지', s.view === 'map');
  check('시나리오③ 2곳: 검색창 아래 결과 목록 표시', s.results === true);
  check('시나리오③ 2곳: 결과 2곳 · 첫 핀은 최신(한성치킨)', plan.pinIds.length === 2 && plan.pinIds[0] === 'p-chicken', plan.pinIds);

  s.type('한성치킨');
  check('시나리오③ 2곳 → 1곳: 좁혀지면 그 핀으로 이동', s.focus && s.focus.lat === 37.58282, s.focus);
  check('시나리오③ 1곳이 되면 결과 목록은 사라짐', s.results === false);

  s.type('');
  check('시나리오③ 지우면: 결과 목록 사라짐', s.results === false);
  check('시나리오③ 지우면: 내 위치로 복귀', JSON.stringify(s.focus) === JSON.stringify(ME), s.focus);
}

// (d) 목록 보기에서 2곳 이상 — 목록 그대로 (거리순/최신순)
{
  const s = makeScreen({ view: 'list' });
  s.type('한성');
  check('시나리오④ 목록에서 2곳: 목록 보기 유지', s.view === 'list');
  check('시나리오④ 목록에서 2곳: 결과 목록 카드는 안 뜸', s.results === false);
  check('시나리오④ 목록에서 2곳: 지도를 옮기지 않음', s.moves === 0);
}

// (e) 0곳 — 지도는 그대로, 안내만
{
  const s = makeScreen();
  const plan = s.type('없는가게');
  check('시나리오⑤ 0곳: 판정 empty', plan.mode === 'empty');
  check('시나리오⑤ 0곳: 지도를 옮기지 않음', s.moves === 0);
  check('시나리오⑤ 0곳: 결과 목록도 안 뜸', s.results === false);
  check('시나리오⑤ 0곳: 안내 토스트에 검색어', s.toasts.length === 1 && s.toasts[0].indexOf('없는가게') >= 0, s.toasts);
  check('시나리오⑤ 0곳: 같은 검색어로 토스트 반복 없음', (() => { s.type('없는가게'); return s.toasts.length === 1; })(), s.toasts);
  s.type('');
  check('시나리오⑤ 0곳 뒤 지우면: 내 위치로 복귀', JSON.stringify(s.focus) === JSON.stringify(ME), s.focus);
}

// (f) 1곳이지만 좌표가 없음 — 목록에서 보여 주고 안내
{
  const s = makeScreen();
  const plan = s.type('좌표없는');
  check('시나리오⑥ 좌표 없음: 판정 noCoords', plan.mode === 'noCoords');
  check('시나리오⑥ 좌표 없음: 목록 보기로 전환 (핀을 볼 수 있게)', s.view === 'list');
  check('시나리오⑥ 좌표 없음: 지도 이동 없음', s.moves === 0);
  check('시나리오⑥ 좌표 없음: 안내 토스트', s.toasts.length === 1 && s.toasts[0].indexOf('좌표') >= 0, s.toasts);
}

// (g) 내 위치를 모를 때 — 지우면 핀 전체가 보이게(fit)
{
  const s = makeScreen({ myCoords: null });
  s.type('한성');
  s.type('');
  check('시나리오⑦ 위치 모름: 지우면 핀 전체 범위로 복귀', Array.isArray(s.fit) && s.fit.length === 4, s.fit);
  check('시나리오⑦ 위치 모름: focus 는 비움', s.focus === null);
}

// (h) 핀이 1곳뿐이고 위치를 모를 때 — 그 핀으로
{
  const one = [CHICKEN];
  const s = makeScreen({ myCoords: null, pins: one });
  s.type('한성');
  s.type('');
  check('시나리오⑧ 핀 1곳: 지우면 그 핀으로', s.focus && s.focus.lat === 37.58282, s.focus);
}

// (i) 검색을 시작하지 않았으면 아무 일도 없음
{
  const plan = planSearchNavigation({ query: '', matches: ALL, view: 'map', wasActive: false });
  check('시나리오⑨ 처음부터 검색어 없음: 동작 없음', plan.mode === 'idle' && plan.actions.length === 0);
}

// ── 5. 복귀 지점 계산 ──────────────────────────────────────
{
  const withLoc = restoreTarget({ myCoords: ME, pins: ALL });
  check('복귀: 내 위치를 알면 그곳으로', JSON.stringify(withLoc.focus) === JSON.stringify(ME) && withLoc.fit.length === 0);
  const noLoc = restoreTarget({ myCoords: null, pins: ALL });
  check('복귀: 내 위치를 모르면 핀 전체 범위', noLoc.focus === null && noLoc.fit.length === 4);
}

// ── 6. 지도에 넘기는 값 ─────────────────────────────────────
check('지도: 확대 단계 16', SEARCH_FOCUS_ZOOM === 16);
check('지도: 위쪽 여백이 배너·검색창을 덮을 만큼 (150px 이상)', SEARCH_RESULT_PADDING.top >= 150, SEARCH_RESULT_PADDING.top);
check('지도: 아래쪽 여백이 버튼 스택을 비움 (100px 이상)', SEARCH_RESULT_PADDING.bottom >= 100, SEARCH_RESULT_PADDING.bottom);
check('검색: 디바운스 300ms (한글 조합 대비)', SEARCH_DEBOUNCE_MS >= 250 && SEARCH_DEBOUNCE_MS <= 400, SEARCH_DEBOUNCE_MS);

// ── 7. 화면·지도 배선 ──────────────────────────────────────
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const screenSource = read('src/screens/MapScreen.js');
const listSource = read('src/components/PinListView.js');
const resultsSource = read('src/components/PinSearchResults.js');
const mapSource = read('src/components/RealMapView.web.js');
const navSource = read('src/utils/searchNav.js');
const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const wiring = [
  ['검색 규칙: 화면을 import 하지 않음 (순수)', strip(navSource).indexOf('react') < 0],
  ['화면: 디바운스 후에만 지도 이동', screenSource.indexOf('SEARCH_DEBOUNCE_MS') > 0 && screenSource.indexOf('setNavQuery') > 0],
  ['화면: 결과 수 규칙은 planSearchNavigation', screenSource.indexOf('planSearchNavigation') > 0],
  ['화면: 같은 결과로 두 번 이동하지 않음', screenSource.indexOf('searchNavigationKey') > 0 && screenSource.indexOf('navKeyRef') > 0],
  ['화면: 지도에 fit/fitKey 전달', screenSource.indexOf('fit={fit}') > 0 && screenSource.indexOf('fitKey={fitKey}') > 0],
  // v2.16 — 지도 위 검색창은 상단 헤더 🔍(검색 레이어 팝업)으로 옮겼습니다.
  //          결과 목록(PinSearchResults)은 목록 보기의 검색에서 이어지고, 지도 위에는 필터 칩만 남습니다.
  ['화면: 지도 위에는 결과 패널 없이 필터 칩만', screenSource.indexOf('<PinSearchResults') < 0 && screenSource.indexOf('styles.chipWrap') > 0],
  ['화면: 결과 목록 컴포넌트는 그대로 남아 있음(목록 보기)', fs.existsSync(path.join(process.cwd(), 'src/components/PinSearchResults.js'))],
  ['화면: 목록·결과에서 고르면 지도 + 상세 시트', screenSource.indexOf('openPinFromList') > 0 && screenSource.indexOf('onSelectPin(pin.id)') > 0],
  ['화면: 목록 → 지도 전환 시 범위 맞추기', /const coords = mapCoordsOf\(filtered\)/.test(screenSource) && /setFit\(coords\)/.test(screenSource)],
  ['화면: 검색어 지우기는 즉시 복귀', screenSource.indexOf('setNavQuery(\'\')') > 0],
  ['목록: 행을 누르면 onOpenPin (지도로 이동)', listSource.indexOf('onOpenPin(pin)') > 0],
  ['결과 목록: 최대 개수만 그리고 [전체 N곳]', resultsSource.indexOf('SEARCH_RESULT_MAX') > 0 && resultsSource.indexOf('전체 ') > 0],
  ['결과 목록: 행 testID', resultsSource.indexOf('pin-result-row-') > 0],
  ['지도(네이버): fit 으로 범위 맞추기', mapSource.indexOf('normalizeFitPoints') > 0 && mapSource.indexOf('fitBounds(bounds, { ...SEARCH_RESULT_PADDING') > 0],
  ['지도(Leaflet): fit 으로 범위 맞추기', mapSource.indexOf('flyToBounds') > 0 && mapSource.indexOf('paddingTopLeft') > 0],
  ['지도: 여백·확대는 searchNav 한 곳에서', mapSource.indexOf('../utils/searchNav') > 0],
  ['버전: v2.6 주석', navSource.indexOf('v2.6') > 0 && screenSource.indexOf('v2.6') > 0 && mapSource.indexOf('v2.6') > 0],
];
for (const [label, ok] of wiring) check(label, ok);

// 색 점은 분류 색을 그대로 씀 (목록·칩·지도 핀과 같은 색)
check('결과 목록: 분류 색 사용', resultsSource.indexOf('getCategoryColor') > 0 && resultsSource.indexOf('pin-dot') < 0);
check('결과 목록: 기본 분류 색이 정의되어 있음', !!DEFAULT_CATEGORY_COLORS['맛집']);

if (fails) {
  console.log('\nSEARCH_NAV_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nSEARCH_NAV_OK');
