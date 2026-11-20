/**
 * test/search-rank-test.mjs — v2.34.0
 * ─────────────────────────────────────────────────────────────
 * `가게명 찾기` 결과 정렬 (상훈 님 요청 IMG_9273)
 *   "중복 명칭이 검색 될 때는 첫번째는 제일 정확한 명칭,
 *    두번째는 나한테 제일 가까운 곳부터 상위에 노출"
 *
 *   ① 이름 정확도 등급 — 완전 일치 > 접두(지점명) > 부분 > 무관
 *   ② 거리 계산(Haversine) · 카카오가 잰 distanceM 우선
 *   ③ 정렬 — 정확도 먼저, 같은 정확도 안에서 가까운 순, 거리 모르는 곳은 뒤
 *   ④ 가까운 순 2차 조회 결과 합치기(중복 제거) — 정확도 15곳 밖의 내 주변 지점
 *   ⑤ extractor `searchPlacesDirect` 배선 — 위치를 넘기면 2차 조회 + 정렬 + 거리 채움
 *   ⑥ 화면 배선 — 저장 화면이 위치를 넘기고 카드에 거리를 그린다 · App 이 현재 위치를 넘긴다
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  MATCH_EXACT,
  MATCH_NONE,
  MATCH_PARTIAL,
  MATCH_PREFIX,
  distanceBetweenMeters,
  candidateDistanceMeters,
  isDistanceRanked,
  nameMatchTier,
  normalizePlaceName,
  rankPlaceCandidates,
  usableOrigin,
} from '../src/utils/placeRanking.js';
import { mergeNearbyCandidates, searchPlacesDirect } from '../src/services/extractor.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

const HOME = { lat: 37.5828, lng: 126.7141 }; // 인천 검단 당하동 (상훈 님 자택 근처)

// ═════════════════════════════════════════════════════════════
// 1. 이름 정확도 등급
// ═════════════════════════════════════════════════════════════
check('이름 정규화: 공백·괄호·따옴표 제거', normalizePlaceName(' 버거리 (홍대점) ') === '버거리홍대점', normalizePlaceName(' 버거리 (홍대점) '));
check('이름 정규화: 영문 소문자', normalizePlaceName('Burger  King') === 'burgerking', normalizePlaceName('Burger  King'));
check('정확도: 완전 일치 = 0', nameMatchTier('버거리', '버거리') === MATCH_EXACT, String(nameMatchTier('버거리', '버거리')));
check('정확도: 공백만 다른 완전 일치도 0', nameMatchTier('버 거 리', '버거리') === MATCH_EXACT);
check('정확도: 지점명(접두) = 1', nameMatchTier('버거리 홍대점', '버거리') === MATCH_PREFIX, String(nameMatchTier('버거리 홍대점', '버거리')));
check('정확도: 괄호 지점명(접두) = 1', nameMatchTier('버거리(홍대점)', '버거리') === MATCH_PREFIX);
check('정확도: 중간 포함 = 2', nameMatchTier('수제버거 버거리', '버거리') === MATCH_PARTIAL, String(nameMatchTier('수제버거 버거리', '버거리')));
check(
  '정확도: 동네 붙인 검색어의 가게명과 같으면 접두(1) — 먼 지점보다 먼저',
  nameMatchTier('버거리', '성수동 버거리') === MATCH_PREFIX,
  String(nameMatchTier('버거리', '성수동 버거리'))
);check(
  '정확도: 동네+가게명 검색이면 마지막 낱말로 시작하는 이름 = 1',
  nameMatchTier('소금빵집 성수', '성수동 소금빵') === MATCH_PREFIX,
  String(nameMatchTier('소금빵집 성수', '성수동 소금빵'))
);
check('정확도: 상관없는 이름 = 3', nameMatchTier('메가커피', '버거리') === MATCH_NONE);
check('정확도: 이름이 비면 3', nameMatchTier('', '버거리') === MATCH_NONE && nameMatchTier(null, '버거리') === MATCH_NONE);

// ═════════════════════════════════════════════════════════════
// 2. 거리
// ═════════════════════════════════════════════════════════════
check('좌표 검사: (0,0)·범위 밖·빈 값은 위치 없음', usableOrigin({ lat: 0, lng: 0 }) === null && usableOrigin({ lat: 91, lng: 0 }) === null && usableOrigin(null) === null);
check('좌표 검사: 정상 좌표', usableOrigin(HOME).lat === HOME.lat);
const seoulToGangnam = distanceBetweenMeters({ lat: 37.5665, lng: 126.978 }, { lat: 37.4979, lng: 127.0276 });
check('Haversine: 서울시청 → 강남역 약 8km', seoulToGangnam > 7500 && seoulToGangnam < 9000, String(Math.round(seoulToGangnam)));
check('Haversine: 좌표 없으면 null(0 아님)', distanceBetweenMeters(HOME, { lat: null, lng: null }) === null);
check(
  '거리: 카카오가 잰 distanceM 이 있으면 그 값을 그대로',
  candidateDistanceMeters(HOME, { lat: 37.6, lng: 126.7, distanceM: 1338 }) === 1338
);
check(
  '거리: distanceM 이 없으면 좌표로 계산',
  Math.round(candidateDistanceMeters(HOME, { lat: 37.5946, lng: 126.7168 })) > 1000
);

// ═════════════════════════════════════════════════════════════
// 3. 정렬 — ① 정확도 ② 거리
// ═════════════════════════════════════════════════════════════
const CANDIDATES = [
  { id: 'kakao-1', name: '버거리 홍대점', lat: 37.5557, lng: 126.9238 },
  { id: 'kakao-2', name: '버거리 선정릉역점', lat: 37.509, lng: 127.0387 },
  { id: 'kakao-3', name: '버거리 부산사직점', lat: 35.19, lng: 129.06 },
  { id: 'kakao-4', name: '버거리', lat: 37.5551, lng: 126.937 }, // 지점명 없는 정확한 이름
  { id: 'kakao-5', name: '버거리 인천검단아라신도시점', lat: 37.5947, lng: 126.7168 },
  { id: 'kakao-6', name: '햄버거리스트', lat: 37.5, lng: 127.0 }, // 부분 일치
];
const ranked = rankPlaceCandidates(CANDIDATES, '버거리', HOME);
check('[핵심] 1순위는 이름이 정확히 `버거리`', ranked[0].name === '버거리', ranked[0].name);
check('[핵심] 그 다음은 내 위치에서 가까운 지점부터 (검단 1.3km → 홍대 → 선정릉)',
  ranked[1].name === '버거리 인천검단아라신도시점' && ranked[2].name === '버거리 홍대점',
  JSON.stringify(ranked.map((c) => c.name))
);
const prefixDistances = ranked
  .filter((c) => nameMatchTier(c.name, '버거리') === MATCH_PREFIX)
  .map((c) => c.distanceM);
check(
  '[핵심] 지점명(접두) 그룹은 거리 오름차순',
  prefixDistances.every((d, i) => i === 0 || d >= prefixDistances[i - 1]),
  JSON.stringify(prefixDistances)
);
check(
  '부분 일치(`햄버거리스트`)는 지점명 그룹보다 뒤',
  ranked.findIndex((c) => c.name === '햄버거리스트') > ranked.findIndex((c) => c.name === '버거리 부산사직점')
);
check('정렬 결과에 distanceM(반올림 m)이 채워진다', ranked.every((c) => Number.isFinite(c.distanceM)));
check('정렬은 새 배열 — 원본 순서를 바꾸지 않는다', CANDIDATES[0].name === '버거리 홍대점' && CANDIDATES[0].distanceM === undefined);
check('isDistanceRanked: 거리가 채워졌으면 true', isDistanceRanked(ranked) === true && isDistanceRanked([{ name: 'A' }]) === false);

const noOrigin = rankPlaceCandidates(CANDIDATES, '버거리', null);
check('위치가 없으면 정확도만 — 정확한 이름이 여전히 1위', noOrigin[0].name === '버거리', noOrigin[0].name);
check('위치가 없으면 거리를 지어내지 않는다', noOrigin.every((c) => c.distanceM === undefined));
check(
  '위치가 없으면 같은 정확도 안에서는 원래 순서(정확도 응답 순서)를 지킨다',
  noOrigin.slice(1, 3).map((c) => c.name).join() === '버거리 홍대점,버거리 선정릉역점',
  JSON.stringify(noOrigin.map((c) => c.name))
);

const missingCoords = rankPlaceCandidates(
  [
    { id: 'a', name: '버거리 A점', lat: null, lng: null },
    { id: 'b', name: '버거리 B점', lat: 37.5946, lng: 126.7168 },
  ],
  '버거리',
  HOME
);
check('거리를 모르는 후보는 같은 정확도 그룹의 맨 뒤', missingCoords[0].name === '버거리 B점' && missingCoords[1].name === '버거리 A점');

// ═════════════════════════════════════════════════════════════
// 4. 2차(가까운 순) 조회 결과 합치기
// ═════════════════════════════════════════════════════════════
const base = [
  { id: 'kakao-1', name: '버거리 홍대점', lat: 37.5557, lng: 126.9238, providers: ['kakao'] },
];
const mergedSame = mergeNearbyCandidates(base, [
  { id: 'kakao-1', name: '버거리 홍대점', lat: 37.5557, lng: 126.9238, distanceM: 18900, provider: 'kakao' },
  { id: 'kakao-5', name: '버거리 인천검단아라신도시점', lat: 37.5947, lng: 126.7168, distanceM: 1338, provider: 'kakao' },
]);
check('합치기: 같은 id 는 한 곳으로(중복 없음)', mergedSame.list.length === 2 && mergedSame.added === 1, JSON.stringify(mergedSame.list.map((c) => c.name)));
check('합치기: 겹친 후보에 거리(m)를 채운다', mergedSame.list[0].distanceM === 18900, String(mergedSame.list[0].distanceM));
const mergedByName = mergeNearbyCandidates(
  [{ id: 'naver-0', name: '버거리 홍대점', lat: 37.55575, lng: 126.9238 }],
  [{ id: 'kakao-1', name: '버거리 홍대점', lat: 37.5557, lng: 126.9238, distanceM: 18900 }]
);
check('합치기: 이름이 같고 30m 안이면 다른 출처여도 한 곳', mergedByName.list.length === 1 && mergedByName.added === 0, String(mergedByName.list.length));

// ═════════════════════════════════════════════════════════════
// 5. extractor.searchPlacesDirect 배선 (fetch 스텁)
// ═════════════════════════════════════════════════════════════
const ACCURACY_DOCS = [
  '홍대점|37.5557|126.9238',
  '선정릉역점|37.509|127.0387',
  '한양대점|37.5573|127.0416',
  '건대점|37.5436|127.0704',
  '신대방삼거리역점|37.4995|126.9274',
  '교대역점|37.4935|127.0154',
  '숙대입구점|37.5443|126.9702',
  '영등포점|37.5165|126.907',
  '석촌역점|37.505|127.1',
  '부천시청역점|37.5046|126.764',
  '마포구청역점|37.5655|126.9022',
  '낙성대점|37.4757|126.9658',
  '부산사직점|35.19|129.06',
  '신촌점|37.5551|126.937',
  '우장산역점|37.5487|126.8364',
].map((row, i) => {
  const [branch, y, x] = row.split('|');
  return {
    id: 'doc-' + i,
    place_name: '버거리 ' + branch,
    category_name: '음식점 > 양식 > 햄버거',
    category_group_code: 'FD6',
    phone: '',
    address_name: '서울 어딘가 ' + (i + 1),
    road_address_name: '서울 어딘가로 ' + (i + 1),
    x,
    y,
    place_url: 'http://place.map.kakao.com/' + (100 + i),
  };
});
const NEARBY_DOCS = [
  { id: 'doc-near-1', place_name: '버거리 인천검단아라신도시점', y: '37.5947', x: '126.7168', distance: '1338', address_name: '인천 검단구 원당동 1030-12', road_address_name: '인천 검단구 이음1로 383' },
  { id: 'doc-near-2', place_name: '버거리 인천청라점', y: '37.535', x: '126.649', distance: '7897', address_name: '인천 서구 청라동 1', road_address_name: '인천 서구 청라대로 1' },
].map((d) => ({ ...d, category_name: '음식점 > 양식 > 햄버거', category_group_code: 'FD6', phone: '', place_url: 'http://place.map.kakao.com/' + d.id }));

const realFetch = globalThis.fetch;
const realKey = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
let calls = [];
process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY = 'KAKAOKEY';
delete process.env.EXPO_PUBLIC_NAVER_CLIENT_ID;
delete process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET;
delete process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_ID;
delete process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET;
globalThis.fetch = async (url) => {
  const href = String(url);
  calls.push(href);
  const docs = href.includes('sort=distance') ? NEARBY_DOCS : ACCURACY_DOCS;
  return { ok: true, status: 200, json: async () => ({ documents: docs, meta: {} }) };
};

const direct = await searchPlacesDirect('버거리', { near: HOME });
check('[핵심] 검색 성공 + 15곳으로 자름', direct.ok === true && direct.candidates.length === 15, String(direct.candidates.length));
check('[핵심] 1위는 내 주변 지점(검단 1.3km)', direct.candidates[0].name === '버거리 인천검단아라신도시점', direct.candidates[0].name);
check('[핵심] 2위는 그 다음 가까운 지점(청라 7.9km)', direct.candidates[1].name === '버거리 인천청라점', direct.candidates[1].name);
check('[핵심] 카드용 거리(m)가 채워져 있다', direct.candidates.every((c) => Number.isFinite(c.distanceM)), JSON.stringify(direct.candidates.slice(0, 3).map((c) => [c.name, c.distanceM])));
check('[핵심] distanceRanked=true(화면 안내용)', direct.distanceRanked === true);
check('거리순 2차 조회를 실제로 한 번 더 보낸다(sort=distance · radius=20000)', calls.some((u) => u.includes('sort=distance') && u.includes('radius=20000')), JSON.stringify(calls));
check('정확도 조회도 그대로 보낸다(sort=accuracy)', calls.some((u) => u.includes('sort=accuracy')));
check('2차 조회에서 새로 들어온 곳(nearbyAdded)', direct.nearbyAdded === 2, String(direct.nearbyAdded));
check('near 를 결과에 돌려준다', direct.near && direct.near.lat === HOME.lat);

const nearGroup = direct.candidates.filter((c) => nameMatchTier(c.name, '버거리') === MATCH_PREFIX);
check(
  '지점명 그룹은 거리 오름차순 (15곳 전체)',
  nearGroup.every((c, i) => i === 0 || c.distanceM >= nearGroup[i - 1].distanceM),
  JSON.stringify(nearGroup.map((c) => c.distanceM))
);

// 위치 없이 부르면 예전처럼: 2차 조회 없음 · 거리 없음 · 정확도 순서
calls = [];
const noNear = await searchPlacesDirect('버거리');
check('위치 없으면 요청은 정확도 조회 1번만', calls.length === 1 && !calls[0].includes('sort=distance'), JSON.stringify(calls));
check('위치 없으면 거리를 붙이지 않는다', noNear.candidates.every((c) => c.distanceM === undefined) && noNear.distanceRanked === false);
check('위치 없으면 정확도 응답 순서 그대로', noNear.candidates[0].name === '버거리 홍대점', noNear.candidates[0].name);

// 정확한 이름이 먼 곳에 있어도 1위 (정확도 우선)
const withExact = ACCURACY_DOCS.concat([
  { id: 'doc-exact', place_name: '버거리', category_name: '음식점 > 양식', category_group_code: 'FD6', phone: '', address_name: '부산', road_address_name: '부산', x: '129.059', y: '35.157', place_url: 'http://place.map.kakao.com/999' },
]);
globalThis.fetch = async (url) => {
  const href = String(url);
  return { ok: true, status: 200, json: async () => ({ documents: href.includes('sort=distance') ? NEARBY_DOCS : withExact, meta: {} }) };
};
const exactFirst = await searchPlacesDirect('버거리', { near: HOME });
check('[핵심] 먼 곳이라도 이름이 정확히 `버거리`면 1위', exactFirst.candidates[0].name === '버거리', JSON.stringify(exactFirst.candidates.slice(0, 3).map((c) => c.name)));

// 2차 조회가 실패해도 정확도 결과로 계속 (앱이 멈추지 않음)
globalThis.fetch = async (url) => {
  const href = String(url);
  if (href.includes('sort=distance')) return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ documents: ACCURACY_DOCS, meta: {} }) };
};
const nearFail = await searchPlacesDirect('버거리', { near: HOME });
check('2차 조회 실패해도 결과는 정상(정확도 순 + 거리 계산)', nearFail.ok === true && nearFail.candidates.length === 15 && nearFail.nearbyAdded === 0, String(nearFail.candidates.length));

globalThis.fetch = realFetch;
if (realKey) process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY = realKey;
else delete process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

// ═════════════════════════════════════════════════════════════
// 6. 화면 배선 (소스)
// ═════════════════════════════════════════════════════════════
const paste = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const app = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const ext = fs.readFileSync(path.join(process.cwd(), 'src/services/extractor.js'), 'utf8');

check('저장 화면: 내 위치(myCoords)를 받는다', /myCoords = null/.test(paste) && paste.indexOf('usableOrigin(myCoords)') > 0);
check('저장 화면: 위치가 없으면 이미 허용된 위치만 조용히 시도', paste.indexOf('softCurrentPosition()') > 0);
check('저장 화면: 검색에 near 를 넘긴다', /searchPlacesDirect\(value, \{ limit: MAX_DIRECT_CANDIDATES, near \}\)/.test(paste));
check('저장 화면: 결과마다 거리 배지를 그린다', paste.indexOf('formatDistance(c.distanceM)') > 0 && paste.indexOf('paste-cand-distance-') > 0);
check('저장 화면: 결과 줄에 `내 위치에서 가까운 순` 안내', paste.indexOf('내 위치에서 가까운 순') > 0 && paste.indexOf('meta.distanceRanked') > 0);
check('저장 화면: 위치를 모르면 거리 배지를 그리지 않는다', paste.indexOf('Number.isFinite(Number(c.distanceM))') > 0);
check('App: 지도 탭이 잡은 현재 위치를 저장 화면에 넘긴다', /myCoords=\{alertCoords\}/.test(app));
check('extractor: 정렬 모듈을 쓴다', ext.indexOf('rankPlaceCandidates(candidates, query, origin)') > 0);
check('extractor: 가까운 순 2차 조회 반경 20km', ext.indexOf('DIRECT_SEARCH_NEARBY_RADIUS_M = 20000') > 0 && ext.indexOf('radiusM: DIRECT_SEARCH_NEARBY_RADIUS_M') > 0);

if (fails) {
  console.log('\nSEARCH_RANK_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nSEARCH_RANK_TESTS_OK');
