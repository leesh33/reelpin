/**
 * test/search-cluster-test.mjs — v2.5 🔍 내 핀 검색 · 📋 목록 정렬 · 📍 클러스터링
 *
 *   npm test              … 전체
 *   node test/run-tests.mjs search   … 이 파일만
 *
 * 검사하는 것 (모두 화면·지도 API 없이 도는 순수 로직)
 *   · 검색 매칭 — 가게명·지역·주소·분류·메뉴태그, 대소문자/공백 무시, 여러 낱말 AND
 *   · 분류 필터 AND 검색어
 *   · 목록 정렬 — 내 위치가 있으면 가까운 순, 없으면 최신순 (좌표 없는 핀은 뒤로)
 *   · 클러스터링 — 46px 안에 2곳 이상이면 한 무리, 줌을 키우면 자동으로 풀림
 *   · 웹 지도(네이버·Leaflet)가 **같은 규칙**을 쓰는지, 검색·목록이 지도 화면에 붙었는지
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  filterAndSearchPins,
  listSortLabel,
  normalizeSearchText,
  pinMatchesSearch,
  pinSearchText,
  pinTimestamp,
  searchPins,
  searchTokens,
  sortPinsForList,
  usableOrigin,
} from '../src/utils/searchPins.js';
import {
  CLUSTER_LABEL_MAX,
  CLUSTER_MIN_SIZE,
  CLUSTER_THRESHOLD_PX,
  clusterLabel,
  clusterPoints,
  clusterSpanPx,
  clusterColor,
  clusteredIds,
  isClusteredId,
  onlyClusters,
  pixelDistance,
} from '../src/utils/cluster.js';
import { DEFAULT_CATEGORY_COLORS, getCategoryColor } from '../src/utils/categories.js';
import { buildClusters, clusterBadgeSize, clusterIconHtml, clusterSignature, projectPinPoints } from '../src/components/RealMapView.web.js';

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

const BETONG = mkPin('p-betong', {
  name: '베통 성수',
  area: '성수동',
  category: '카페',
  menuTags: ['소금빵', '크루아상'],
  address: '서울특별시 성동구 연무장7가길 8',
  lat: 37.5429356,
  lng: 127.0552214,
  createdAt: '2026-11-14T09:00:00+09:00',
});
const CHICKEN = mkPin('p-chicken', {
  name: '한성치킨',
  area: '검단',
  category: '맛집',
  menuTags: ['후라이드'],
  address: '인천 서구 이음2로 70',
  createdAt: '2026-11-15T09:00:00+09:00',
});
const PARK = mkPin('p-park', {
  name: '검단호수공원',
  area: '검단',
  category: '가볼곳',
  menuTags: [],
  createdAt: '2026-11-12T09:00:00+09:00',
});
const CAFE_EN = mkPin('p-cafe-en', {
  name: 'Cafe Betong',
  area: '연남동',
  category: '카페',
  address: '서울 마포구 동진길 12',
  createdAt: '2026-11-11T09:00:00+09:00',
});
const NO_COORD = mkPin('p-nocoord', { name: '좌표없는핀', lat: undefined, lng: undefined, createdAt: '2026-11-13T09:00:00+09:00' });

const ALL = [BETONG, CHICKEN, PARK, CAFE_EN, NO_COORD];

// ── 1. 정규화 ───────────────────────────────────────────────
check('검색: 공백·대소문자 정규화', normalizeSearchText('  베 통  ') === '베통', normalizeSearchText('  베 통  '));
check('검색: 영문 소문자', normalizeSearchText('BETONG') === 'betong', normalizeSearchText('BETONG'));
check('검색: 낱말 나누기', JSON.stringify(searchTokens('  검단   치킨 ')) === JSON.stringify(['검단', '치킨']), searchTokens('  검단   치킨 '));
check('검색: 빈 검색어는 낱말 0개', searchTokens('   ').length === 0);
check(
  '검색: 검색 대상에 가게명·지역·주소·분류·메뉴태그가 모두 들어감',
  ['베통', '성수동', '연무장', '카페', '소금빵'].every((word) => pinSearchText(BETONG).indexOf(normalizeSearchText(word)) >= 0),
  pinSearchText(BETONG)
);

// ── 2. 핀 하나 매칭 ─────────────────────────────────────────
check('매칭: 이름 일부', pinMatchesSearch(BETONG, '베통') === true);
check('매칭: 띄어쓰기 무시 (베 통 → 베통 성수)', pinMatchesSearch(BETONG, '베 통') === true);
check('매칭: 대소문자 무시 (betong → Cafe Betong)', pinMatchesSearch(CAFE_EN, 'betong') === true);
check('매칭: 대문자 검색어도', pinMatchesSearch(CAFE_EN, 'BETONG') === true);
check('매칭: 지역', pinMatchesSearch(BETONG, '성수동') === true);
check('매칭: 주소', pinMatchesSearch(BETONG, '연무장7가길') === true);
check('매칭: 분류', pinMatchesSearch(CHICKEN, '맛집') === true);
check('매칭: 메뉴태그', pinMatchesSearch(BETONG, '소금빵') === true);
check('매칭: 여러 낱말 AND (성수 + 소금)', pinMatchesSearch(BETONG, '성수 소금') === true);
check('매칭: 여러 낱말 중 하나라도 없으면 제외', pinMatchesSearch(BETONG, '성수 치킨') === false);
check('매칭: 없는 낱말', pinMatchesSearch(BETONG, '없는가게') === false);
check('매칭: 빈 검색어는 모두 통과', pinMatchesSearch(BETONG, '') === true && pinMatchesSearch(null, '  ') === true);
check('매칭: 검색어가 있으면 null 핀은 제외', pinMatchesSearch(null, '베통') === false);
check('매칭: 옛 분류(베이커리)도 맛집으로 검색', pinMatchesSearch(mkPin('x', { category: '베이커리' }), '맛집') === true);

// ── 3. 목록 검색 ────────────────────────────────────────────
const betongOnly = searchPins(ALL, '베통');
check('검색 결과: 베통 → 1곳 (베통 성수)', betongOnly.length === 1 && betongOnly[0].id === 'p-betong', betongOnly.map((p) => p.id));
check('검색 결과: 한글 이름과 영문 이름은 서로 다른 글자 (Cafe Betong ≠ 베통)', searchPins(ALL, 'betong').length === 1 && searchPins(ALL, 'betong')[0].id === 'p-cafe-en');
check('검색 결과: 빈 검색어 → 전체', searchPins(ALL, '').length === ALL.length);
check('검색 결과: 원본 배열은 그대로', ALL.length === 5 && betongOnly.length !== ALL.length);

// ── 4. 분류 필터 AND 검색어 ─────────────────────────────────
const cafeBetong = filterAndSearchPins(ALL, { filter: '카페', query: '베통' });
check('AND: 카페 + 베통 → 1곳', cafeBetong.length === 1 && cafeBetong[0].id === 'p-betong', cafeBetong.map((p) => p.id));
const cafeOnly = filterAndSearchPins(ALL, { filter: '카페', query: '' });
check('AND: 검색어가 없으면 분류만', cafeOnly.length === 2 && cafeOnly.every((p) => p.category === '카페'), cafeOnly.length);
const allChicken = filterAndSearchPins(ALL, { filter: '전체', query: '치킨' });
check('AND: 전체 + 치킨 → 1곳', allChicken.length === 1 && allChicken[0].id === 'p-chicken');
check('AND: 분류와 검색이 어긋나면 0곳', filterAndSearchPins(ALL, { filter: '가볼곳', query: '베통' }).length === 0);
check('AND: 필터 없이도 동작', filterAndSearchPins(ALL, { query: '검단' }).length === 3, filterAndSearchPins(ALL, { query: '검단' }).length);

// ── 5. 목록 정렬 ────────────────────────────────────────────
check('정렬: createdAt 파싱', pinTimestamp(CHICKEN) > pinTimestamp(PARK));
check('정렬 이름: 내 위치 없으면 최신순', listSortLabel(null) === '최신순');
check('정렬 이름: 내 위치 있으면 가까운 순', listSortLabel({ lat: 37.58, lng: 126.71 }) === '가까운 순');
check('정렬: 좌표 없는 내 위치는 무시', usableOrigin({ lat: 'x' }) === null && listSortLabel({ lat: 'x' }) === '최신순');

const newestFirst = sortPinsForList(ALL, null).map((p) => p.id);
check(
  '정렬(최신순): 한성치킨 → 베통 → 좌표없는핀 → 호수공원 → Cafe',
  JSON.stringify(newestFirst) === JSON.stringify(['p-chicken', 'p-betong', 'p-nocoord', 'p-park', 'p-cafe-en']),
  newestFirst
);

// 내 위치: 검단 당하동 → 한성치킨(가까움) → 좌표없는핀? 좌표가 없어 뒤로 → 나머지 거리순
const nearFirst = sortPinsForList(ALL, { lat: 37.5828, lng: 126.7141 });
check('정렬(가까운 순): 첫 번째가 가장 가까운 검단 핀', nearFirst[0].id === 'p-chicken', nearFirst.map((p) => p.id));
check('정렬(가까운 순): 좌표 없는 핀은 맨 뒤', nearFirst[nearFirst.length - 1].id === 'p-nocoord', nearFirst.map((p) => p.id));
check('정렬: 원본 배열 순서는 그대로', ALL[0].id === 'p-betong');
check(
  '정렬: 같은 목록을 두 번 정렬해도 결과가 같음',
  JSON.stringify(sortPinsForList(ALL, { lat: 37.5828, lng: 126.7141 }).map((p) => p.id)) ===
    JSON.stringify(nearFirst.map((p) => p.id))
);

// ── 6. 픽셀 거리 ────────────────────────────────────────────
check('픽셀: 3-4-5 삼각형', pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 }) === 5);
check('픽셀: 값이 없으면 Infinity', pixelDistance({ x: 0, y: 0 }, null) === Infinity);
check('픽셀: 기준 거리는 46px (44~48 사이)', CLUSTER_THRESHOLD_PX >= 44 && CLUSTER_THRESHOLD_PX <= 48, CLUSTER_THRESHOLD_PX);

// ── 7. 클러스터 묶기 ────────────────────────────────────────
const pt = (id, x, y, lat = 37.58, lng = 126.71) => ({ id, x, y, lat, lng });

const near2 = clusterPoints([pt('a', 100, 100), pt('b', 130, 100)]);
check('클러스터: 30px 떨어진 2곳은 한 무리', near2.length === 1 && near2[0].count === 2, near2.map((g) => g.count));
check('클러스터: 무리 열쇠는 id 정렬', near2[0].key === 'a|b', near2[0].key);
check('클러스터: 대표 좌표는 가운데(130,100)', near2[0].x === 115 && near2[0].y === 100, [near2[0].x, near2[0].y]);

const far2 = clusterPoints([pt('a', 0, 0), pt('b', 60, 0)]);
check('클러스터: 60px 떨어지면 따로 (1 + 1)', far2.length === 2 && far2.every((g) => g.count === 1), far2.map((g) => g.count));

const edge = clusterPoints([pt('a', 0, 0), pt('b', CLUSTER_THRESHOLD_PX, 0)]);
check('클러스터: 정확히 46px 은 묶임(포함)', edge.length === 1 && edge[0].count === 2, edge.map((g) => g.count));
const justOver = clusterPoints([pt('a', 0, 0), pt('b', CLUSTER_THRESHOLD_PX + 0.5, 0)]);
check('클러스터: 46.5px 는 안 묶임', justOver.length === 2, justOver.map((g) => g.count));

const three = clusterPoints([pt('a', 100, 100), pt('b', 120, 110), pt('c', 90, 120)]);
check('클러스터: 3곳이 서로 가까우면 한 무리', three.length === 1 && three[0].count === 3, three.map((g) => g.count));

// 40px 씩 이어진 줄 — a-b, b-c 가 가까우면 a·b·c 모두 한 무리 (배지가 서로 겹치지 않게)
const chain = clusterPoints([pt('a', 0, 0), pt('b', 40, 0), pt('c', 80, 0)]);
check('클러스터: 이어진 핀은 한 무리 (사슬)', chain.length === 1 && chain[0].count === 3, chain.map((g) => g.count));
const twoGroups = clusterPoints([pt('a', 0, 0), pt('b', 30, 0), pt('c', 200, 0), pt('d', 230, 0)]);
check(
  '클러스터: 두 무리의 배지 중심은 서로 겹치지 않음',
  twoGroups.length === 2 && pixelDistance(twoGroups[0], twoGroups[1]) > CLUSTER_THRESHOLD_PX,
  twoGroups.map((g) => [g.x, g.count])
);

// 입력 순서를 바꿔도 같은 묶음 (배지가 깜빡이지 않게)
const shuffled = clusterPoints([pt('c', 90, 120), pt('a', 100, 100), pt('b', 120, 110)]);
check(
  '클러스터: 입력 순서와 무관하게 같은 묶음',
  shuffled.length === three.length && shuffled[0].key === three[0].key,
  [shuffled[0].key, three[0].key]
);

// 줌인하면 거리가 벌어져 자동으로 풀림 (같은 좌표, 2배 확대)
const zoomedIn = clusterPoints([pt('a', 100, 100), pt('b', 130, 100)].map((p) => ({ ...p, x: p.x * 2, y: p.y * 2 })));
check('클러스터: 줌을 2배로 키우면(30→60px) 개별 핀으로 풀림', onlyClusters(zoomedIn).length === 0, zoomedIn.map((g) => g.count));

// 이상한 값은 조용히 건너뜀
const dirty = clusterPoints([pt('a', 0, 0), { id: 'bad' }, { id: 'b', x: NaN, y: 0 }, null, pt('c', 10, 0)]);
check('클러스터: 좌표가 없는 항목은 제외', dirty.length === 1 && dirty[0].count === 2, dirty.map((g) => g.count));

check('클러스터: 최소 2곳', CLUSTER_MIN_SIZE === 2);
check('클러스터: onlyClusters 는 2곳 이상만', onlyClusters([{ count: 1, ids: ['a'] }, { count: 3, ids: ['b'] }]).length === 1);
check('클러스터: clusteredIds / isClusteredId', clusteredIds(three).has('a') && isClusteredId(three, 'a') && !isClusteredId(three, 'zz'));
check('클러스터: 배지 숫자 — 99까지는 그대로', clusterLabel(3) === '3' && clusterLabel(CLUSTER_LABEL_MAX) === '99', clusterLabel(CLUSTER_LABEL_MAX));
check('클러스터: 배지 숫자 — 100곳이면 99+', clusterLabel(100) === '99+', clusterLabel(100));
check('클러스터: 배지 크기는 두 자리에서 커짐', clusterBadgeSize(3) === 40 && clusterBadgeSize(12) === 46, clusterBadgeSize(12));
check('클러스터: 픽셀 폭·높이', (() => {
  const span = clusterSpanPx(three[0]);
  return span.w === 30 && span.h === 20;
})(), clusterSpanPx(three[0]));

// 배지 색 — 한 분류면 그 분류 색, 섞이면 다크
const sameCat = clusterPoints([{ ...pt('a', 0, 0), category: '카페' }, { ...pt('b', 10, 0), category: '카페' }]);
check(
  '클러스터 색: 한 분류면 그 분류 색',
  clusterColor(sameCat[0].members, []) === DEFAULT_CATEGORY_COLORS['카페'],
  clusterColor(sameCat[0].members, [])
);
const mixedCat = clusterPoints([{ ...pt('a', 0, 0), category: '카페' }, { ...pt('b', 10, 0), category: '맛집' }]);
check('클러스터 색: 섞이면 코랄', clusterColor(mixedCat[0].members, []) === '#FF5A36', clusterColor(mixedCat[0].members, []));

// ── 8. 지도 컴포넌트가 쓰는 조립 함수 ───────────────────────
const project = (lat, lng) => ({ x: lng * 1000, y: lat * 1000 });
const projected = projectPinPoints(
  [
    { id: 'p1', name: 'A', category: '카페', lat: 37.1, lng: 127.1 },
    { id: 'p2', name: 'B', category: '카페', lat: 37.1001, lng: 127.1001 },
    { id: 'p3', name: '선택됨', category: '맛집', lat: 37.1002, lng: 127.1002 },
    { id: 'p4', name: '좌표없음', category: '맛집' },
  ],
  project,
  'p3'
);
check('지도: 투영된 핀만 (선택 핀·좌표 없는 핀 제외)', projected.length === 2, projected.map((p) => p.id));
check('지도: 화면 좌표·분류를 함께 넘김', projected[0].x === 127100 && projected[0].category === '카페', projected[0]);

const built = buildClusters(
  [
    { id: 'p1', name: 'A', category: '카페', lat: 37.1, lng: 127.1 },
    { id: 'p2', name: 'B', category: '카페', lat: 37.1001, lng: 127.1001 },
    { id: 'p3', name: '멀리', category: '맛집', lat: 37.5, lng: 127.5 },
  ],
  project,
  null,
  []
);
check('지도: 2곳 이상만 클러스터로', built.length === 1 && built[0].count === 2, built.map((g) => g.count));
check('지도: 클러스터에 색을 붙임', built[0].color === getCategoryColor('카페', []), built[0].color);
check('지도: 지문(signature)은 무리 구성이 같으면 동일', clusterSignature(built) === clusterSignature(built.slice()));
check('지도: 투영 함수가 없으면 빈 목록 (예외 없음)', projectPinPoints([{ id: 'x', lat: 1, lng: 1 }], null, null).length === 0);

// 배지 HTML — 숫자·다크 배경·흰 테두리
const badge = clusterIconHtml(3, '#FF5A36');
check('배지 HTML: 숫자 표시', badge.indexOf('>3<') > 0, badge.slice(0, 80));
check('배지 HTML: 다크 네이비 원 + 두꺼운 흰 링', badge.indexOf('background:#0F172A') > 0 && badge.indexOf('0 0 0 2.5px #FFFFFF') > 0);
check('배지 HTML: 분류 색 헤일로(코랄)', badge.indexOf('rgba(255,90,54,0.5)') > 0);
check('배지 HTML: 100곳이면 99+', clusterIconHtml(120, null).indexOf('99+') > 0);

// ── 9. 화면 배선 ────────────────────────────────────────────
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const mapSource = read('src/components/RealMapView.web.js');
const screenSource = read('src/screens/MapScreen.js');
const listSource = read('src/components/PinListView.js');
const searchSource = read('src/components/PinSearchBar.js');
const clusterSource = read('src/utils/cluster.js');
const searchUtilSource = read('src/utils/searchPins.js');
const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const wiring = [
  ['지도(네이버): idle·zoom_changed 로 다시 묶기', /addListener\(map, 'idle'/.test(mapSource) && /addListener\(map, 'zoom_changed'/.test(mapSource)],
  ['지도(네이버): fromCoordToOffset 로 화면 픽셀', mapSource.indexOf('fromCoordToOffset') > 0],
  ['지도(Leaflet): zoomend·moveend 로 다시 묶기', /map\.on\('zoomend'/.test(mapSource) && /map\.on\('moveend'/.test(mapSource)],
  ['지도(Leaflet): latLngToContainerPoint 로 화면 픽셀', mapSource.indexOf('latLngToContainerPoint') > 0],
  ['지도: 두 엔진이 같은 clusterPoints/buildClusters 사용', mapSource.indexOf('buildClusters(pins, projectPoint') > 0 && mapSource.indexOf('../utils/cluster') > 0],
  ['지도: 클러스터 배지를 탭하면 fitBounds/확대', mapSource.indexOf('expandCluster') > 0 && mapSource.indexOf('fitBounds(bounds') > 0 && mapSource.indexOf('flyToBounds') > 0],
  ['지도: 무리에 든 핀은 개별 마커를 숨김', mapSource.indexOf('clusteredIds(clusters)') > 0 && mapSource.indexOf('if (hidden.has(String(pin.id))) return;') > 0],
  ['지도: 선택된 핀은 무리에 숨기지 않음', mapSource.indexOf('String(pin.id) === String(selectedId)) return;') > 0],
  ['지도: 배지 클릭이 지도 클릭으로 번지지 않음', mapSource.indexOf('stopPropagation') > 0],
  ['검색창: 돋보기 + ✕ 지우기 + 안내 문구', searchSource.indexOf('pin-search-clear') > 0 && searchSource.indexOf('내 핀 검색') > 0],
  ['검색창: 얇은 1줄 (높이 40)', /height: 40,/.test(searchSource)],
  // v2.16 — 지도 위 검색창은 상단 헤더 🔍(검색 레이어 팝업)로 올라갔습니다(목록 보기의 검색은 그대로).
  ['지도 화면: 지도 위 검색창 제거(헤더 🔍 팝업으로 이동)', screenSource.indexOf('<PinSearchBar') < 0],
  ['지도 화면: 필터 칩이 헤더 바로 아래(배너보다 위)', screenSource.indexOf('styles.chipWrap') > 0 && screenSource.indexOf('styles.chipWrap') < screenSource.indexOf('<GeofenceBanner')],
  ['지도 화면: [목록 보기] / [지도 보기] 토글', screenSource.indexOf('목록 보기') > 0 && listSource.indexOf('지도 보기') > 0],
  ['지도 화면: 목록 모드에서 목록이 지도를 덮음', screenSource.indexOf("view === 'list' && (") > 0],
  [
    '지도 화면: 실시간 개수 반영',
    screenSource.indexOf("' / ' + pins.length + ' 핀 표시 중'") > 0 && screenSource.indexOf('filtered.length') > 0,
  ],
  ['목록: 분류 색 점 + 분류 배지 + 이름 + 지역/주소 + 거리', listSource.indexOf('pin-dot-') > 0 && listSource.indexOf('pinDistanceMeters') > 0 && listSource.indexOf('formatDistance') > 0 && listSource.indexOf('categoryTint') > 0],
  ['목록: 탭하면 그 핀 상세 시트', listSource.indexOf('onSelectPin(pin.id)') > 0],
  ['목록: 빈 상태 안내 + 검색어 지우기', listSource.indexOf('검색 결과가 없어요') > 0 && listSource.indexOf('검색어 지우기') > 0],
  ['목록: 가까운 순/최신순 표기', listSource.indexOf('listSortLabel') > 0],
  ['순수 계산: 클러스터는 DOM 을 건드리지 않음', strip(clusterSource).indexOf('window') < 0 && strip(clusterSource).indexOf('document') < 0],
  ['순수 계산: 검색은 화면을 import 하지 않음', strip(searchUtilSource).indexOf('react') < 0],
  ['버전: v2.5 주석', mapSource.indexOf('v2.5') > 0 && screenSource.indexOf('v2.5') > 0],
];
for (const [label, ok] of wiring) {
  check(label, ok);
}

if (fails) {
  console.log('\nSEARCH_CLUSTER_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nSEARCH_CLUSTER_OK');
