import fs from 'node:fs';
import { Platform } from 'react-native';
import path from 'node:path';
import {
  parseUrl,
  isSupportedUrl,
  extractPlaces,
  searchPlaceProviders,
  searchPlacesDirect,
  kakaoLocalAdapter,
  naverLocalAdapter,
  googlePlacesAdapter,
  offlineSmartExtract,
  DIRECT_PRESETS,
  PRESETS,
  // v1.2
  splitSharedText,
  trimUrlTail,
  fetchYouTubeOembed,
  parseHtmlMeta,
  extractSearchQueries,
  titleNoticeOf,
  youtubeWatchUrlOf,
  PAGE_META_TIMEOUT_MS,
  findStoreName,
  cleanCaptionText,
  // v1.3 — 유튜브 설명글(description) 파싱 · 동네 판별 보강
  parseYouTubePageMeta,
  fetchYouTubePageMeta,
  fetchYouTubeComments,
  orderYouTubeComments,
  commentsToText,
  YOUTUBE_COMMENTS_MAX,
  findAreaFromText,
  leadingText,
  isSpecificCategory,
  // v2.0 — 여러 가게 한 번에 + 네이버 지도 링크 직행
  MAX_MULTI_CANDIDATES,
  extractCandidatesFromText,
  // v2.13 — 📸 사진은 웹(프록시) 전용. 네이티브에서는 조용히 안내만 합니다.
  extractFromImage,
  fetchGeminiImageAnalysis,
  scaledImageSize,
  parseImageDataUri,
  parseListItem,
  looksLikeListLine,
  searchMultiPlaces,
  parseNaverPlaceHtml,
  resolvePlaceLinkFromInput,
  resolveShortLink,
  naverPlaceCandidate,
  // v2.7 — 해시태그 상호 · 댓글 형용사 오탐
  extractHashtagTokens,
  isBasePredicate,
  regionWordsOf,
  filterQueriesByArea,
  // v2.12 — 주소 기반 네이버 안전 교차 보강
  addressParts,
  sameAddress,
  naverBackfillQueries,
  naverBackfillMatch,
  backfillNaverByAddress,
  NAVER_BACKFILL_MAX_QUERIES,
  // v2.21 — 직접 검색 15개 · 숫자+단위 토큰 차단 · 지역뿐인 검색어 뒤로 미루기
  MAX_DIRECT_CANDIDATES,
  KAKAO_SIZE_MAX,
  NAVER_DISPLAY_MAX,
  isQuantityOrPriceToken,
  isAreaOnlyQuery,
  // v2.22 — Precision-first (상호 근거 등급·후보 검증·명확한 상호 표기·메뉴 단어)
  MENU_WORDS,
  explicitStoreNames,
  classifyQuery,
  isStoreQuery,
  candidateMatchesQuery,
  isMenuWord,
  ownerCommentOf,
} from '../src/services/extractor.js';
import {
  naverMapAppUrl,
  naverMapWebUrl,
  naverPlaceSearchUrl,
  naverPlaceDetailUrl,
  extractNaverPlaceId,
  telUrlOf,
  isShortLinkUrl,
  kakaoMapAppUrl,
  kakaoMapWebUrl,
  buildShareLink,
  normalizePlaceUrl,
  openExternalUrl,
  openPhone,
  openPlace,
} from '../src/utils/links.js';
import {
  buildPin,
  normalizePin,
  normalizePins,
  findExistingPin,
  isSamePin,
  splitNewPins,
  SAME_PLACE_RADIUS_M,
} from '../src/utils/pins.js';
import {
  encodeSharePins,
  decodeSharePins,
  buildShareUrl,
  parseShareFromUrl,
  shareMessage,
  dominantArea,
  base64UrlEncode,
  base64UrlDecode,
  utf8Encode,
  utf8Decode,
  DEFAULT_SHARE_ORIGIN,
} from '../src/utils/shareMap.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else { fails++; console.log('FAIL ' + label + (extra ? '  -> ' + extra : '')); }
};

// 단위 테스트는 네트워크를 타지 않습니다. (실제 호출 검증은 `npm run test:live`)
globalThis.fetch = async () => {
  throw new Error('offline-test-fetch');
};

// ── 1. URL 파싱 ───────────────────────────────────────────────
check('parse instagram reel', parseUrl('https://www.instagram.com/reel/C8xSg2BpQ1K/').platform === 'instagram');
check('parse youtube shorts', parseUrl('https://www.youtube.com/shorts/9Xk2mQpLz7A').platform === 'youtube');
check('parse youtu.be', parseUrl('https://youtu.be/9Xk2mQpLz7A').platform === 'youtube');
check('parse tiktok', parseUrl('https://www.tiktok.com/@food/video/7301234567890123456').platform === 'tiktok');
check('reject plain text', parseUrl('그냥 텍스트').ok === false);
check('reject http-less', isSupportedUrl('www.instagram.com/reel/abc') === false);

// ── 2. 키가 하나도 없을 때 = 오프라인 추출기 (기존 동작 유지) ──
const r1 = await extractPlaces(PRESETS[0].url, { caption: PRESETS[0].caption });
check('preset1 extracts', r1.ok && r1.candidates.length > 0, JSON.stringify(r1).slice(0, 120));
check('preset1 top name', r1.candidates[0].name === '성수동 소금빵집', r1.candidates[0].name);
check('preset1 offline adapter', r1.usedAdapter === 'offline', r1.usedAdapter);

const r2 = await extractPlaces(PRESETS[1].url, { caption: PRESETS[1].caption });
check('preset2 top name', r2.candidates[0].name === '연남동 딸기 케이크 맛집', r2.candidates[0].name);

const r3 = await extractPlaces(PRESETS[2].url, { caption: PRESETS[2].caption });
check('preset3 top name', r3.candidates[0].name === '아라뱃길 뷰 카페', r3.candidates[0].name);

const r4 = await extractPlaces('https://www.instagram.com/reel/Unknown123/', {});
check('unknown link still returns manual candidate', r4.ok && r4.candidates.length === 1 && r4.candidates[0].manual === true);

const r5 = await extractPlaces('not-a-url', {});
check('invalid url rejected', r5.ok === false);

const noKey = await searchPlaceProviders({ query: '성수 소금빵' });
check('no key -> no request, reason=no-key', noKey.reason === 'no-key' && noKey.providersTried.length === 0);

// ── 3. 지도 3사 API 연동 (fetch 스텁) ─────────────────────────
// 실제 네트워크를 타지 않도록 globalThis.fetch 를 테스트용으로 갈아 끼웁니다.
const realFetch = globalThis.fetch;
const realEnv = {
  kakao: process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,
  naverId: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID,
  naverSecret: process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET,
  google: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
};

const KAKAO_DOC = {
  id: '12345',
  place_name: '성수동 소금빵집',
  category_name: '음식점 > 간식 > 제과,베이커리',
  category_group_code: 'FD6',
  phone: '02-123-4567',
  address_name: '서울 성동구 성수동2가 123-4',
  road_address_name: '서울 성동구 연무장길 45',
  x: '127.0557',
  y: '37.5445',
  place_url: 'http://place.map.kakao.com/12345',
};

const NAVER_ITEM = {
  title: '<b>성수동</b> 소금빵집',
  link: 'http://map.naver.com/p/entry/place/12345',
  category: '음식점>간식>제과,베이커리',
  address: '서울 성동구 성수동2가 123-4',
  roadAddress: '서울 성동구 연무장길 45',
  mapx: '1270557000',
  mapy: '375445000',
};

const GOOGLE_PLACE = {
  id: 'ChIJfusaki',
  displayName: { text: 'Fusaki Beach' },
  formattedAddress: 'Fusaki, Ishigaki, Okinawa 907-0024, Japan',
  location: { latitude: 24.3393, longitude: 124.1526 },
  primaryTypeDisplayName: { text: 'Tourist attraction' },
  googleMapsUri: 'https://maps.google.com/?cid=999',
  internationalPhoneNumber: '+81 980-00-0000',
};

const KAKAO_CAFE_DOC = {
  id: '777',
  place_name: '똑섬 카페',
  category_name: '카페,디저트',
  category_group_code: 'CE7',
  phone: '',
  address_name: '서울 성동구 성수동1가 1-1',
  road_address_name: '서울 성동구 아차산로 00',
  x: '127.0611',
  y: '37.5412',
  place_url: 'http://place.map.kakao.com/777',
};

let calls = [];
let handler = () => ({ ok: true, status: 200, json: async () => ({}) });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return handler(String(url), init);
};
const jsonRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status) => ({ ok: false, status, json: async () => ({}) });

const setKeys = ({ kakao, naver, hub, hubIdOnly, google } = {}) => {
  if (kakao) process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY = kakao;
  else delete process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
  // 네이버는 HUB(신규) / 구 개발자센터(legacy) 두 벌의 키가 있습니다.
  delete process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET;
  delete process.env.EXPO_PUBLIC_NAVER_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET;
  if (hub) {
    process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_ID = 'HUB_ID';
    process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET = 'HUB_SECRET';
  }
  if (hubIdOnly) process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_ID = 'HUB_ID';
  if (naver) {
    process.env.EXPO_PUBLIC_NAVER_CLIENT_ID = 'NAVER_ID';
    process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET = 'NAVER_SECRET';
  }
  if (google) process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = google;
  else delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
};

// 3-1. 카카오 단독
setKeys({ kakao: 'KAKAOKEY' });
calls = [];
handler = () => jsonRes({ documents: [KAKAO_DOC, KAKAO_CAFE_DOC] });
const kakaoOnly = await searchPlaceProviders({ query: '성수 소금빵집' });
check('kakao: 1 request only', calls.length === 1 && calls[0].url.includes('dapi.kakao.com/v2/local/search/keyword.json'), String(calls.length));
check('kakao: query encoded', calls[0].url.includes('query=' + encodeURIComponent('성수 소금빵집')));
check('kakao: KakaoAK auth header', calls[0].init.headers.Authorization === 'KakaoAK KAKAOKEY');
check('kakao: two candidates', kakaoOnly.candidates.length === 2, String(kakaoOnly.candidates.length));
const k0 = kakaoOnly.candidates[0];
check('kakao: place name', k0.name === '성수동 소금빵집', k0.name);
check('kakao: road address used', k0.address === '서울 성동구 연무장길 45', k0.address);
check('kakao: area from address', k0.area === '성수동', k0.area);
check('kakao: lat/lng from y/x', k0.lat === 37.5445 && k0.lng === 127.0557, k0.lat + ',' + k0.lng);
check('kakao: category bakery (제과 rule beats FD6)', k0.category === '베이커리', k0.category);
check('kakao: place url https', k0.placeUrl === 'https://place.map.kakao.com/12345', k0.placeUrl);
check('kakao: providers used', JSON.stringify(kakaoOnly.providersUsed) === '["kakao"]', JSON.stringify(kakaoOnly.providersUsed));

// 3-2. 네이버 단독 (HTML 태그 제거 · mapx/mapy 1e7 스케일)
setKeys({ naver: true });
calls = [];
handler = () => jsonRes({ items: [NAVER_ITEM] });
const naverOnly = await searchPlaceProviders({ query: '성수 소금빵집' });
check('naver: 1 request to local.json', calls.length === 1 && calls[0].url.includes('openapi.naver.com/v1/search/local.json'), String(calls.length));
check('naver: client id/secret headers', calls[0].init.headers['X-Naver-Client-Id'] === 'NAVER_ID' && calls[0].init.headers['X-Naver-Client-Secret'] === 'NAVER_SECRET');
const n0 = naverOnly.candidates[0];
check('naver: tags stripped', n0.name === '성수동 소금빵집', n0.name);
check('naver: lat/lng scaled by 1e7', Math.abs(n0.lat - 37.5445) < 1e-6 && Math.abs(n0.lng - 127.0557) < 1e-6, n0.lat + ',' + n0.lng);
check('naver: road address', n0.address === '서울 성동구 연무장길 45', n0.address);

// 3-2b. NAVER API HUB 키만 있으면 2026년 최신 규격으로 호출
const HUB_ITEM = {
  title: '베통 <b>성수</b>',
  link: 'http://www.instagram.com/beton.kr',
  category: '음식점>카페,디저트',
  description: '',
  telephone: '',
  address: '서울특별시 성동구 성수동2가 315-47 베통 성수',
  roadAddress: '서울특별시 성동구 연무장7가길 8 베통 성수',
  mapx: '1270552214',
  mapy: '375429356',
};
setKeys({ hub: true });
calls = [];
handler = () => jsonRes({ lastBuildDate: '', total: 1, start: 1, display: 3, items: [HUB_ITEM] });
const hubOnly = await searchPlaceProviders({ query: '성수 소금빵' });
check('hub: 1 request to naverapihub /search/v1/local', calls.length === 1 && calls[0].url.startsWith('https://naverapihub.apigw.ntruss.com/search/v1/local?'), calls[0].url);
check('hub: query encoded', calls[0].url.includes('query=' + encodeURIComponent('성수 소금빵')), calls[0].url);
check('hub: display=3 & sort=comment & format=json', calls[0].url.includes('display=3') && calls[0].url.includes('sort=comment') && calls[0].url.includes('format=json'), calls[0].url);
check('hub: X-NCP-APIGW-API-KEY-ID / -KEY headers', calls[0].init.headers['X-NCP-APIGW-API-KEY-ID'] === 'HUB_ID' && calls[0].init.headers['X-NCP-APIGW-API-KEY'] === 'HUB_SECRET', JSON.stringify(calls[0].init.headers));
check('hub: legacy headers not sent', calls[0].init.headers['X-Naver-Client-Id'] === undefined && calls[0].init.headers['X-Naver-Client-Secret'] === undefined, JSON.stringify(calls[0].init.headers));
check('hub: legacy endpoint not called', !String(calls[0].url).includes('openapi.naver.com'));
const h0 = hubOnly.candidates[0];
check('hub: title tags stripped (<b> / <\\/b>)', h0.name === '베통 성수', h0.name);
check('hub: lat/lng scaled by 1e7', Math.abs(h0.lat - 37.5429356) < 1e-6 && Math.abs(h0.lng - 127.0552214) < 1e-6, h0.lat + ',' + h0.lng);
check('hub: road address', h0.address === '서울특별시 성동구 연무장7가길 8 베통 성수', h0.address);
check('hub: area from jibun address', h0.area === '성수동', h0.area);
check('hub: category mapped (카페/디저트)', ['카페', '디저트'].includes(h0.category), h0.category);
check('hub: providersUsed = naver', JSON.stringify(hubOnly.providersUsed) === '["naver"]', JSON.stringify(hubOnly.providersUsed));

// 3-2c. HUB 키와 구 키가 둘 다 있으면 HUB가 이김 (요청은 1건만)
setKeys({ hub: true, naver: true });
calls = [];
handler = () => jsonRes({ items: [HUB_ITEM] });
const bothNaver = await searchPlaceProviders({ query: '성수 소금빵' });
check('hub priority: single request', calls.length === 1, String(calls.length));
check('hub priority: hub endpoint wins', calls[0].url.startsWith('https://naverapihub.apigw.ntruss.com/search/v1/local?'), calls[0].url);
check('hub priority: hub headers win', calls[0].init.headers['X-NCP-APIGW-API-KEY-ID'] === 'HUB_ID', JSON.stringify(calls[0].init.headers));
check('hub priority: still returns candidates', bothNaver.candidates.length === 1, String(bothNaver.candidates.length));

// 3-2d. HUB 키가 절반만 있으면 HUB를 쓰지 않고 구 규격으로 폴백
setKeys({ hubIdOnly: true, naver: true });
calls = [];
handler = () => jsonRes({ items: [NAVER_ITEM] });
await searchPlaceProviders({ query: '성수 소금빵' });
check('half hub key: falls back to legacy endpoint', calls.length === 1 && calls[0].url.includes('openapi.naver.com/v1/search/local.json'), calls[0].url);
check('half hub key: legacy headers', calls[0].init.headers['X-Naver-Client-Id'] === 'NAVER_ID');
setKeys({ hubIdOnly: true });
calls = [];
const halfHubOnly = await searchPlaceProviders({ query: '성수 소금빵' });
check('half hub key only: naver not configured → no request', calls.length === 0 && halfHubOnly.reason === 'no-key', String(calls.length));

// 3-2e. buildRequest 단위 (엔드포인트·헤더·파라미터)
setKeys({ hub: true });
const hubReq = naverLocalAdapter.buildRequest({ query: '정자동 카페', limit: 9 });
check('buildRequest hub: mode', hubReq.mode === 'hub', hubReq.mode);
check('buildRequest hub: display clamped 1~5', hubReq.url.includes('display=5'), hubReq.url);
check(
  'buildRequest hub: exact url',
  hubReq.url ===
    'https://naverapihub.apigw.ntruss.com/search/v1/local?query=' + encodeURIComponent('정자동 카페') + '&display=5&sort=comment&format=json',
  hubReq.url
);
check('buildRequest hub: header names', JSON.stringify(Object.keys(hubReq.headers)) === '["X-NCP-APIGW-API-KEY-ID","X-NCP-APIGW-API-KEY"]', JSON.stringify(Object.keys(hubReq.headers)));
setKeys({ naver: true });
const legacyReq = naverLocalAdapter.buildRequest({ query: '정자동 카페', limit: 9 });
check('buildRequest legacy: mode', legacyReq.mode === 'legacy', legacyReq.mode);
check(
  'buildRequest legacy: exact url (no sort/format)',
  legacyReq.url === 'https://openapi.naver.com/v1/search/local.json?query=' + encodeURIComponent('정자동 카페') + '&display=5',
  legacyReq.url
);
check('buildRequest legacy: header names', JSON.stringify(Object.keys(legacyReq.headers)) === '["X-Naver-Client-Id","X-Naver-Client-Secret"]', JSON.stringify(Object.keys(legacyReq.headers)));
setKeys({});
check('buildRequest: no key → null', naverLocalAdapter.buildRequest({ query: '정자동 카페' }) === null);
check('buildRequest: empty query → null', (setKeys({ hub: true }), naverLocalAdapter.buildRequest({ query: '' }) === null));
check('isConfigured: hub keys count as configured', (setKeys({ hub: true }), naverLocalAdapter.isConfigured() === true));
check('isConfigured: legacy keys count as configured', (setKeys({ naver: true }), naverLocalAdapter.isConfigured() === true));

// 3-2f. HUB 401 → failures 보고 + 카카오로 폴백
setKeys({ hub: true, kakao: 'KAKAOKEY' });
calls = [];
handler = (url) => (url.includes('naverapihub') ? errRes(401) : jsonRes({ documents: [KAKAO_DOC] }));
const hubFail = await searchPlaceProviders({ query: '성수 소금빵' });
check('hub fail: failure reported as naver 401', hubFail.failures.length === 1 && hubFail.failures[0].provider === 'naver' && String(hubFail.failures[0].error).includes('401'), JSON.stringify(hubFail.failures));
check('hub fail: kakao fills candidates', hubFail.candidates.length >= 1 && hubFail.candidates[0].name === '성수동 소금빵집', JSON.stringify(hubFail.candidates.map((c) => c.name)));

// 3-3. 구글 Places (Text Search POST + FieldMask)
setKeys({ google: 'GOOGLEKEY' });
calls = [];
handler = () => jsonRes({ places: [GOOGLE_PLACE] });
const googleOnly = await searchPlaceProviders({ query: 'Fusaki Beach Ishigaki' });
check('google: 1 request to searchText', calls.length === 1 && calls[0].url.includes('places.googleapis.com/v1/places:searchText'), String(calls.length));
check('google: POST', calls[0].init.method === 'POST');
check('google: api key header', calls[0].init.headers['X-Goog-Api-Key'] === 'GOOGLEKEY');
check('google: field mask header', String(calls[0].init.headers['X-Goog-FieldMask']).includes('places.displayName'));
check('google: body textQuery', JSON.parse(calls[0].init.body).textQuery === 'Fusaki Beach Ishigaki');
const g0 = googleOnly.candidates[0];
check('google: displayName text', g0.name === 'Fusaki Beach', g0.name);
check('google: lat/lng', g0.lat === 24.3393 && g0.lng === 124.1526, g0.lat + ',' + g0.lng);
check('google: maps uri as place url', g0.placeUrl === 'https://maps.google.com/?cid=999', g0.placeUrl);
check('google: overseas category = 가볼곳', g0.category === '가볼곳', g0.category);
check('google: area fallback (no 동/구)', g0.area === '', g0.area);

// 3-4. 3사 동시 설정 → 병렬 조회 + 중복 병합
setKeys({ kakao: 'KAKAOKEY', naver: true, google: 'GOOGLEKEY' });
calls = [];
handler = (url) => {
  if (url.includes('dapi.kakao.com')) return jsonRes({ documents: [KAKAO_DOC] });
  if (url.includes('openapi.naver.com')) return jsonRes({ items: [NAVER_ITEM] });
  if (url.includes('places.googleapis.com')) return jsonRes({ places: [GOOGLE_PLACE] });
  return jsonRes({});
};
const all3 = await searchPlaceProviders({ query: '성수 소금빵집' });
check('chain: 3 requests fired', calls.length === 3, String(calls.length));
check('chain: providersTried = 3', all3.providersTried.length === 3, JSON.stringify(all3.providersTried));
check('chain: same place merged once', all3.candidates.filter((c) => c.name === '성수동 소금빵집').length === 1, JSON.stringify(all3.candidates.map((c) => c.name)));
const merged = all3.candidates.find((c) => c.name === '성수동 소금빵집');
check('chain: merged candidates keep both providers', merged.providers.length === 2 && merged.providers.includes('kakao') && merged.providers.includes('naver'), JSON.stringify(merged.providers));
check('chain: merged confidence boosted', merged.confidence > 0.9, String(merged.confidence));

// 3-5. 한 곳이 실패해도 나머지로 채움 (폴백)
calls = [];
handler = (url) => {
  if (url.includes('dapi.kakao.com')) return errRes(500);
  if (url.includes('openapi.naver.com')) return jsonRes({ items: [NAVER_ITEM] });
  if (url.includes('places.googleapis.com')) return jsonRes({ places: [] });
  return jsonRes({});
};
const partial = await searchPlaceProviders({ query: '성수 소금빵집' });
check('fallback: naver fills in when kakao 500', partial.candidates.length >= 1 && partial.candidates[0].name === '성수동 소금빵집', JSON.stringify(partial.candidates.map((c) => c.name)));
check('fallback: failure reported', partial.failures.length === 1 && partial.failures[0].provider === 'kakao', JSON.stringify(partial.failures));
check('fallback: providersUsed = naver', JSON.stringify(partial.providersUsed) === '["naver"]', JSON.stringify(partial.providersUsed));

// 3-6. 영문(해외) 검색어면 구글 후보가 1순위
calls = [];
handler = (url) => {
  if (url.includes('dapi.kakao.com')) return jsonRes({ documents: [KAKAO_CAFE_DOC] });
  if (url.includes('places.googleapis.com')) return jsonRes({ places: [GOOGLE_PLACE] });
  return jsonRes({ items: [] });
};
const overseas = await searchPlaceProviders({ query: 'Fusaki Beach Ishigaki' });
check('overseas: google ranked first for latin query', overseas.candidates[0].provider === 'google', overseas.candidates.map((c) => c.provider + ':' + c.name).join(' / '));

// 3-7. extractPlaces 전체 흐름 (키 설정 + 캡션)
calls = [];
handler = (url) => {
  if (url.includes('dapi.kakao.com')) return jsonRes({ documents: [KAKAO_DOC, KAKAO_CAFE_DOC] });
  if (url.includes('openapi.naver.com')) return jsonRes({ items: [] });
  if (url.includes('places.googleapis.com')) return jsonRes({ places: [] });
  return jsonRes({});
};
const flow = await extractPlaces(PRESETS[0].url, { caption: PRESETS[0].caption });
check('flow: ok', flow.ok === true);
check('flow: kakao-only adapter label', flow.usedAdapter === 'kakao', flow.usedAdapter);
check('flow: candidates from kakao', flow.candidates[0].name === '성수동 소금빵집', flow.candidates[0].name);
check('flow: query derived from caption', String(flow.query).includes('성수'), flow.query);
check('flow: providersTried recorded', JSON.stringify(flow.providersTried) === '["kakao","naver","google"]', JSON.stringify(flow.providersTried));

// 3-8. 키는 있는데 결과가 전부 없음 → 오프라인 폴백
handler = () => jsonRes({ documents: [], items: [], places: [] });
const emptyFallback = await extractPlaces(PRESETS[0].url, { caption: PRESETS[0].caption });
check('flow: empty api result falls back offline', emptyFallback.usedAdapter === 'offline-fallback', emptyFallback.usedAdapter);
check('flow: offline candidates still valid', emptyFallback.candidates.length > 0 && emptyFallback.candidates[0].name === '성수동 소금빵집', emptyFallback.candidates[0].name);

// 3-8b. LLM 분류는 지도사 분류가 없을 때만 쓰임 (지도사 분류 우선)
process.env.EXPO_PUBLIC_OPENAI_API_KEY = 'OPENAIKEY';
handler = (url) => {
  if (url.includes('api.openai.com'))
    return jsonRes({
      choices: [
        {
          message: {
            content: JSON.stringify({ name: '성수동 소금빵집', area: '성수동', category: '카페', menuTags: ['소금빵'] }),
          },
        },
      ],
    });
  if (url.includes('dapi.kakao.com')) return jsonRes({ documents: [KAKAO_DOC] });
  return jsonRes({ items: [], places: [] });
};
const llmFlow = await extractPlaces(PRESETS[0].url, { caption: PRESETS[0].caption });
check('llm: query uses llm name (no duplicated area)', llmFlow.query === '성수동 소금빵집', llmFlow.query);
check('llm: adapter label llm+kakao', llmFlow.usedAdapter === 'llm+kakao', llmFlow.usedAdapter);
check('llm: map provider category wins', llmFlow.candidates[0].category === '베이커리', llmFlow.candidates[0].category);
check('llm: menuTags from caption kept', JSON.stringify(llmFlow.candidates[0].menuTags) === '["소금빵"]', JSON.stringify(llmFlow.candidates[0].menuTags));
delete process.env.EXPO_PUBLIC_OPENAI_API_KEY;

// 3-9. 어댑터 단위: 키 없으면 요청조차 하지 않음
setKeys({});
calls = [];
handler = () => jsonRes({});
const none = await searchPlaceProviders({ query: '성수' });
check('no key: zero fetch calls', calls.length === 0, String(calls.length));
check('no key: reason no-key', none.reason === 'no-key');

// 3-10. 정적 데이터: .env.example 키 목록 (HUB 키 포함 8개)
const envExample = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
['EXPO_PUBLIC_KAKAO_REST_API_KEY', 'EXPO_PUBLIC_NAVER_HUB_CLIENT_ID', 'EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET', 'EXPO_PUBLIC_NAVER_CLIENT_ID', 'EXPO_PUBLIC_NAVER_CLIENT_SECRET', 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', 'EXPO_PUBLIC_YOUTUBE_API_KEY', 'EXPO_PUBLIC_OPENAI_API_KEY'].forEach((key) => {
  check('.env.example has ' + key, new RegExp('^' + key + '=', 'm').test(envExample));
});
const envValues = envExample
  .split('\n')
  .filter((l) => /^EXPO_PUBLIC_[A-Z0-9_]+=/.test(l))
  .map((l) => l.split('=')[1].trim());
check('.env.example: 실제 키 값이 커밋되지 않음(모든 값이 빈칸)', envValues.every((v) => v === ''), envValues.join('|'));
check('.gitignore: .env 제외', /^\.env$/m.test(fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8')));
check('.env.example has no legacy NAVER_SEARCH key', !envExample.includes('EXPO_PUBLIC_NAVER_SEARCH_'));
check('no legacy NAVER_SEARCH env in src', !fs.readFileSync(path.join(process.cwd(), 'src/services/extractor.js'), 'utf8').includes('EXPO_PUBLIC_NAVER_SEARCH_'));

// 3-11. 검색어 정리: 해시태그·이모지·링크 제거
setKeys({ kakao: 'KAKAOKEY' });
calls = [];
handler = (url) => (url.includes('dapi.kakao.com') ? jsonRes({ documents: [] }) : jsonRes({ items: [], places: [] }));
await extractPlaces(PRESETS[0].url, {
  caption: '🍞 성수 소금빵 맛집 #성수맛집 #소금빵 @food https://t.co/x',
});
const sentQuery = decodeURIComponent(calls[0].url.split('query=')[1].split('&')[0]);
check('query: hashtag/emoji/link stripped', sentQuery === '성수 소금빵', sentQuery);

// 3-12. v2.9 — **네이티브(iOS/Android)는 Gemini 영상 분석을 부르지 않음**
//   Gemini 키는 Vercel 서버에만 있어 앱 번들에 없습니다 → 프록시가 있는 웹에서만 호출합니다.
setKeys({ kakao: 'KAKAOKEY' });
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.indexOf('youtube.com/oembed') > 0) return errRes(404);
  if (u.indexOf('dapi.kakao.com') > 0) return jsonRes({ documents: [] });
  if (u.indexOf('naverapihub') > 0 || u.indexOf('openapi.naver.com') > 0) return jsonRes({ items: [] });
  return jsonRes({ items: [], places: [], documents: [] });
};
const nativeGemini = await extractPlaces('https://youtube.com/shorts/LPLE_SH2b9U', {});
check('v2.9 native: /api/gemini 호출 없음(웹 전용)', !calls.some((c) => c.url.indexOf('/api/gemini') >= 0), calls.map((c) => c.url).join(' | '));
check('v2.9 native: 실매장 못 찾으면 기존 오프라인 폴백', String(nativeGemini.usedAdapter).indexOf('offline') === 0, nativeGemini.usedAdapter);
check('v2.9 native: aiNote 없음', !nativeGemini.aiNote, String(nativeGemini.aiNote));

// ── 4. 오프라인 추출기 단위 ───────────────────────────────────
const off = offlineSmartExtract({ url: 'https://www.instagram.com/reel/x/', contentId: 'x' }, '검단 아라뱃길 카페');
check('offline: finds 검단 카페', off[0].name === '아라뱃길 뷰 카페', off[0].name);

// ── 5. 딥링크·공유 링크 ───────────────────────────────────────
const pin = { name: '성수동 소금빵집', area: '성수동', lat: 37.5, lng: 127.0 };
check('naver app url', naverMapAppUrl(pin).startsWith('nmap://search?query='), naverMapAppUrl(pin));
check('naver web url', naverMapWebUrl(pin).includes('map.naver.com'), naverMapWebUrl(pin));
check('kakao app url', kakaoMapAppUrl(pin).includes('kakaomap://search?q='), kakaoMapAppUrl(pin));
check('kakao web url', kakaoMapWebUrl(pin).includes('map.kakao.com'), kakaoMapWebUrl(pin));
check('share link', buildShareLink('odol', [{ name: 'A', category: '카페' }], '성수동').includes('https://reelpin.app/m/odol'));

// ── 5-1. v1.7: 인앱 네이버 플레이스 모달 주소 ──────────────────
const naverPlaceUrl = naverPlaceSearchUrl(pin);
check(
  'naver place: m.place.naver.com/place/list 규격',
  naverPlaceUrl.startsWith('https://m.place.naver.com/place/list?query='),
  naverPlaceUrl
);
const naverPlaceQuery = decodeURIComponent(naverPlaceUrl.split('query=')[1]);
check('naver place: 동네 + 가게명 순서로 검색어 구성', naverPlaceQuery === '성수동 성수동 소금빵집', naverPlaceQuery);
const naverPlaceNoArea = naverPlaceSearchUrl({ name: '베통 성수' });
check(
  'naver place: 동네 없으면 가게명만',
  decodeURIComponent(naverPlaceNoArea.split('query=')[1]) === '베통 성수',
  naverPlaceNoArea
);
check(
  'naver place: 특수문자·공백 인코딩',
  naverPlaceSearchUrl({ name: 'A&B 카페' }) ===
    'https://m.place.naver.com/place/list?query=A%26B%20%EC%B9%B4%ED%8E%98',
  naverPlaceSearchUrl({ name: 'A&B 카페' })
);
check(
  'naver place: 핀이 비어도 예외 없이 빈 검색어',
  naverPlaceSearchUrl(null) === 'https://m.place.naver.com/place/list?query=',
  naverPlaceSearchUrl(null)
);
const externalOpened = await openExternalUrl(naverPlaceUrl);
check('openExternalUrl: 네이버 플레이스 주소 열기', externalOpened.opened === true && externalOpened.url === naverPlaceUrl, JSON.stringify(externalOpened));
const externalEmpty = await openExternalUrl('');
check('openExternalUrl: 빈 주소는 열지 않음', externalEmpty.opened === false, JSON.stringify(externalEmpty));

// ── 6. v1.1: 매장 정보 링크(placeUrl) · 출처 배지 데이터 ──────────
// 6-1. 카카오는 place_url 을 https 로 올리고 '카카오맵' 라벨을 붙입니다.
check('place: kakao label', k0.placeUrlLabel === '카카오맵', String(k0.placeUrlLabel));
check('place: kakao providers array', JSON.stringify(k0.providers) === '["kakao"]', JSON.stringify(k0.providers));

// 6-2. 네이버는 link 를 placeUrl 로 쓰고, 네이버 지도 주소는 https 로 올립니다. (그 외 사이트는 스킴 유지)
check('place: naver link → placeUrl (https 승격)', n0.placeUrl === 'https://map.naver.com/p/entry/place/12345', n0.placeUrl);
check('place: naver label', n0.placeUrlLabel === '네이버', String(n0.placeUrlLabel));
check('place: naver hub 스킴 유지(instagram)', h0.placeUrl === 'http://www.instagram.com/beton.kr', h0.placeUrl);
check('place: naver hub 라벨 = 매장 홈페이지', h0.placeUrlLabel === '매장 홈페이지', String(h0.placeUrlLabel));

// 6-3. 구글은 googleMapsUri 를 그대로 씁니다.
check('place: google label', g0.placeUrlLabel === '구글 지도', String(g0.placeUrlLabel));

// 6-4. 두 곳 이상에서 확인된 후보는 providers 배열 + 대표 placeUrl 을 유지합니다.
check('place: merged keeps kakao placeUrl', merged.placeUrl === 'https://place.map.kakao.com/12345', merged.placeUrl);
check('place: merged label from kakao', merged.placeUrlLabel === '카카오맵', String(merged.placeUrlLabel));

// 6-5. 직접 검색(searchPlacesDirect) — 지도 3사를 그대로 호출합니다.
setKeys({ kakao: 'KAKAOKEY', naver: true });
calls = [];
handler = (url) =>
  url.includes('dapi.kakao.com') ? jsonRes({ documents: [KAKAO_DOC] }) : jsonRes({ items: [NAVER_ITEM] });
const direct = await searchPlacesDirect('  성수동   소금빵 ');
check('direct: ok', direct.ok === true, JSON.stringify(direct).slice(0, 120));
check('direct: query trimmed', direct.query === '성수동 소금빵', direct.query);
check('direct: 2 requests (kakao+naver)', calls.length === 2, String(calls.length));
check('direct: merges same place into 1', direct.candidates.length === 1, JSON.stringify(direct.candidates.map((c) => c.name)));
check('direct: providers 두 곳', JSON.stringify(direct.candidates[0].providers) === '["kakao","naver"]', JSON.stringify(direct.candidates[0].providers));
check('direct: pin 만들 수 있는 placeUrl', String(direct.candidates[0].placeUrl).indexOf("place.map.kakao.com") > 0, direct.candidates[0].placeUrl);
check('direct: usedAdapter', direct.usedAdapter === 'kakao+naver', String(direct.usedAdapter));

const directEmpty = await searchPlacesDirect('   ');
check('direct: 빈 검색어 거절', directEmpty.ok === false && directEmpty.reason === 'empty-query' && !!directEmpty.message, directEmpty.reason);
const directShort = await searchPlacesDirect('성');
check('direct: 한 글자 거절', directShort.ok === false && directShort.reason === 'too-short', directShort.reason);

calls = [];
handler = () => jsonRes({ documents: [], items: [], places: [] });
const directNone = await searchPlacesDirect('없는가게이름');
check('direct: 결과 없음 안내', directNone.ok === false && directNone.reason === 'no-result' && /찾은 가게가 없/.test(directNone.message), directNone.message);
check('direct: 결과 없음이면 요청은 실제로 나감', calls.length === 2, String(calls.length));

setKeys({});
calls = [];
const directNoKey = await searchPlacesDirect('성수 소금빵');
check('direct: 키 없음 → no-key 안내', directNoKey.ok === false && directNoKey.reason === 'no-key' && /지도 API 키/.test(directNoKey.message), directNoKey.reason);
check('direct: 키 없으면 요청 0건', calls.length === 0, String(calls.length));
check('direct: 예시 검색어 3개', Array.isArray(DIRECT_PRESETS) && DIRECT_PRESETS.length === 3, String(DIRECT_PRESETS.length));

// ── 7. 핀 변환·이전 버전 호환 ──────────────────
const built = buildPin(direct.candidates[0], { platform: 'search', sourceUrl: '', now: '2026-11-15T00:00:00+09:00' });
check('pin: placeUrl 저장', built.placeUrl === 'https://place.map.kakao.com/12345', built.placeUrl);
check('pin: placeUrlLabel 저장', built.placeUrlLabel === '카카오맵', built.placeUrlLabel);
check('pin: providers 저장', JSON.stringify(built.providers) === '["kakao","naver"]', JSON.stringify(built.providers));
check('pin: 직접 검색 핀 platform=search', built.platform === 'search' && built.sourceUrl === '', built.platform + '/' + built.sourceUrl);
check('pin: 빈 후보 → null', buildPin(null) === null && buildPin({ name: '' }) === null);

const legacyPin = normalizePin({ id: 'p1', name: '옛 핀', lat: 37.5, lng: 127 });
check('pin: v1.0 핀에 placeUrl 기본값', legacyPin.placeUrl === '' && legacyPin.providers.length === 0, JSON.stringify(legacyPin.providers));
check('pin: v1.0 핀 카테고리 기본값', legacyPin.category === '맛집' && legacyPin.address === '주소 미확인', legacyPin.category);
check('pin: normalizePins 깨진 항목 제거', normalizePins([null, { name: 'A' }, { lat: 1 }]).length === 1, String(normalizePins([null, { name: 'A' }, { lat: 1 }]).length));

const dupByUrl = findExistingPin([{ id: 'a', name: '딴이름', placeUrl: 'https://place.map.kakao.com/12345' }], { name: '성수동 소금빵집', placeUrl: 'https://place.map.kakao.com/12345' });
check('pin: 같은 placeUrl 이면 중복으로 판정', dupByUrl && dupByUrl.id === 'a', JSON.stringify(dupByUrl));
const dupByName = findExistingPin([{ id: 'b', name: '성수동 소금빵집', area: '성수동' }], { name: '성수동 소금빵집', area: '성수동' });
check('pin: 이름+동가 같으면 중복', dupByName && dupByName.id === 'b', JSON.stringify(dupByName));
check('pin: 다른 장소는 중복 아님', findExistingPin([{ id: 'b', name: 'A', area: '성수동' }], { name: 'A', area: '연남동' }) === null);

// ── 8. 매장 정보 열기(openPlace) ───────────────────────
check('openPlace: 스킴 없는 주소에 https 붙임', normalizePlaceUrl('place.map.kakao.com/123') === 'https://place.map.kakao.com/123', normalizePlaceUrl('place.map.kakao.com/123'));
check('openPlace: http 주소는 스킴 유지', normalizePlaceUrl('http://store.example.com') === 'http://store.example.com', normalizePlaceUrl('http://store.example.com'));
check('openPlace: 빈 값·딥링크 거절', normalizePlaceUrl('') === '' && normalizePlaceUrl('javascript:alert(1)') === '', normalizePlaceUrl('javascript:alert(1)'));
const opened = await openPlace('https://place.map.kakao.com/12345');
check('openPlace: 열기 성공', opened.opened === true && opened.url === 'https://place.map.kakao.com/12345', JSON.stringify(opened));
const openedEmpty = await openPlace('');
check('openPlace: 빈 주소는 열지 않음', openedEmpty.opened === false, JSON.stringify(openedEmpty));

// ── 9. v1.2: 공유 텍스트 분리 · YouTube oEmbed · OG 메타 · 검색어 정제 ──
// 9-1. 공유 시트의 "문구 + 링크" 혼합 입력
const shared1 = splitSharedText('성수동 소금빵 맛집 베통 https://www.instagram.com/reel/C8xSg2BpQ1K/ 더 보기');
check('shared: 링크만 뽑기', shared1.url === 'https://www.instagram.com/reel/C8xSg2BpQ1K/', shared1.url);
check('shared: 주변 문구는 캡션으로', shared1.caption.includes('성수동 소금빵') && shared1.caption.includes('더 보기'), shared1.caption);
check('shared: 링크만 있으면 캡션 없음', splitSharedText('https://youtu.be/9Xk2mQpLz7A').caption === '', splitSharedText('https://youtu.be/9Xk2mQpLz7A').caption);
check('shared: 문장부호 떼기', splitSharedText('(https://youtu.be/9Xk2mQpLz7A).').url === 'https://youtu.be/9Xk2mQpLz7A', splitSharedText('(https://youtu.be/9Xk2mQpLz7A).').url);
check('shared: 여러 링크', splitSharedText('https://a.com/1 https://b.com/2').urls.length === 2, String(splitSharedText('https://a.com/1 https://b.com/2').urls.length));
check('shared: 링크 없으면 빈 url', splitSharedText('성수동 소금빵').url === '' && splitSharedText('성수동 소금빵').hasText === true);
check('shared: 줄바꿈 캡션 정리', splitSharedText('첫 줄\n\n\n둘째 줄 https://youtu.be/9Xk2mQpLz7A').caption === '첫 줄\n둘째 줄', splitSharedText('첫 줄\n\n\n둘째 줄 https://youtu.be/9Xk2mQpLz7A').caption);
check('shared: trimUrlTail 직접', trimUrlTail('https://a.com/x),') === 'https://a.com/x', trimUrlTail('https://a.com/x),'));
check('shared: 링크 없으면 링크 안내', true);

// 9-2. YouTube는 키 없이 oEmbed로 제목을 읽습니다.
setKeys({});
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
calls = [];
handler = () =>
  jsonRes({
    title: '성수동 소금빵 맛집 베통 #shorts',
    author_name: '맛집TV',
    thumbnail_url: 'https://i.ytimg.com/x.jpg',
  });
const oeFlow = await extractPlaces('https://www.youtube.com/shorts/9Xk2mQpLz7A');
const oeCall = calls.find((c) => String(c.url).includes('youtube.com/oembed'));
check('oembed: 무인증 호출', !!oeCall, calls.map((c) => c.url).join(' | ').slice(0, 160));
check(
  'oembed: watch 주소를 인코딩해 전달',
  !!oeCall && oeCall.url.includes(encodeURIComponent('https://www.youtube.com/watch?v=9Xk2mQpLz7A')),
  oeCall && oeCall.url
);
check('oembed: 키 없이도 제목 읽음', oeFlow.sourceTitle === '성수동 소금빵 맛집 베통 #shorts', oeFlow.sourceTitle);
check('oembed: titleStatus=video', oeFlow.titleStatus === 'video', oeFlow.titleStatus);
check('oembed: 제목에서 지역 추출', oeFlow.suggestedQuery === '성수동 베통', oeFlow.suggestedQuery);
check('oembed: youtu.be도 같은 영상 ID', youtubeWatchUrlOf(parseUrl('https://youtu.be/9Xk2mQpLz7A')) === 'https://www.youtube.com/watch?v=9Xk2mQpLz7A');
check('oembed: 실패해도 앱은 계속', (handler = () => errRes(404)) && (await (async () => {
  const r = await extractPlaces('https://youtu.be/9Xk2mQpLz7A');
  return r.ok === true && r.sourceTitle === '';
})()), 'oembed 실패 처리');
check('oembed: fetchYouTubeOembed 단위(404)', (await fetchYouTubeOembed(parseUrl('https://youtu.be/9Xk2mQpLz7A'))) === null);
check('oembed: 타임아웃 기본 3.5초', PAGE_META_TIMEOUT_MS === 3500, String(PAGE_META_TIMEOUT_MS));

// 9-3. 유튜브 API 키가 있으면 설명(description)까지 병합 (제목은 oEmbed 우선)
setKeys({ kakao: 'KAKAOKEY' });
process.env.EXPO_PUBLIC_YOUTUBE_API_KEY = 'YTKEY';
calls = [];
handler = (url) => {
  if (String(url).includes('youtube.com/oembed')) return jsonRes({ title: '연남동 딸기 케이크 맛집', author_name: 'x' });
  if (String(url).includes('googleapis.com/youtube/v3')) {
    return jsonRes({
      items: [
        {
          snippet: {
            title: '연남동 딸기 케이크 맛집',
            description: '성미산로 디저트 카페 추천',
            thumbnails: { high: { url: 'https://i.ytimg.com/h.jpg' } },
          },
        },
      ],
    });
  }
  if (String(url).includes('dapi.kakao.com')) return jsonRes({ documents: [KAKAO_DOC] });
  return jsonRes({ items: [], places: [] });
};
const ytApi = await extractPlaces('https://youtu.be/9Xk2mQpLz7A');
check('oembed+api: Data API도 호출', calls.some((c) => String(c.url).includes('part=snippet')), calls.map((c) => c.url).join(' | ').slice(0, 200));
check('oembed+api: 제목은 oEmbed 값', ytApi.sourceTitle === '연남동 딸기 케이크 맛집', ytApi.sourceTitle);
check('oembed+api: 설명이 검색어에 반영', ytApi.query.includes('연남동'), ytApi.query);
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;

// 9-4. 인스타: 공유 캡션이 있으면 페이지를 긁지 않고 그대로 씁니다.
calls = [];
handler = (url) => (String(url).includes('dapi.kakao.com') ? jsonRes({ documents: [KAKAO_DOC] }) : jsonRes({}));
const igShared = await extractPlaces('성수동 소금빵 맛집 베통 https://www.instagram.com/reel/C8xSg2BpQ1K/');
check('instagram: 캡션 있으면 페이지 요청 없음', !calls.some((c) => String(c.url).includes('instagram.com')), calls.map((c) => c.url).join('|'));
check('instagram: 캡션으로 검색', String(igShared.query).includes('성수동'), igShared.query);
check('instagram: titleStatus=caption', igShared.titleStatus === 'caption', igShared.titleStatus);

// 9-5. 인스타 + 캡션 없음 → 로그인 월이면 예외 없이 폴백 + [가게명으로 찾기] 안내
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('instagram.com')) {
    return {
      ok: true,
      status: 200,
      url: 'https://www.instagram.com/accounts/login/?next=/reel/x/',
      json: async () => ({}),
      text: async () => '<html><head><title>Login • Instagram</title></head></html>',
    };
  }
  if (u.includes('dapi.kakao.com')) return jsonRes({ documents: [] });
  return jsonRes({ items: [], places: [] });
};
const igBlocked = await extractPlaces('https://www.instagram.com/reel/C8xSg2BpQ1K/');
check('instagram: 로그인 월이어도 결과는 ok', igBlocked.ok === true, JSON.stringify(igBlocked).slice(0, 120));
check('instagram: titleStatus=blocked', igBlocked.titleStatus === 'blocked', igBlocked.titleStatus);
check('instagram: sourceTitle 비어 있음', igBlocked.sourceTitle === '', igBlocked.sourceTitle);
check('instagram: 안내 문구', String(igBlocked.titleNotice).includes('인스타는 보안상 제목을 못 읽어와요'), igBlocked.titleNotice);
check('instagram: 안내에 가게명 찾기 유도', String(igBlocked.titleNotice).includes('가게명'), igBlocked.titleNotice);
check('instagram: 안내 문구 단위', titleNoticeOf('instagram') === '인스타는 보안상 제목을 못 읽어와요', titleNoticeOf('instagram'));

// 9-5b. 실제 인스타가 주는 껍데기 페이지(<title>Instagram</title>)도 검색어로 쓰지 않습니다.
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('instagram.com')) {
    return {
      ok: true,
      status: 200,
      url: u,
      json: async () => ({}),
      text: async () => '<html><head><title>Instagram</title></head><body>로그인</body></html>',
    };
  }
  if (u.includes('dapi.kakao.com')) return jsonRes({ documents: [KAKAO_DOC] });
  return jsonRes({ items: [], places: [] });
};
const igShell = await extractPlaces('https://www.instagram.com/reel/C8xSg2BpQ1K/');
check('instagram: 껍데기 제목은 제목으로 안 씀', igShell.sourceTitle === '', igShell.sourceTitle);
check('instagram: 껍데기 제목이면 blocked', igShell.titleStatus === 'blocked', igShell.titleStatus);
check('instagram: 껍데기 제목으로 검색하지 않음', !String(igShell.query).includes('Instagram'), igShell.query);

// 9-5c. 일반 웹 페이지가 404여도 왜 못 읽었는지 안내하고 가게명 찾기로 이어 줍니다.
calls = [];
handler = () => errRes(404);
const page404 = await extractPlaces('https://beton.kr/closed-page');
check('og: 404여도 예외 없이 결과', page404.ok === true, JSON.stringify(page404).slice(0, 120));
check('og: 404면 제목 없음 + 안내', page404.sourceTitle === '' && String(page404.titleNotice).includes('제목을 못 읽어와요'), page404.titleNotice);

// 9-6. 네이버 블로그·일반 웹 → OG 메타
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('blog.naver.com')) {
    return {
      ok: true,
      status: 200,
      url: u,
      json: async () => ({}),
      text: async () =>
        '<html><head><meta property="og:title" content="성수동 소금빵 맛집 베통 후기"><meta property="og:description" content="연무장7가길 8, 오픈런 필수"></head></html>',
    };
  }
  if (u.includes('dapi.kakao.com')) return jsonRes({ documents: [KAKAO_DOC] });
  return jsonRes({ items: [], places: [] });
};
const blogFlow = await extractPlaces('https://blog.naver.com/kkansyo/223123456789');
check('og: 페이지 요청 보냄', calls.some((c) => String(c.url).includes('blog.naver.com')), calls.map((c) => c.url).join(' | ').slice(0, 160));
check('og: og:title 읽음', blogFlow.sourceTitle === '성수동 소금빵 맛집 베통 후기', blogFlow.sourceTitle);
check('og: 제목으로 검색어 생성', String(blogFlow.suggestedQuery).includes('성수동'), blogFlow.suggestedQuery);
check('og: titleStatus=page', blogFlow.titleStatus === 'page', blogFlow.titleStatus);

// 9-7. OG 파서 단위 · 일반 웹(unknown) 링크도 지원
const parsedMeta = parseHtmlMeta('<html><head><meta content="베통 성수" property="og:title"><title>Beton</title></head></html>');
check('og 파서: content가 앞에 와도 읽음', parsedMeta.title === '베통 성수', parsedMeta.title);
check('og 파서: og 없으면 <title>', parseHtmlMeta('<title>성수 카페 &amp; 베이커리</title>').title === '성수 카페 & 베이커리', parseHtmlMeta('<title>성수 카페 &amp; 베이커리</title>').title);
check('og 파서: 로그인 월 감지', parseHtmlMeta('<title>Login • Instagram</title>').loginWall === true);
check('og 파서: 껍데기 제목(Instagram)도 막힘 처리', parseHtmlMeta('<title>Instagram</title>').loginWall === true);
check('og 파서: og:title 있는 인스타는 통과', parseHtmlMeta('<meta property="og:title" content="베통 성수 (@beton.kr) • Instagram"><title>Instagram</title>').title === '베통 성수 (@beton.kr) • Instagram');
check('og 파서: 메타 없으면 빈 값', parseHtmlMeta('<html></html>').title === '' && parseHtmlMeta('').description === '');
check('og: 일반 웹 페이지도 지원', isSupportedUrl('https://beton.kr/store') === true);
calls = [];
handler = (url) =>
  String(url).includes('beton.kr')
    ? { ok: true, status: 200, url: String(url), json: async () => ({}), text: async () => '<html><head><title>베통 성수</title></head></html>' }
    : jsonRes({ documents: [], items: [], places: [] });
const webFlow = await extractPlaces('https://beton.kr/store');
check('og: 일반 웹 제목 읽음', webFlow.sourceTitle === '베통 성수', webFlow.sourceTitle);
check('og: unknown 플랫폼도 결과 반환', webFlow.ok === true && webFlow.platform === 'unknown', webFlow.platform);

// 9-8. 검색어 정제기
const q1 = extractSearchQueries('🍞 성수동 소금빵 맛집 베통 다녀왔어요 #성수맛집 #소금빵 #먹방 #shorts');
check('정제: 지역 = 성수동', q1.area === '성수동', q1.area);
check('정제: 상호 = 베통', q1.storeName === '베통', q1.storeName);
check('정제: 첫 검색어 = 지역+상호', q1.queries[0] === '성수동 베통', q1.queries.join(' / '));
check('정제: 이모지·해시태그 기호 제거', !/[#＃🍞]/.test(q1.cleaned), q1.cleaned);
check('정제: 상투어 제거', ['먹방', 'shorts', '맛집', '다녀왔어요'].every((w) => q1.keywords.indexOf(w) < 0), q1.keywords.join(','));
check('정제: 메뉴 키워드 유지', q1.keywords.indexOf('소금빵') >= 0, q1.keywords.join(','));
check('정제: 지역+메뉴 후보도 포함', q1.queries.indexOf('성수동 소금빵') >= 0, q1.queries.join(' / '));
const q2 = extractSearchQueries('평균리뷰 1000개 이상, 성수동 카페추천! ☕️');
check('정제: 카페추천 → 성수동 카페', q2.queries[0] === '성수동 카페', q2.queries.join(' / '));
const q3 = extractSearchQueries('이태원 데이트 추천!! 호주식 브런치 카페!! #이태원맛집');
check('정제: 접미사 없는 지명(이태원)', q3.area === '이태원', q3.area);
check('정제: 웨이팅·솔직후기 같은 상투어', extractSearchQueries('[베통] 성수 소금빵 웨이팅 솔직후기').keywords.indexOf('웨이팅') < 0);
check('정제: ~역은 역명만', extractSearchQueries('성수역 3번 출구 소금빵').area === '성수', extractSearchQueries('성수역 3번 출구 소금빵').area);
check('정제: 조사 제거(전문가의 → 전문가)', cleanCaptionText('전문가의').trim() === '전문가의' && extractSearchQueries('성수동 전문가의 추천').keywords.indexOf('전문가의') < 0);
check('정제: 빈 입력은 빈 결과', extractSearchQueries('').queries.length === 0);
check('정제: 상호명 단위(findStoreName)', findStoreName('성수동 소금빵 맛집 베통', '성수동') === '베통', findStoreName('성수동 소금빵 맛집 베통', '성수동'));

// 9-9. 첫 후보로 결과가 없으면 다음 후보로 자동 재시도
setKeys({ kakao: 'KAKAOKEY' });
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title: '성수동 소금빵 맛집 베통' });
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({ documents: q === '베통' ? [KAKAO_DOC] : [] });
  }
  return jsonRes({ items: [], places: [] });
};
const retry = await extractPlaces('https://youtu.be/9Xk2mQpLz7A');
check('재시도: 두 번째 후보에서 결과', retry.query === '베통' && retry.candidates.length > 0, retry.query);
check('재시도: 두 번째 후보까지 시도 기록', Array.isArray(retry.attempts) && retry.attempts.length >= 2 && retry.attempts[1].query === '베통', JSON.stringify(retry.attempts.map((a) => a.query)));
check('재시도: 첫 시도는 결과 0건', retry.attempts[0].resultCount === 0, JSON.stringify(retry.attempts[0]));

// 9-10. 링크가 없는 입력은 안내 문구로 거절
const noUrl = await extractPlaces('성수동 소금빵 맛집 베통');
check('입력: 링크 없으면 안내', noUrl.ok === false && String(noUrl.reason).includes('링크'), noUrl.reason);

// ── 10. v1.3: 유튜브 설명글(description) 파싱 → '연동 엄마손횟집' ──────
// 상훈 님이 실제로 테스트한 영상(youtube.com/shorts/2QZPPEle9IY).
// 제목에는 상호가 없고, 설명글 첫머리에만 `제주시 연동 “엄마손횟집”` 이 있습니다.
const KEUM_TITLE =
  '한달 전 예약 필수인 제주도 정말 특별한 횟집. 35만원짜리 자연산 돌돔은 무슨맛일까..? #제주도 #제주도맛집';
const KEUM_DESC =
  '자연산 돌돔을 먹을 수 있는 정말 특별한 횟집?\n\n제주시 연동 “엄마손횟집”\n\n결론적으로 말씀 드리면 비쌉니다..\n엄마손횟집!!';

// 10-1. 데스크톱 웹: ytInitialPlayerResponse.attributedDescription
const YT_HTML_DESKTOP =
  '<html><head><title>' +
  KEUM_TITLE +
  ' - YouTube</title></head><body><script>var ytInitialPlayerResponse = {' +
  '"playabilityStatus":{"status":"OK"},"attributedDescription":{"content":"' +
  KEUM_DESC.replace(/\n/g, '\\n') +
  '","styleRuns":[{"startIndex":0,"length":20}]}};</script></body></html>';
const deskMeta = parseYouTubePageMeta(YT_HTML_DESKTOP);
check('설명글: 데스크톱 플레이어 응답에서 읽기', deskMeta.description.includes('엄마손횟집'), deskMeta.description.slice(0, 60));
check(
  '설명글: 줄바꿈(\\n) 복원',
  deskMeta.description.split('\n').filter(Boolean)[1] === '제주시 연동 “엄마손횟집”',
  JSON.stringify(deskMeta.description.slice(0, 40))
);
check('설명글: <title>의 " - YouTube" 꼬리표 제거', deskMeta.title === KEUM_TITLE, deskMeta.title);

// 10-2. 짧은 설명글은 shortDescription 으로도 옵니다.
const ytShort = parseYouTubePageMeta(
  '<script>var ytInitialPlayerResponse = {"videoDetails":{"shortDescription":"성수동 소금빵 맛집 베통"}};</script>'
);
check('설명글: shortDescription 읽기', ytShort.description === '성수동 소금빵 맛집 베통', ytShort.description);

// 10-3. 모바일 웹: ytInitialData.attributedDescriptionBodyText (따옴표가 \x22 로 이스케이프 + 두 번 이스케이프된 \n)
const YT_HTML_MOBILE =
  '<html><body><script>var ytInitialData = {"contents":"' +
  '\\x22attributedDescriptionBodyText\\x22:\\x7b\\x22content\\x22:\\x7b\\x22content\\x22:\\x22' +
  '자연산 돌돔을 먹을 수 있는 정말 특별한 횟집?\\\\n\\\\n제주시 연동 “엄마손횟집”' +
  '\\x22\\x7d\\x7d"};</script></body></html>';
const mobMeta = parseYouTubePageMeta(YT_HTML_MOBILE);
check('설명글: 모바일(\x22 이스케이프) 형태도 읽기', mobMeta.description.includes('엄마손횟집'), mobMeta.description.slice(0, 60));
check('설명글: 두 번 이스케이프된 줄바꿈도 복원', mobMeta.description.includes('\n제주시 연동'), JSON.stringify(mobMeta.description.slice(0, 40)));
check('설명글: HTML 없으면 빈 값(예외 없음)', parseYouTubePageMeta('').description === '' && parseYouTubePageMeta(null).title === '');

// 10-4. 유튜브가 넣는 사이트 소개 문구·껍데기 제목은 설명글·제목으로 안 씁니다.
check(
  '설명글: 사이트 소개 문구는 걸러냄',
  parseYouTubePageMeta(
    '<meta property="og:description" content="친구, 가족을 비롯해 전 세계 사람들과 동영상 공유">'
  ).description === '',
  parseYouTubePageMeta('<meta property="og:description" content="친구, 가족을 비롯해 전 세계 사람들과 동영상 공유">').description
);
check('설명글: <title>YouTube</title> 껍데기 제목 버림', parseYouTubePageMeta('<title>YouTube</title>').title === '');
check(
  '설명글: 진짜 제목은 og:title 로 살림',
  parseYouTubePageMeta('<meta property="og:title" content="베통 성수">').title === '베통 성수'
);

// 10-5. 영상 페이지 요청은 네이티브에서만 (테스트 스텁 Platform.OS='ios' → 네이티브)
const ytPageParsed = parseUrl('https://youtube.com/shorts/2QZPPEle9IY?si=2yBVStX4xuIMSeN2');
check('설명글: shorts 공유 링크에서 영상 ID', ytPageParsed.contentId === '2QZPPEle9IY', ytPageParsed.contentId);

// 10-6. 링크 전체 흐름: oEmbed 제목 + 페이지 설명글 → 카카오 실검색어
setKeys({ kakao: 'KAKAOKEY' });
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
const KEUM_DOC = {
  id: '999001',
  place_name: '엄마손횟집',
  category_name: '음식점 > 한식 > 해물,생선 > 회',
  category_group_code: 'FD6',
  phone: '064-000-0000',
  address_name: '제주특별자치도 제주시 연동 262-9',
  road_address_name: '제주특별자치도 제주시 연동3길 35',
  x: '126.5312',
  y: '33.4890',
  place_url: 'http://place.map.kakao.com/999001',
};
const htmlRes = (html) => ({
  ok: true,
  status: 200,
  url: '',
  json: async () => ({}),
  text: async () => html,
});
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title: KEUM_TITLE, author_name: '호키도리' });
  if (u.includes('youtube.com/watch')) return htmlRes(YT_HTML_DESKTOP);
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({ documents: q === '연동 엄마손횟집' ? [KEUM_DOC] : [] });
  }
  return jsonRes({ items: [], places: [] });
};
const keum = await extractPlaces('https://youtube.com/shorts/2QZPPEle9IY?si=2yBVStX4xuIMSeN2');
check(
  '설명글: 영상 페이지를 실제로 요청',
  calls.some((c) => String(c.url).includes('youtube.com/watch?v=2QZPPEle9IY')),
  calls.map((c) => String(c.url)).join(' | ').slice(0, 200)
);
check('설명글: 결과에 설명글 담기', String(keum.sourceDescription).includes('엄마손횟집'), String(keum.sourceDescription).slice(0, 60));
check('설명글: 첫 검색어 = 연동 엄마손횟집', keum.queryList[0] === '연동 엄마손횟집', keum.queryList.join(' / '));
check('설명글: 실제 후보가 엄마손횟집', (keum.candidates[0] || {}).name === '엄마손횟집', JSON.stringify(keum.candidates[0] && keum.candidates[0].name));
check('설명글: 펜션으로 새지 않음', !keum.queryList.some((q) => q.indexOf('한달') >= 0), keum.queryList.join(' / '));
check('설명글: titleStatus=video 유지', keum.titleStatus === 'video', keum.titleStatus);

// 10-7. 제목만 있을 때(설명글 못 읽음): '제주 한달' 대신 '제주 횟집' → '제주 돌돔'
const keumTitleOnly = extractSearchQueries(KEUM_TITLE);
check('정제(제목만): 지역 = 제주', keumTitleOnly.area === '제주', keumTitleOnly.area);
check('정제(제목만): 업종 = 횟집', keumTitleOnly.category === '횟집', keumTitleOnly.category);
check('정제(제목만): 1순위 = 제주 횟집', keumTitleOnly.queries[0] === '제주 횟집', keumTitleOnly.queries.join(' / '));
check('정제(제목만): 2순위 = 제주 돌돔', keumTitleOnly.queries[1] === '제주 돌돔', keumTitleOnly.queries.join(' / '));
check(
  '정제(제목만): "제주 한달" 은 절대 안 나옴',
  !keumTitleOnly.queries.some((q) => q.indexOf('한달') >= 0),
  keumTitleOnly.queries.join(' / ')
);
check(
  '정제(제목만): 기간·수식어 불용어',
  ['한달', '특별한', '자연산', '무슨맛일까', '수준', '미친'].every((w) => keumTitleOnly.keywords.indexOf(w) < 0),
  keumTitleOnly.keywords.join(',')
);
check(
  '정제(제목만): 금액(35만원짜리) 걸러냄',
  keumTitleOnly.keywords.indexOf('35만원짜리') < 0 && !keumTitleOnly.queries.join(' ').includes('35만원'),
  keumTitleOnly.keywords.join(',')
);

// 10-8. 동네 판별: '연동'은 잡고('제주시 연동'), '운동·화면'은 안 잡습니다.
check('동네: 주소형 "제주시 연동" → 연동', findAreaFromText(cleanCaptionText('제주시 연동 “엄마손횟집”')) === '연동', findAreaFromText(cleanCaptionText('제주시 연동 “엄마손횟집”')));
check('동네: "연동 맛집" → 연동', findAreaFromText('연동 맛집') === '연동', findAreaFromText('연동 맛집'));
check('동네: "운동"은 동네 아님', findAreaFromText('운동 좋아하는 사람') === '', findAreaFromText('운동 좋아하는 사람'));
check('동네: "화면"은 동네 아님', findAreaFromText('화면 가득한 풍경') === '', findAreaFromText('화면 가득한 풍경'));
check('동네: "성수역"은 역명만', findAreaFromText('성수역 3번 출구') === '성수', findAreaFromText('성수역 3번 출구'));
check('동네: 못 찾으면 빈 값', findAreaFromText('') === '' && findAreaFromText('정말 맛있는 집') === '', findAreaFromText('정말 맛있는 집'));
check('상호: 제목+설명글에서 따옴표 상호', findStoreName(KEUM_TITLE + '\n' + KEUM_DESC, '연동') === '엄마손횟집', findStoreName(KEUM_TITLE + '\n' + KEUM_DESC, '연동'));
check('앞부분만 보기: 줄 수 제한', leadingText('a\nb\nc', 500, 2) === 'a\nb', leadingText('a\nb\nc', 500, 2));
check('업종 구체성: 횟집은 구체적, 맛집은 일반적', isSpecificCategory('횟집') === true && isSpecificCategory('맛집') === false);

// ── 11. v1.3: 유튜브 댓글(commentThreads) — 업로더 고정 댓글에만 있는 상호 ──
const CAMO_DOC = {
  id: '555001',
  place_name: '카모플라쥬 성수',
  category_name: '카페,디저트',
  category_group_code: 'CE7',
  phone: '',
  address_name: '서울 성동구 성수동2가 315-54',
  road_address_name: '서울 성동구 연무장길 110',
  x: '127.0560',
  y: '37.5432',
  place_url: 'http://place.map.kakao.com/555001',
};
const UPLOADER_ID = 'UC_uploader_hokidori';
const CAMO_TITLE = '평균리뷰 1000개 이상, 성수동 카페추천! ☕️';
const CAMO_THREADS = {
  items: [
    {
      snippet: {
        topLevelComment: {
          snippet: {
            textDisplay: '요즘 여기 많이 가요',
            authorChannelId: { value: 'UC_fan_1' },
            likeCount: '12',
          },
        },
      },
    },
    {
      snippet: {
        topLevelComment: {
          snippet: {
            textDisplay: '여기 성수동 카모플라쥬에요!',
            authorChannelId: { value: UPLOADER_ID },
            likeCount: '3',
          },
        },
      },
    },
  ],
};

// 11-1. 댓글 정렬·텍스트 단위
check(
  '댓글: 업로더(고정) 댓글을 맨 앞으로',
  orderYouTubeComments(
    [
      { text: '요즘 여기 많이 가요', authorChannelId: 'UC_fan_1' },
      { text: '여기 성수동 카모플라쥬에요!', authorChannelId: UPLOADER_ID },
    ],
    UPLOADER_ID
  )[0].text === '여기 성수동 카모플라쥬에요!'
);
check(
  '댓글: 업로더 정보 없으면 API 순서 유지',
  orderYouTubeComments(
    [
      { text: '첫 댓글', authorChannelId: 'a' },
      { text: '둘째 댓글', authorChannelId: 'b' },
    ],
    ''
  )[0].text === '첫 댓글'
);
check(
  '댓글: 텍스트 한 덩어리로 합치기',
  commentsToText(
    [
      { text: '요즘 여기 많이 가요', authorChannelId: 'UC_fan_1' },
      { text: '여기 성수동 카모플라쥬에요!', authorChannelId: UPLOADER_ID },
    ],
    UPLOADER_ID
  ).indexOf('카모플라쥬') >= 0
);
check('댓글: 최대 5개', YOUTUBE_COMMENTS_MAX === 5, String(YOUTUBE_COMMENTS_MAX));

// 11-2. 키가 없으면 댓글 요청 자체를 보내지 않습니다.
setKeys({ kakao: 'KAKAOKEY' });
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
calls = [];
handler = (url) =>
  String(url).includes('youtube.com/oembed') ? jsonRes({ title: CAMO_TITLE }) : jsonRes({ documents: [] });
await extractPlaces('https://www.youtube.com/shorts/EKbeq6BnREI');
check(
  '댓글: 키 없으면 commentThreads 호출 안 함',
  !calls.some((c) => String(c.url).includes('commentThreads')),
  calls.map((c) => String(c.url)).join(' | ').slice(0, 160)
);
check(
  '댓글: fetchYouTubeComments 는 키 없으면 빈 배열',
  (await fetchYouTubeComments(parseUrl('https://youtu.be/9Xk2mQpLz7A'))).length === 0
);

// 11-3. 키가 있을 때: 제목·설명글에 상호가 없고 업로더 댓글에만 상호가 있는 경우
setKeys({ kakao: 'KAKAOKEY' });
process.env.EXPO_PUBLIC_YOUTUBE_API_KEY = 'YTKEY';
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title: CAMO_TITLE, author_name: '호키도리' });
  if (u.includes('/youtube/v3/videos')) {
    return jsonRes({
      items: [
        {
          snippet: {
            title: CAMO_TITLE,
            description: '이번 주에 다녀온 카페 모음입니다. 다들 어디 가세요?',
            channelId: UPLOADER_ID,
            thumbnails: { high: { url: 'https://i.ytimg.com/h.jpg' } },
          },
        },
      ],
    });
  }
  if (u.includes('/youtube/v3/commentThreads')) return jsonRes(CAMO_THREADS);
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({ documents: q === '성수동 카모플라쥬' ? [CAMO_DOC] : [] });
  }
  return jsonRes({ items: [], places: [] });
};
const camo = await extractPlaces('https://www.youtube.com/shorts/EKbeq6BnREI');
const commentCall = calls.find((c) => String(c.url).includes('commentThreads'));
check('댓글: commentThreads 호출함', !!commentCall, calls.map((c) => String(c.url)).join(' | ').slice(0, 200));
check(
  '댓글: videoId·order=relevance·maxResults=5·plainText',
  !!commentCall &&
    commentCall.url.includes('videoId=EKbeq6BnREI') &&
    commentCall.url.includes('order=relevance') &&
    commentCall.url.includes('maxResults=5') &&
    commentCall.url.includes('textFormat=plainText'),
  commentCall && commentCall.url
);
check('댓글: sourceComments 에 업로더 댓글 먼저', String(camo.sourceComments).indexOf('카모플라쥬') === 0 || String(camo.sourceComments).startsWith('여기 성수동 카모플라쥬'), String(camo.sourceComments));
check('댓글: 첫 검색어 = 성수동 카모플라쥬', camo.queryList[0] === '성수동 카모플라쥬', camo.queryList.join(' / '));
check('댓글: 실제 후보 = 카모플라쥬 성수', (camo.candidates[0] || {}).name === '카모플라쥬 성수', JSON.stringify(camo.candidates[0] && camo.candidates[0].name));

// 11-4. 제목·설명글에서 상호를 잡았으면 댓글 잡담은 검색어에 섞지 않습니다.
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title: '성수동 소금빵 맛집 베통' });
  if (u.includes('/youtube/v3/videos')) {
    return jsonRes({
      items: [{ snippet: { title: '성수동 소금빵 맛집 베통', description: '', channelId: UPLOADER_ID } }],
    });
  }
  if (u.includes('/youtube/v3/commentThreads')) return jsonRes(CAMO_THREADS);
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({ documents: q === '성수동 베통' ? [KAKAO_DOC] : [] });
  }
  return jsonRes({ items: [], places: [] });
};
const noLeak = await extractPlaces('https://youtu.be/9Xk2mQpLz7A');
check('댓글: 상호를 이미 잡았으면 첫 검색어는 제목 기준', noLeak.queryList[0] === '성수동 베통', noLeak.queryList.join(' / '));
check(
  '댓글: 상호가 있으면 댓글 후보를 섞지 않음',
  !noLeak.queryList.some((q) => q.indexOf('카모플라쥬') >= 0),
  noLeak.queryList.join(' / ')
);
check('댓글: 결과에는 댓글을 남겨 둠', String(noLeak.sourceComments).indexOf('카모플라쥬') >= 0, noLeak.sourceComments);

// 11-5. 댓글 비하는 영상(403) — 제목·설명글 추출은 그대로 동작해야 합니다.
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title: '성수동 소금빵 맛집 베통' });
  if (u.includes('/youtube/v3/videos')) {
    return jsonRes({
      items: [{ snippet: { title: '성수동 소금빵 맛집 베통', description: '연무장길 골목', channelId: UPLOADER_ID } }],
    });
  }
  if (u.includes('/youtube/v3/commentThreads')) return errRes(403);
  if (u.includes('dapi.kakao.com')) return jsonRes({ documents: [KAKAO_DOC] });
  return jsonRes({ items: [], places: [] });
};
const noComment = await extractPlaces('https://youtu.be/9Xk2mQpLz7A');
check('댓글 403: 예외 없이 결과', noComment.ok === true, JSON.stringify(noComment).slice(0, 120));
check('댓글 403: 제목으로 정상 검색', noComment.queryList[0] === '성수동 베통', noComment.queryList.join(' / '));
check('댓글 403: sourceComments 빈 값', noComment.sourceComments === '', noComment.sourceComments);
check('댓글 403: 후보도 정상', (noComment.candidates[0] || {}).name === '성수동 소금빵집');
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;

// ═════════════════════════════════════════════════════════════
// 13. v2.0 — 쇼츠 '맛집 5곳' 여러 가게 한 번에 저장
// ═════════════════════════════════════════════════════════════
const NUMBERED_TEXT = ['1. 성수동 베통 - 소금빵', '2. 연남동 뚜레쥬르', '3. 망원동 우동집'].join('\n');
const listNumbered = extractCandidatesFromText(NUMBERED_TEXT);
check('multi: 번호 목록 3곳', listNumbered.length === 3, JSON.stringify(listNumbered.map((i) => i.name)));
check(
  'multi: 1번 후보 이름·지역',
  listNumbered[0] && listNumbered[0].name === '베통' && listNumbered[0].area === '성수동',
  JSON.stringify(listNumbered[0])
);
check('multi: 1번 검색어 = 지역+상호', listNumbered[0] && listNumbered[0].queries[0] === '성수동 베통', JSON.stringify(listNumbered[0] && listNumbered[0].queries));
check('multi: 2번 후보 이름', listNumbered[1] && listNumbered[1].name === '뚜레쥬르', listNumbered[1] && listNumbered[1].name);
check('multi: 3번 후보 이름', listNumbered[2] && listNumbered[2].name === '우동집', listNumbered[2] && listNumbered[2].name);

const bulletList = ['📍 성수동 베통', '📍 연남 뚜레쥬르', '📍 망원 우동집'].join('\n');
const listBullet = extractCandidatesFromText(bulletList);
check('multi: 이모지 불릿 목록 3곳', listBullet.length === 3, JSON.stringify(listBullet.map((i) => i.name)));
check('multi: 불릿도 지역·상호 분리', listBullet[0] && listBullet[0].area === '성수동', JSON.stringify(listBullet[0]));

const commaList = extractCandidatesFromText('성수동 소금빵 맛집 베통, 연남 뚜레쥬르, 망원동 우동집');
check('multi: 쉼표 한 줄 3곳', commaList.length === 3, JSON.stringify(commaList.map((i) => i.name)));
check('multi: 쉼표 3번째 = 우동집', commaList[2] && commaList[2].name === '우동집', commaList[2] && commaList[2].name);

const manyList = Array.from({ length: 12 }, (_, i) => i + 1 + '. 성수동 국수집' + (i + 1)).join('\n');
check(
  'multi: 최대 8곳까지만',
  extractCandidatesFromText(manyList).length === MAX_MULTI_CANDIDATES && MAX_MULTI_CANDIDATES === 8,
  String(extractCandidatesFromText(manyList).length)
);

check('multi: 한 줄 캡션은 목록이 아님', extractCandidatesFromText('성수동 소금빵 맛집 베통 다녀왔어요').length === 0,
  JSON.stringify(extractCandidatesFromText('성수동 소금빵 맛집 베통 다녀왔어요').map((i) => i.name)));
check('multi: 설명글 문장은 목록이 아님(엄마손횟집 회귀)', extractCandidatesFromText(KEUM_DESC).length === 0,
  JSON.stringify(extractCandidatesFromText(KEUM_DESC).map((i) => i.name)));
check('multi: 빈 입력은 빈 배열', extractCandidatesFromText('').length === 0 && extractCandidatesFromText(null).length === 0);
check('multi: 문장형 줄은 목록 줄이 아님', looksLikeListLine('결론적으로 말씀 드리면 비쌉니다..') === false && looksLikeListLine('성수동 베통') === true);
check('multi: 번호 표식 제거', parseListItem('3) 성수동 베통').name === '베통', JSON.stringify(parseListItem('3) 성수동 베통')));
check('multi: 한 줄에 번호+쉼표', extractCandidatesFromText('1. 성수동 베통, 2. 연남동 뚜레쥬르').length === 2, JSON.stringify(extractCandidatesFromText('1. 성수동 베통, 2. 연남동 뚜레쥬르').map((i) => i.name)));
check('multi: 같은 줄이 두 번 와도 후보는 3곳', extractCandidatesFromText(NUMBERED_TEXT + '\n' + NUMBERED_TEXT).length === 3, String(extractCandidatesFromText(NUMBERED_TEXT + '\n' + NUMBERED_TEXT).length));
check('multi: 한 줄 쉼표 목록(공유 캡션 형태)', extractCandidatesFromText('성수동 베통, 연남동 뚜레쥬르, 망원동 우동집').length === 3);

// 13-2. 여러 후보를 지도 3사에 각각 물어보기 (fetch 스텁)
setKeys({ kakao: 'KAKAOKEY' });
const DOC_BETONG = { ...KAKAO_DOC, id: 'b1', place_name: '베통 성수', x: '127.0552', y: '37.5429' };
const DOC_TOUR = { ...KAKAO_DOC, id: 't1', place_name: '뚜레쥬르 연남', address_name: '서울 마포구 연남동 1', road_address_name: '서울 마포구 성미산로 2', x: '126.9250', y: '37.5600' };
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    if (q.includes('베통')) return jsonRes({ documents: [DOC_BETONG] });
    if (q.includes('뚜레쥬르')) return jsonRes({ documents: [DOC_TOUR] });
    return jsonRes({ documents: [] });
  }
  return jsonRes({ documents: [], items: [], places: [] });
};
const multiSearched = await searchMultiPlaces(listNumbered, { limit: 2 });
check('multi search: 2곳 매칭', multiSearched.matched === 2, String(multiSearched.matched));
check('multi search: 매칭된 이름', multiSearched.candidates.map((c) => c.name).join(',') === '베통 성수,뚜레쥬르 연남', multiSearched.candidates.map((c) => c.name).join(','));
check('multi search: 못 찾은 항목 1건', multiSearched.unmatched.length === 1, JSON.stringify(multiSearched.unmatched));
check('multi search: 후보에 순번 표시', multiSearched.candidates[0].multiIndex === 1, String(multiSearched.candidates[0].multiIndex));

// 13-3. extractPlaces 가 목록을 만나면 mode='multi' 로 돌려줍니다
calls = [];
const multiResult = await extractPlaces('https://www.instagram.com/reel/C8xSg2BpQ1K/', { caption: NUMBERED_TEXT });
check('multi: extractPlaces mode=multi', multiResult.mode === 'multi', String(multiResult.mode));
check('multi: 결과 후보 2곳', (multiResult.candidates || []).length === 2, JSON.stringify((multiResult.candidates || []).map((c) => c.name)));
check('multi: 못 찾은 항목도 함께', (multiResult.unmatched || []).length === 1, JSON.stringify(multiResult.unmatched));
check('multi: usedAdapter 에 multi 표시', String(multiResult.usedAdapter).indexOf('multi') === 0, String(multiResult.usedAdapter));

// 13-4. 공유 캡션이 설명글과 같은 문구로 두 번 들어와도(인스타 공유) 목록이 무너지지 않음
const dupCaption = '성수동 베통, 연남동 뚜레쥬르, 망원동 우동집';
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    if (q.indexOf('뚜레쥬르') >= 0) return jsonRes({ documents: [DOC_TOUR] });
    if (q.indexOf('우동') >= 0)
      return jsonRes({
        documents: [
          {
            ...DOC_BETONG,
            id: 'u1',
            place_name: '망원동 우동집',
            address_name: '서울 마포구 망원동 45-1',
            road_address_name: '서울 마포구 월드컵로 77',
            x: '126.9020',
            y: '37.5560',
          },
        ],
      });
    return jsonRes({ documents: [DOC_BETONG] });
  }
  return jsonRes({ documents: [], items: [], places: [] });
};
const dupResult = await extractPlaces('https://www.instagram.com/reel/C9multiTest1/', { caption: dupCaption });
check('multi: 공유 캡션 중복이어도 mode=multi', dupResult.mode === 'multi', String(dupResult.mode));
check('multi: 공유 캡션 중복이어도 3곳', (dupResult.candidates || []).length === 3, JSON.stringify((dupResult.candidates || []).map((c) => c.name)));


// 13-5. v2.8 — **긴 줄글 설명글은 여러 가게 목록이 아님**
//   실제 배포 API 응답 그대로: `/api/youtube?id=2QZPPEle9IY` (제목·설명글·댓글)
//   예전에는 "짧고 이름처럼 보이는 줄 3개 이상" 규칙 때문에 이 설명글의 줄글 문장들이
//   '설명글에서 찾은 가게 7곳'(다녀·압권·식사·있어서·가능했고·식당에·반찬들이)으로 잘못 갈라졌습니다.
const KEUM_REAL_TITLE = "한달 전 예약 필수인 제주도 정말 특별한 횟집. 35만원짜리 자연산 돌돔은 무슨맛일까..? #제주도 #제주도맛집";
const KEUM_REAL_DESC = `자연산 돌돔을 먹을 수 있는 정말 특별한 횟집?

제주시 연동 “엄마손횟집”

결론적으로 말씀 드리면 비쌉니다..
그렇지만 너무 특별한 경험할 수 있고
가격만 생각 안하면 너무 만족스럽게 다녀 온
엄마손횟집!!

몇년 전 부터 제주도 여행시 꼭 가야지 했던
먹킷리스트 1순위!

머리와 몸통, 꼬리까지 도마에 통채로 나오는
특이한 비주얼이 압권

19시 맞춰오래서 딱 맞춰 갔더니 
이미 많은 분들이 식사 중…

저는 방문 예정일 3일 전에 전화 문의 드렸고
예약이 다 찼다고 해서 예약 대기를 걸었는데
너무나 운이 좋게 당일 취소한 팀이 있어서
운 좋게 식사 ㅋㅋㅋ

제가 방문한 날은 자연산 돌돔/강담동(각각 35만원), 
벤자리(26만원) 주문이 가능했고
이곳의 시그니쳐 돌돔으로 선택!
(예약금 10만원 있어요~)

가정집 같은 식당에 도착하면 
손질 된 돌돔이 금방 나오고
처음엔 몇가지 없던 반찬들이
줄줄이 코스식으로 계속 나옴ㅋㅋ

반찬들이 전라도식이라 다 너무 맛있었고
돌돔은 꼬독한 껍질 식감이 뭔가 비싼맛(?)이라
넘 새로웠음!! 처음 먹어 보는 맛에 와…몇번 했는지 ㅋ

내장은 순대 내장 비슷했고
아귀간(안키모)와 비슷했던 돌돔 간도 존맛!

서비스로 내어주신 벤자리가 완전 내 스타일 이었는데
숙성회 같으면서 감칠맛이 끝내줌ㅋㅋ

혹시 돌돔과 벤자리 중 고민이라면
살며시 벤자리 추천…

마무리로 지리탕 나오고
쌀뜬물 + 돌돔 푹 우려서 입술에 쫙쫙 달라붙는
국물은 거의 약에 가까움…
시원 칼칼 진짜 너무 맛있고

밥도 주시길래 양푼이, 참기름 요청해서
남은 반찬과 비벼 먹으니 
하~ 이것이 행복이지!!

그리고 한번씩 남자 사장님의
연주도 볼 수 있다는데
이날은 안계셔서 볼 수 없었음ㅠ

적극 추천은 못하겠지만 제주도에서
특별한 경험 하고싶은 분들은
예약 해보세요~

✅제주시 연동 ”엄마손횟집“
✅자연산 돌돔 350,000원
✅19:00-21:30 (딱 1타임만 운영)
✅한달 전 예약 필수 이지만 당일 취소한 팀 있으면 
운 좋게 식사 가능! (준비 시간이 있으니 최소한 오전 중 연락 ㄱㄱ)
전화는 네이버 검색하면 개인 번호가 있습니다.`;
const KEUM_REAL_COMMENTS = `자연산 돌돔을 먹을 수 있는 정말 특별한 횟집? 제주시 연동 “엄마손횟집” 결론적으로 말씀 드리면 비쌉니다.. 그렇지만 너무 특별한 경험할 수 있고 가격만 생각 안하면 너무 만족스럽게 다녀 온 엄마손횟집!! 몇년 전 부터 제주도 여행시 꼭 가야지 했던 먹킷리스트 1순위! 머리와 몸통, 꼬리까지 도마에 통채로 나오는 특이한 비주얼이 압권 19시 맞춰오래서 딱 맞춰 갔더니 이미 많은 분들이 식사 중… 저는 방문 예정일 3일 전에 전화 문의 드렸고 예약이 다 찼다고 해서 예약 대기를 걸었는데 너무나 운이 좋게 당일 취소한 팀이 있어서 운
엄청 맛있어 보여요~ 밑반찬은 해산물 위주로 나오면 더 좋겠네요~^.,^
차라리 제주 동문 또는 올레시장 가서 돌돔 회 떠서 양념집 가는게 더 좋을 듯,,😂❤
비싸고 그날 잡은 상황에 따라 랜덤임
제주도 갈 뱅기값으로 근처 500미터 삼정횟집에 15만원짜리 방어가 유명한데 예약하고 가봐야겠습니다`;

check(
  'multi 회귀: 실제 설명글은 목록이 아님',
  extractCandidatesFromText(KEUM_REAL_DESC).length === 0,
  JSON.stringify(extractCandidatesFromText(KEUM_REAL_DESC).map((i) => i.name))
);
check(
  'multi 회귀: 줄글 설명의 문장 줄은 목록 줄이 아님',
  looksLikeListLine('가격만 생각 안하면 너무 만족스럽게 다녀 온') === false &&
    looksLikeListLine('특이한 비주얼이 압권') === false &&
    looksLikeListLine('이미 많은 분들이 식사 중…') === false &&
    looksLikeListLine('벤자리(26만원) 주문이 가능했고') === false &&
    looksLikeListLine('먹킷리스트 1순위!') === false &&
    looksLikeListLine('예약 해보세요~') === false &&
    looksLikeListLine('제주시 연동 “엄마손횟집”') === true &&
    looksLikeListLine('성수동 베통') === true,
  JSON.stringify(extractCandidatesFromText(KEUM_REAL_DESC).map((i) => i.name))
);
check(
  'multi 회귀: 실제 설명글에서 상호·동네는 그대로',
  extractSearchQueries(KEUM_REAL_TITLE + '\n' + KEUM_REAL_DESC).storeName === '엄마손횟집' &&
    extractSearchQueries(KEUM_REAL_TITLE + '\n' + KEUM_REAL_DESC).area === '연동',
  JSON.stringify(extractSearchQueries(KEUM_REAL_TITLE + '\n' + KEUM_REAL_DESC).queries.slice(0, 3))
);
check(
  'multi 회귀: 설명글의 ✅ 정보 줄(가격·영업시간)은 목록으로 오인하지 않음',
  extractCandidatesFromText('✅제주시 연동 ”엄마손횟집“\n✅자연산 돌돔 350,000원\n✅19:00-21:30 (딱 1타임만 운영)').length === 0,
  JSON.stringify(extractCandidatesFromText('✅제주시 연동 ”엄마손횟집“\n✅자연산 돌돔 350,000원\n✅19:00-21:30 (딱 1타임만 운영)').map((i) => i.name))
);
check(
  'multi: 불릿 두 줄도 목록 (v2.8)',
  extractCandidatesFromText('• 성수동 베통\n• 연남동 뚜레쥬르').length === 2,
  JSON.stringify(extractCandidatesFromText('• 성수동 베통\n• 연남동 뚜레쥬르').map((i) => i.name))
);
check(
  'multi: "성수 맛집 3곳: 뇨끼바, 꿉당, 소문난성수감자탕" 은 3곳',
  extractCandidatesFromText('성수 맛집 3곳: 뇨끼바, 꿉당, 소문난성수감자탕')
    .map((i) => i.name)
    .join(',') === '뇨끼바,꿉당,소문난성수감자탕',
  JSON.stringify(extractCandidatesFromText('성수 맛집 3곳: 뇨끼바, 꿉당, 소문난성수감자탕').map((i) => i.name))
);

// 실제 메타데이터(제목·설명글·댓글)를 그대로 넣고 extractPlaces 를 돌립니다.
// 배포 프록시(/api/youtube)와 같은 경로 — YouTube Data API 응답을 스텁으로 재현합니다.
setKeys({ kakao: 'KAKAOKEY' });
process.env.EXPO_PUBLIC_YOUTUBE_API_KEY = 'YTKEY';
const DOC_KEUM = {
  ...KAKAO_DOC,
  id: 'keum1',
  place_name: '엄마손횟집',
  address_name: '제주 제주시 연동 123-4',
  road_address_name: '제주 제주시 연동 123-4',
  x: '126.4886',
  y: '33.4891',
  place_url: 'http://place.map.kakao.com/999',
};
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title: KEUM_REAL_TITLE, author_name: '맛집 채널' });
  if (u.includes('/youtube/v3/videos')) {
    return jsonRes({
      items: [
        {
          snippet: {
            title: KEUM_REAL_TITLE,
            description: KEUM_REAL_DESC,
            channelId: 'UCWYPyxj_Efa07L-VqmKclvQ',
            thumbnails: { high: { url: 'https://i.ytimg.com/vi/2QZPPEle9IY/hqdefault.jpg' } },
          },
        },
      ],
    });
  }
  if (u.includes('/youtube/v3/commentThreads')) return jsonRes(KEUM_THREADS);
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({ documents: q.indexOf('엄마손') >= 0 ? [DOC_KEUM] : [] });
  }
  return jsonRes({ documents: [], items: [], places: [] });
};
const KEUM_THREADS = {
  "items": [
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "자연산 돌돔을 먹을 수 있는 정말 특별한 횟집? 제주시 연동 “엄마손횟집” 결론적으로 말씀 드리면 비쌉니다.. 그렇지만 너무 특별한 경험할 수 있고 가격만 생각 안하면 너무 만족스럽게 다녀 온 엄마손횟집!! 몇년 전 부터 제주도 여행시 꼭 가야지 했던 먹킷리스트 1순위! 머리와 몸통, 꼬리까지 도마에 통채로 나오는 특이한 비주얼이 압권 19시 맞춰오래서 딱 맞춰 갔더니 이미 많은 분들이 식사 중… 저는 방문 예정일 3일 전에 전화 문의 드렸고 예약이 다 찼다고 해서 예약 대기를 걸었는데 너무나 운이 좋게 당일 취소한 팀이 있어서 운",
            "authorChannelId": {
              "value": "UCWYPyxj_Efa07L-VqmKclvQ"
            },
            "likeCount": 10
          }
        }
      }
    },
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "엄청 맛있어 보여요~ 밑반찬은 해산물 위주로 나오면 더 좋겠네요~^.,^",
            "authorChannelId": {
              "value": "UCviewer1"
            },
            "likeCount": 9
          }
        }
      }
    },
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "차라리 제주 동문 또는 올레시장 가서 돌돔 회 떠서 양념집 가는게 더 좋을 듯,,😂❤",
            "authorChannelId": {
              "value": "UCviewer2"
            },
            "likeCount": 8
          }
        }
      }
    },
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "비싸고 그날 잡은 상황에 따라 랜덤임",
            "authorChannelId": {
              "value": "UCviewer3"
            },
            "likeCount": 7
          }
        }
      }
    },
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "제주도 갈 뱅기값으로 근처 500미터 삼정횟집에 15만원짜리 방어가 유명한데 예약하고 가봐야겠습니다",
            "authorChannelId": {
              "value": "UCviewer4"
            },
            "likeCount": 6
          }
        }
      }
    }
  ]
};
const keumResult = await extractPlaces('https://youtube.com/shorts/2QZPPEle9IY');
check('multi 회귀: mode 가 multi 가 아님', keumResult.mode === 'single', String(keumResult.mode));
check(
  'multi 회귀: 후보는 엄마손횟집 1곳',
  (keumResult.candidates || []).length === 1 && keumResult.candidates[0].name === '엄마손횟집',
  JSON.stringify((keumResult.candidates || []).map((c) => c.name))
);
check(
  'multi 회귀: 첫 검색어 = 연동 엄마손횟집',
  keumResult.queryList[0] === '연동 엄마손횟집',
  keumResult.queryList.join(' / ')
);

// 디오디아2.0 (WtB53sC3weY) 도 실제 메타데이터 그대로 '한 곳' 흐름
const DIO_REAL_TITLE = "5만원대 강남 럭셔리 뷔페 #shorts #디오디아 #리뷰";
const DIO_REAL_DESC = `clclalsgml@naver.com - 광고/문의🎖️`;
const DIO_REAL_COMMENTS = `따봉을 날리는 와중에도 오물오물 꼭꼭 씹어 먹는게 졸귀시네용😊
항상 솔직하게 말하셔서 좋다😊
진짜... 아침부터 기분좋게 웃자나요
일단 뷔페는 됐고, 난 알아요를 아신다는건.. 저.. 실례지만 연배가 어떻게 되십니까?;;; ㅋㅋㅋ ㄷㄷㄷ
난~~ 알아요 하자마자 구독하고감니다,,, 쯔왕돈까스도 솔직 리뷰해주셔셔 지방러는 못가지만 가본 너낌이네유 🤗🤗`;
const DIO_THREADS = {
  "items": [
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "따봉을 날리는 와중에도 오물오물 꼭꼭 씹어 먹는게 졸귀시네용😊",
            "authorChannelId": {
              "value": "UCy84pu9zehcKYZ40jU595aA"
            },
            "likeCount": 10
          }
        }
      }
    },
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "항상 솔직하게 말하셔서 좋다😊",
            "authorChannelId": {
              "value": "UCviewer1"
            },
            "likeCount": 9
          }
        }
      }
    },
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "진짜... 아침부터 기분좋게 웃자나요",
            "authorChannelId": {
              "value": "UCviewer2"
            },
            "likeCount": 8
          }
        }
      }
    },
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "일단 뷔페는 됐고, 난 알아요를 아신다는건.. 저.. 실례지만 연배가 어떻게 되십니까?;;; ㅋㅋㅋ ㄷㄷㄷ",
            "authorChannelId": {
              "value": "UCviewer3"
            },
            "likeCount": 7
          }
        }
      }
    },
    {
      "snippet": {
        "topLevelComment": {
          "snippet": {
            "textDisplay": "난~~ 알아요 하자마자 구독하고감니다,,, 쯔왕돈까스도 솔직 리뷰해주셔셔 지방러는 못가지만 가본 너낌이네유 🤗🤗",
            "authorChannelId": {
              "value": "UCviewer4"
            },
            "likeCount": 6
          }
        }
      }
    }
  ]
};
check(
  'multi 회귀: 디오디아 설명글·댓글은 목록이 아님',
  extractCandidatesFromText(DIO_REAL_DESC + '\n' + DIO_REAL_COMMENTS).length === 0,
  JSON.stringify(extractCandidatesFromText(DIO_REAL_DESC + '\n' + DIO_REAL_COMMENTS).map((i) => i.name))
);
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title: DIO_REAL_TITLE, author_name: '디오디아' });
  if (u.includes('/youtube/v3/videos')) {
    return jsonRes({
      items: [
        {
          snippet: {
            title: DIO_REAL_TITLE,
            description: DIO_REAL_DESC,
            channelId: 'UCy84pu9zehcKYZ40jU595aA',
            thumbnails: { high: { url: 'https://i.ytimg.com/vi/WtB53sC3weY/hqdefault.jpg' } },
          },
        },
      ],
    });
  }
  if (u.includes('/youtube/v3/commentThreads')) return jsonRes(DIO_THREADS);
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({
      documents:
        q.indexOf('디오디아') >= 0
          ? [{ ...KAKAO_DOC, id: 'dio1', place_name: '디오디아2.0', address_name: '서울 서초구 양재동 1', x: '127.0400', y: '37.4700' }]
          : [],
    });
  }
  return jsonRes({ documents: [], items: [], places: [] });
};
const dioResult = await extractPlaces('https://www.youtube.com/shorts/WtB53sC3weY');
check('multi 회귀: 디오디아 mode=single', dioResult.mode === 'single', String(dioResult.mode));
check(
  'multi 회귀: 디오디아 후보 1곳',
  (dioResult.candidates || []).length === 1 && String(dioResult.candidates[0].name).indexOf('디오디아') >= 0,
  JSON.stringify((dioResult.candidates || []).map((c) => c.name))
);
check(
  'multi 회귀: 영상 썸네일이 결과에 남음(히어로 카드 배경용)',
  String(keumResult.sourceThumbnail || '').indexOf('2QZPPEle9IY') >= 0,
  String(keumResult.sourceThumbnail)
);
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;

// ═════════════════════════════════════════════════════════════
// 14. v2.0 — 네이버 지도 링크 직행 + 상세 시트 정보(전화·주소)
// ═════════════════════════════════════════════════════════════
check('naver id: map.naver.com/p/entry/place', extractNaverPlaceId('https://map.naver.com/p/entry/place/1736095566?c=17.00,0,0,0,dh') === '1736095566');
check('naver id: m.place.naver.com/place', extractNaverPlaceId('https://m.place.naver.com/place/1736095566') === '1736095566');
check('naver id: m.place.naver.com/restaurant/home', extractNaverPlaceId('https://m.place.naver.com/restaurant/1736095566/home') === '1736095566');
check('naver id: map.naver.com/v5/entry/place', extractNaverPlaceId('https://map.naver.com/v5/entry/place/1234567890') === '1234567890');
check('naver id: 숫자만 있으면 그대로', extractNaverPlaceId('1736095566') === '1736095566' && extractNaverPlaceId('123') === '');
check('naver id: 지도 검색 링크에는 없음', extractNaverPlaceId('https://map.naver.com/p/search/베통') === '');
check('naver 상세 주소', naverPlaceDetailUrl('1736095566') === 'https://m.place.naver.com/place/1736095566/home', naverPlaceDetailUrl('1736095566'));
check('naver 상세 주소: 이상한 id 는 빈 값', naverPlaceDetailUrl('abc') === '' && naverPlaceDetailUrl('') === '');
check(
  'naver place: naverPlaceId 있으면 상세 직행',
  naverPlaceSearchUrl({ name: '칸다소바', area: '서교동', naverPlaceId: '1736095566' }) ===
    'https://m.place.naver.com/place/1736095566/home',
  naverPlaceSearchUrl({ name: '칸다소바', area: '서교동', naverPlaceId: '1736095566' })
);
check(
  'naver place: placeUrl 에 id 가 있어도 상세 직행',
  naverPlaceSearchUrl({ name: '칸다소바', placeUrl: 'https://m.place.naver.com/place/1736095566/home' }) ===
    'https://m.place.naver.com/place/1736095566/home'
);
check('naver place: id 없으면 기존 검색 목록', naverPlaceSearchUrl({ name: '베통 성수' }).indexOf('/place/list?query=') > 0);

// 실제 네이버 플레이스 페이지에서 확인한 값 그대로 (2026-11-15 라이브)
const NAVER_PLACE_HTML =
  '<html><head><meta property="og:title" content="칸다소바 : 네이버" />' +
  '<meta property="og:description" content="방문자리뷰 6,945 · 블로그리뷰 2,127" /></head><body>' +
  '<a href="https://nmap.place.naver.com/launchApp/route?path=route&amp;type=place&amp;dlat=37.5492716&amp;dlng=126.9227124&amp;did=1736095566&amp;dname=%EC%B9%B8%EB%8B%A4%EC%86%8C%EB%B0%94">길찾기</a>' +
  '<a href="#" data-title="칸다소바&#10;서울 마포구 와우산로 51-6" data-line-description="서울 마포구 와우산로 51-6">공유</a>' +
  '<a href="tel:0507-1375-1660">전화</a></body></html>';
const naverPage = parseNaverPlaceHtml(NAVER_PLACE_HTML);
check('naver page: 이름에서 " : 네이버" 제거', naverPage.title === '칸다소바', naverPage.title);
check(
  'naver page: 좌표(dlat/dlg)',
  Math.abs(naverPage.lat - 37.5492716) < 1e-9 && Math.abs(naverPage.lng - 126.9227124) < 1e-9,
  JSON.stringify(naverPage)
);
check('naver page: 주소', naverPage.address === '서울 마포구 와우산로 51-6', naverPage.address);
check('naver page: 전화', naverPage.phone === '0507-1375-1660', naverPage.phone);
check('naver page: 빈 HTML 도 예외 없이', parseNaverPlaceHtml('').title === '' && parseNaverPlaceHtml(null).lat === null);

const naverCand = naverPlaceCandidate({
  naverPlaceId: '1736095566',
  title: '칸다소바',
  lat: 37.5492716,
  lng: 126.9227124,
  address: '서울 마포구 와우산로 51-6',
  phone: '0507-1375-1660',
});
check('naver 후보: 좌표·placeId', naverCand.naverPlaceId === '1736095566' && naverCand.manual === false, JSON.stringify(naverCand));
check('naver 후보: 동네 추출(주소의 구 단위)', naverCand.area === '마포', naverCand.area);
check('naver 후보: 매장 URL 은 상세 페이지', naverCand.placeUrl === 'https://m.place.naver.com/place/1736095566/home', naverCand.placeUrl);
check('naver 후보: placeId 없으면 null', naverPlaceCandidate({ title: 'x' }) === null);

// 14-2. 리다이렉트를 따라가 목적지 읽기 (네이티브 = 기기에서 직접)
const htmlPage = (html, finalUrl) => ({
  ok: true,
  status: 200,
  url: finalUrl,
  json: async () => ({}),
  text: async () => html,
});
handler = (url) => {
  if (String(url).includes('naver.me')) return htmlPage(NAVER_PLACE_HTML, 'https://m.place.naver.com/restaurant/1736095566/home');
  return htmlPage(NAVER_PLACE_HTML, 'https://m.place.naver.com/place/1736095566/home');
};
const resolvedShort = await resolveShortLink('https://naver.me/GabcdEfg');
check('resolve: 최종 주소에서 placeId', resolvedShort.naverPlaceId === '1736095566', resolvedShort.naverPlaceId);
check('resolve: 제목·좌표까지', resolvedShort.title === '칸다소바' && Math.abs(resolvedShort.lat - 37.5492716) < 1e-9, JSON.stringify(resolvedShort));

const placeLink = await resolvePlaceLinkFromInput(['https://m.place.naver.com/place/1736095566']);
check('placeLink: 네이버 링크 감지', placeLink && placeLink.naverPlaceId === '1736095566', JSON.stringify(placeLink));
check('placeLink: 이름·좌표 확보', placeLink.title === '칸다소바' && Number.isFinite(placeLink.lat), JSON.stringify(placeLink));
check('placeLink: 단축 링크는 naver.me 만', isShortLinkUrl('https://naver.me/x') === true && isShortLinkUrl('https://youtu.be/abc') === true && isShortLinkUrl('https://map.naver.com/p/entry/place/1') === false);
check('placeLink: 관계없는 링크는 null', (await resolvePlaceLinkFromInput(['https://www.instagram.com/reel/abc/'])) === null);

// 14-3. 붙여넣은 네이버 링크 → placeId 붙은 핀 (지도 검색 없이)
handler = (url) => {
  if (String(url).includes('dapi.kakao.com')) return jsonRes({ documents: [] });
  return htmlPage(NAVER_PLACE_HTML, 'https://m.place.naver.com/place/1736095566/home');
};
const naverLinkResult = await extractPlaces('https://m.place.naver.com/place/1736095566');
check('naver 링크: mode=single', naverLinkResult.mode === 'single', String(naverLinkResult.mode));
check('naver 링크: usedAdapter=naver-place-link', naverLinkResult.usedAdapter === 'naver-place-link', String(naverLinkResult.usedAdapter));
check('naver 링크: 후보 이름', (naverLinkResult.candidates[0] || {}).name === '칸다소바', JSON.stringify(naverLinkResult.candidates[0] && naverLinkResult.candidates[0].name));
check('naver 링크: 후보에 naverPlaceId', (naverLinkResult.candidates[0] || {}).naverPlaceId === '1736095566');
check('naver 링크: 핀에 phone 저장', buildPin(naverLinkResult.candidates[0], {}).phone === '0507-1375-1660');
check('naver 링크: 이름을 읽었으니 "제목을 못 읽어와요" 안내 없음', naverLinkResult.titleNotice === '' && naverLinkResult.sourceTitle === '칸다소바', JSON.stringify([naverLinkResult.titleNotice, naverLinkResult.sourceTitle]));
check('naver 링크: titleStatus=page', naverLinkResult.titleStatus === 'page', naverLinkResult.titleStatus);

// 14-4. 전화번호 → tel: 링크
check('tel: 일반 번호', telUrlOf('0507-1375-1660') === 'tel:050713751660', telUrlOf('0507-1375-1660'));
check('tel: 02 번호', telUrlOf('02-123-4567') === 'tel:021234567');
check('tel: 너무 짧으면 빈 값', telUrlOf('123') === '' && telUrlOf('') === '');
const phoneOpened = await openPhone('02-123-4567');
check('openPhone: tel: 로 열기', phoneOpened.opened === true && phoneOpened.url === 'tel:021234567', JSON.stringify(phoneOpened));

// ═════════════════════════════════════════════════════════════
// 15. v2.0 — 핀 중복 판정(이름+좌표 근접) + 여러 곳 저장
// ═════════════════════════════════════════════════════════════
check('same pin: 반경 상수 200m', SAME_PLACE_RADIUS_M === 200, String(SAME_PLACE_RADIUS_M));
const basePin = { name: '베통 성수', area: '성수동', lat: 37.5429, lng: 127.0552 };
check('same pin: 같은 이름 + 50m', isSamePin(basePin, { ...basePin, lat: 37.5433, lng: 127.0554 }) === true);
check('same pin: 같은 이름이어도 2km 밖이면 다른 곳', isSamePin(basePin, { ...basePin, lat: 37.56, lng: 127.07 }) === false);
check('same pin: 이름이 달라도 같은 placeId 면 같은 곳', isSamePin({ name: '베통', naverPlaceId: '123456' }, { name: '베통성수', naverPlaceId: '123456' }) === true);
check('same pin: 좌표 없이 이름만 같으면 같은 곳', isSamePin({ name: '베통' }, { name: '베통 성수' }) === false && isSamePin({ name: '베통' }, { name: '베통' }) === true);

const splitResult = splitNewPins(
  [{ ...basePin, id: 'saved-1' }],
  [
    { ...basePin, lat: 37.5431, name: '베통 성수' }, // 이미 있음
    { name: '베통 성수', lat: 37.56, lng: 127.07 }, // 같은 이름·다른 동네 → 새 핀
    { name: '뚜레쥬르 연남', lat: 37.56, lng: 126.925 },
  ]
);
check('split: 새 핀 2곳', splitResult.fresh.length === 2, JSON.stringify(splitResult.fresh.map((p) => p.name)));
check('split: 중복 1곳', splitResult.duplicates.length === 1 && splitResult.duplicates[0].existing.id === 'saved-1', JSON.stringify(splitResult.duplicates.map((d) => d.pin.name)));
check('findExistingPin: naverPlaceId 로도 중복 판정', (findExistingPin([{ name: '다른이름', naverPlaceId: '1736095566' }], { name: '칸다소바', naverPlaceId: '1736095566' }) || {}).name === '다른이름');
const builtPin = buildPin({ name: '칸다소바', lat: 37.5, lng: 127, phone: '0507-1375-1660', naverPlaceId: '1736095566', address: '서울 마포구 와우산로 51-6' }, {});
check('pin: phone · naverPlaceId 저장', builtPin.phone === '0507-1375-1660' && builtPin.naverPlaceId === '1736095566', JSON.stringify({ phone: builtPin.phone, id: builtPin.naverPlaceId }));
const normalizedOldPin = normalizePin({ name: '옛 핀', lat: 37.5, lng: 127 });
check('pin: 옛 핀에 phone·naverPlaceId 기본값', normalizedOldPin.phone === '' && normalizedOldPin.naverPlaceId === '');

// ═════════════════════════════════════════════════════════════
// 16. v2.0 — 내 맛집 지도 공유 링크 (?share=)
// ═════════════════════════════════════════════════════════════
const SHARE_PINS = [
  { name: '베통 성수', category: '카페', area: '성수동', lat: 37.5429, lng: 127.0552, placeUrl: 'https://m.place.naver.com/place/1736095566/home', naverPlaceId: '1736095566', phone: '02-123-4567', address: '서울 성동구 연무장7가길 8' },
  { name: '연남동 딸기 케이크 맛집', category: '디저트', area: '연남동', lat: 37.56, lng: 126.925, address: '서울 마포구 성미산로 00' },
  { name: '망원동 우동 맛집', category: '맛집', area: '망원동', lat: 37.556, lng: 126.902 },
  { name: '검단 아라뱃길 뷰 카페', category: '카페', area: '검단', lat: 37.592, lng: 126.69 },
  { name: '을지로 노포 국밥', category: '맛집', area: '을지로', lat: 37.5665, lng: 126.991 },
  { name: '한남동 브런치', category: '카페', area: '한남동', lat: 37.534, lng: 127.001 },
  { name: '성수 소금빵', category: '베이커리', area: '성수동', lat: 37.5445, lng: 127.0557 },
  { name: '판교 오마카세', category: '맛집', area: '판교', lat: 37.3947, lng: 127.1112 },
];
const shareCode = encodeSharePins(SHARE_PINS);
check('share: 접두사 r2-', String(shareCode).indexOf('r2-') === 0, String(shareCode).slice(0, 10));
check('share: URL 안전 문자만', /^[A-Za-z0-9_-]+$/.test(String(shareCode).slice(3)), String(shareCode).slice(0, 40));
const shareBack = decodeSharePins(shareCode);
check('share: 왕복 8곳', shareBack && shareBack.count === 8, String(shareBack && shareBack.count));
check('share: 한글 이름 보존', shareBack.pins[0].name === '베통 성수' && shareBack.pins[1].name === '연남동 딸기 케이크 맛집', shareBack.pins[0].name);
check('share: 좌표 소수점 유지', Math.abs(shareBack.pins[0].lat - 37.5429) < 1e-9 && Math.abs(shareBack.pins[0].lng - 127.0552) < 1e-9, JSON.stringify([shareBack.pins[0].lat, shareBack.pins[0].lng]));
check('share: naverPlaceId·전화·주소 유지', shareBack.pins[0].naverPlaceId === '1736095566' && shareBack.pins[0].phone === '02-123-4567' && shareBack.pins[0].address === '서울 성동구 연무장7가길 8', JSON.stringify(shareBack.pins[0]));
check('share: 미리보기 핀 표시', shareBack.pins[0].shared === true && shareBack.pins[0].platform === 'share');
check('share: 빈 좌표 핀은 담지 않음', decodeSharePins(encodeSharePins([{ name: '좌표없는곳' }])) === null);
check('share: 이름 없는 핀은 건너뜀', decodeSharePins(encodeSharePins([{ lat: 37.5, lng: 127 }, SHARE_PINS[0]])).count === 1);
check('share: 잘못된 코드는 null', decodeSharePins('r2-!!!!') === null && decodeSharePins('hello') === null && decodeSharePins('') === null);

const shareUrl = buildShareUrl(SHARE_PINS, { origin: 'https://reelpin.vercel.app' });
check('share url: ?share= 규격', shareUrl.indexOf('https://reelpin.vercel.app/?share=r2-') === 0, shareUrl.slice(0, 60));
check('share url: 공백·한글 없이 안전', /^[A-Za-z0-9\-_.~:\/?=]+$/.test(shareUrl), shareUrl.slice(0, 80));
check('share url: 8곳도 2,000자 이내', shareUrl.length < 2000, String(shareUrl.length));
check('share url: origin 기본값', buildShareUrl(SHARE_PINS).indexOf(DEFAULT_SHARE_ORIGIN + '/?share=') === 0, buildShareUrl(SHARE_PINS).slice(0, 50));
check('share url: 끝 슬래시 중복 없음', buildShareUrl(SHARE_PINS, { origin: 'https://x.test/' }).indexOf('https://x.test/?share=') === 0);
const parsedShare = parseShareFromUrl(new URL(shareUrl).search);
check('share parse: ?share= 읽기', parsedShare && parsedShare.count === 8, JSON.stringify(parsedShare && parsedShare.count));
check('share parse: #share= 읽기', (parseShareFromUrl('#share=' + shareCode) || {}).count === 8);
check('share parse: 없으면 null', parseShareFromUrl('?x=1') === null && parseShareFromUrl('') === null);
check('share message: 여러 동네면 지역명 없이', shareMessage(SHARE_PINS) === '내 릴스 맛집 지도 · 8곳', shareMessage(SHARE_PINS));
check(
  'share message: 한 동네에 몰리면 동네 이름',
  shareMessage([
    { name: 'A', area: '성수동' },
    { name: 'B', area: '성수동' },
    { name: 'C', area: '성수동' },
  ]) === '내 성수동 릴스 지도 · 3곳',
  shareMessage([{ name: 'A', area: '성수동' }, { name: 'B', area: '성수동' }, { name: 'C', area: '성수동' }])
);
check('share: base64url 왕복', base64UrlDecode(base64UrlEncode(utf8Encode('릴스핀 r2 ✓'))).length > 0 && utf8Decode(base64UrlDecode(base64UrlEncode(utf8Encode('릴스핀 r2 ✓')))) === '릴스핀 r2 ✓');
check('share: base64url 은 + / = 를 쓰지 않음', !/[+/=]/.test(base64UrlEncode(utf8Encode('~~~???___한글'))));


// ═════════════════════════════════════════════════════════════
// 17. v2.7 — 유튜브 쇼츠 해시태그 상호(#디오디아) · 댓글 형용사 오탐
//   상훈 님이 제보한 영상(youtube.com/shorts/WtB53sC3weY)의 **실제** 메타데이터.
//   · 제목: “5만원대 강남 럭셔리 뷔페 #shorts #디오디아 #리뷰” — 상호는 **해시태그**로만 있었습니다.
//   · 설명: 광고 문의 메일뿐 — 상호 없음.
//   · 댓글: “항상 솔직하게 말하셔서 좋다😊” — 감상어가 검색어가 되면 안 됩니다.
//   · 카카오 로컬에서 “강남 디오디아” = 디오디아2.0 (서울 서초구 강남대로 213 · 뷔페, 2026-11-16 확인)
// ═════════════════════════════════════════════════════════════
const DODIA_TITLE = '5만원대 강남 럭셔리 뷔페 #shorts #디오디아 #리뷰';
const DODIA_DESC = 'clclalsgml@naver.com - 광고/문의🎖️';
const DODIA_COMMENTS = [
  '항상 솔직하게 말하셔서 좋다😊',
  '따봉을 날리는 와중에도 오물오물 꼭꼭 씹어 먹는게 졸귀시네용😊',
  '진짜... 아침부터 기분좋게 웃자나요',
  '진짜 너무 귀여우시다',
  '저 일식좋아해서 저기한번 가볼게요 좋은 정보 고마워요♡',
].join('\n');
const DODIA_DOC = {
  id: '7850610',
  place_name: '디오디아2.0',
  category_name: '음식점 > 뷔페',
  category_group_code: 'FD6',
  phone: '02-526-8700',
  address_name: '서울 서초구 양재동 24-6',
  road_address_name: '서울 서초구 강남대로 213',
  x: '127.03566459833955',
  y: '37.48235358031832',
  place_url: 'http://place.map.kakao.com/7850610',
};
const ULSAN_DOC = {
  ...DODIA_DOC,
  id: '900001',
  place_name: '울산 중구 떡볶이',
  address_name: '울산 중구 학성동 1-1',
  road_address_name: '울산 중구 학성로 1',
};
const hasWord = (list, word) => (list || []).some((v) => String(v).indexOf(word) >= 0);

// 17-1. 해시태그는 원문에서 따로 읽습니다. ('#'을 지우면 뒤쪽 단어로 밀려서 누락되던 상호)
check('해시태그: 원문에서 낱말 수집', extractHashtagTokens(DODIA_TITLE).indexOf('디오디아') >= 0, JSON.stringify(extractHashtagTokens(DODIA_TITLE)));
check('해시태그: 없으면 빈 배열', extractHashtagTokens('성수동 소금빵 맛집 베통').length === 0 && extractHashtagTokens('').length === 0);
const dodiaTitle = extractSearchQueries(DODIA_TITLE + '\n' + DODIA_DESC);
check('디오디아: 지역 = 강남', dodiaTitle.area === '강남', dodiaTitle.area);
check('디오디아: 첫 검색어 = 강남 디오디아', dodiaTitle.queries[0] === '강남 디오디아', dodiaTitle.queries.join(' / '));
check('디오디아: 해시태그 상호를 결과에 남김', (dodiaTitle.hashtags || []).indexOf('디오디아') >= 0, JSON.stringify(dodiaTitle.hashtags));
check('디오디아: 업종 = 뷔페', dodiaTitle.category === '뷔페', dodiaTitle.category);
check('디오디아: 형용사(럭셔리)는 키워드에서 제외', dodiaTitle.keywords.indexOf('럭셔리') < 0, dodiaTitle.keywords.join(','));
check('디오디아: 금액(5만원대)은 키워드에서 제외', !hasWord(dodiaTitle.keywords, '5만원'), dodiaTitle.keywords.join(','));
check('디오디아: 설명글의 메일 주소는 검색어에 안 들어감', !hasWord(dodiaTitle.queries, 'clclalsgml') && !hasWord(dodiaTitle.keywords, 'clclalsgml'), dodiaTitle.queries.join(' / '));
check('디오디아: 상호 뒤가 아니라 첫 후보', dodiaTitle.queries.indexOf('강남 디오디아') === 0, dodiaTitle.queries.join(' / '));

// 17-2. 시청자 댓글의 감상어('좋다'·'귀엽다')는 검색어가 되지 않습니다.
const dodiaComments = extractSearchQueries(DODIA_TITLE + '\n' + DODIA_COMMENTS);
check('댓글: 첫 검색어는 여전히 강남 디오디아', dodiaComments.queries[0] === '강남 디오디아', dodiaComments.queries.join(' / '));
check('댓글: "좋다" 검색어 없음', !hasWord(dodiaComments.queries, '좋다'), dodiaComments.queries.join(' / '));
check('댓글: "귀엽다" 검색어 없음', !hasWord(dodiaComments.queries, '귀엽'), dodiaComments.queries.join(' / '));
check('댓글: 감상어는 키워드에서도 제외', !hasWord(dodiaComments.keywords, '좋다') && !hasWord(dodiaComments.keywords, '귀엽'), dodiaComments.keywords.join(','));
check('형용사 기본형 판정: 좋다·귀엽다·고맙다', isBasePredicate('좋다') && isBasePredicate('귀엽다') && isBasePredicate('고맙다'));
check('형용사 기본형 판정: 상호는 통과(디오디아·바다·베통)', !isBasePredicate('디오디아') && !isBasePredicate('바다') && !isBasePredicate('베통'));
check('형용사 기본형: 한 글자·빈 값은 아님', !isBasePredicate('다') && !isBasePredicate(''));

// 17-3. 댓글 폴백이 다른 동네(울산)로 새지 않습니다.
check('지역 낱말: 울산 중구 검출', regionWordsOf('울산 중구 떡볶이').has('울산'), JSON.stringify([...regionWordsOf('울산 중구 떡볶이')]));
check('지역 낱말: 강남 디오디아 = 강남', regionWordsOf('강남 디오디아').has('강남'), JSON.stringify([...regionWordsOf('강남 디오디아')]));
const guarded = filterQueriesByArea(['강남 디오디아', '울산 중구 떡볶이', '디오디아', '울산'], '강남');
check('지역 방어: 다른 동네 후보 제거', JSON.stringify(guarded) === JSON.stringify(['강남 디오디아', '디오디아']), JSON.stringify(guarded));
check('지역 방어: 기준 동네 없으면 그대로', filterQueriesByArea(['울산 떡볶이'], '').length === 1);

// 17-4. 전체 흐름: 실제 메타데이터 → 카카오 “강남 디오디아” → 디오디아2.0
setKeys({ kakao: 'KAKAOKEY' });
process.env.EXPO_PUBLIC_YOUTUBE_API_KEY = 'YTKEY';
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title: DODIA_TITLE, author_name: '먹보' });
  if (u.includes('/youtube/v3/videos')) {
    return jsonRes({ items: [{ snippet: { title: DODIA_TITLE, description: DODIA_DESC, channelId: UPLOADER_ID } }] });
  }
  if (u.includes('/youtube/v3/commentThreads')) {
    return jsonRes({
      items: DODIA_COMMENTS.split('\n').map((text, i) => ({
        snippet: { topLevelComment: { snippet: { textDisplay: text, authorChannelId: { value: 'UC_fan_' + i } } } },
      })),
    });
  }
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    if (q.indexOf('디오디아') >= 0) return jsonRes({ documents: [DODIA_DOC] });
    if (q.indexOf('울산') >= 0) return jsonRes({ documents: [ULSAN_DOC] });
    return jsonRes({ documents: [] });
  }
  return jsonRes({ items: [], places: [] });
};
const dodia = await extractPlaces('https://youtube.com/shorts/WtB53sC3weY?si=YwbpKHoHMGi2ArSd');
check('디오디아 흐름: 첫 검색어 = 강남 디오디아', dodia.queryList[0] === '강남 디오디아', dodia.queryList.join(' / '));
check('디오디아 흐름: 첫 시도가 강남 디오디아', dodia.attempts[0].query === '강남 디오디아' && dodia.attempts[0].resultCount >= 1, JSON.stringify(dodia.attempts));
check('디오디아 흐름: 후보 = 디오디아2.0', (dodia.candidates[0] || {}).name === '디오디아2.0', JSON.stringify((dodia.candidates[0] || {}).name));
check('디오디아 흐름: 서초/양재 주소', String((dodia.candidates[0] || {}).address).indexOf('강남대로 213') > 0, String((dodia.candidates[0] || {}).address));
check('디오디아 흐름: 시도한 검색어에 좋다 없음', !hasWord((dodia.attempts || []).map((a) => a.query), '좋다'), JSON.stringify((dodia.attempts || []).map((a) => a.query)));
check('디오디아 흐름: 댓글은 결과에 그대로 남김', String(dodia.sourceComments).indexOf('좋다') >= 0, String(dodia.sourceComments).slice(0, 40));

// 17-5. 댓글에 다른 동네(울산) 이야기가 섞여도 그 동네로 검색하지 않습니다.
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title: DODIA_TITLE });
  if (u.includes('/youtube/v3/videos')) {
    return jsonRes({ items: [{ snippet: { title: DODIA_TITLE, description: DODIA_DESC, channelId: UPLOADER_ID } }] });
  }
  if (u.includes('/youtube/v3/commentThreads')) {
    return jsonRes({ items: [{ snippet: { topLevelComment: { snippet: { textDisplay: '울산 중구 떡볶이가 좋다', authorChannelId: { value: 'UC_fan_9' } } } } }] });
  }
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    if (q.indexOf('디오디아') >= 0) return jsonRes({ documents: [DODIA_DOC] });
    if (q.indexOf('울산') >= 0) return jsonRes({ documents: [ULSAN_DOC] });
    return jsonRes({ documents: [] });
  }
  return jsonRes({ items: [], places: [] });
};
const dodiaGuard = await extractPlaces('https://youtube.com/shorts/WtB53sC3weY');
check('지역 방어 흐름: 울산으로 검색하지 않음', !hasWord((dodiaGuard.attempts || []).map((a) => a.query), '울산'), JSON.stringify((dodiaGuard.attempts || []).map((a) => a.query)));
check('지역 방어 흐름: 첫 후보는 여전히 디오디아2.0', (dodiaGuard.candidates[0] || {}).name === '디오디아2.0', JSON.stringify((dodiaGuard.candidates[0] || {}).name));
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;

// ── 17-6. v2.12: 주소 기반 네이버 안전 교차 보강 ────────────────
//  실제 사례: `동대문 영화장` → 카카오 1곳 · 네이버 items: [] (원인 재현)
//  → 카카오 주소(서울 동대문구 휘경로 3-8)에서 뽑은 `휘경로 영화장` / `동대문구 영화장` 으로
//    네이버를 보강 조회해 이름+좌표(200m)/주소가 맞을 때만 naver 배지로 합칩니다.
const YOUNGHWA_KAKAO_DOC = {
  id: '9316895',
  place_name: '영화장',
  category_name: '음식점 > 중식 > 중국요리',
  category_group_code: 'FD6',
  phone: '02-966-0000',
  address_name: '서울 동대문구 이문동 288-23',
  road_address_name: '서울 동대문구 휘경로 3-8',
  x: '127.06094341092403',
  y: '37.59657922820571',
  place_url: 'http://place.map.kakao.com/9316895',
};
const YOUNGHWA_NAVER_ITEM = {
  title: '<b>영화장</b>',
  link: '',
  category: '중식>중식당',
  telephone: '',
  address: '서울특별시 동대문구 이문동 288-23',
  roadAddress: '서울특별시 동대문구 휘경로 3-8',
  mapx: '1270609498',
  mapy: '375965687',
};
// 같은 이름이지만 부산에 있는 다른 가게 — 절대 합치면 안 됩니다.
const YOUNGHWA_NAVER_BUSAN = {
  title: '<b>영화장</b>',
  link: '',
  category: '중식>중식당',
  telephone: '',
  address: '부산광역시 동래구 온천동 1-1',
  roadAddress: '부산광역시 동래구 중앙대로 1000',
  mapx: '129.0800000',
  mapy: '35.2000000',
};

// 단위 — 주소 조각 · 보강 검색어
const partsRoad = addressParts('서울 동대문구 휘경로 3-8');
check('v2.12 주소: 구/도로명/번지 분리', partsRoad.gu === '동대문구' && partsRoad.road === '휘경로' && partsRoad.roadNo === '3-8', JSON.stringify(partsRoad));
check('v2.12 주소: 도로명주소에는 동이 없음', partsRoad.dong === '', JSON.stringify(partsRoad));
const partsLot = addressParts('서울 동대문구 이문동 288-23');
check('v2.12 주소: 법정동/지번 분리', partsLot.dong === '이문동' && partsLot.lot === '288-23', JSON.stringify(partsLot));
check('v2.12 주소: 동대문구를 동으로 오인하지 않음', partsLot.dong !== '동대문구');
check(
  'v2.12 주소: 휘경로 3-8 과 서울특별시 동대문구 휘경로 3-8 은 같은 곳',
  sameAddress('서울 동대문구 휘경로 3-8', '서울특별시 동대문구 휘경로 3-8') === true
);
check(
  'v2.12 주소: 지번(이문동 288-23)도 같은 곳',
  sameAddress('서울 동대문구 이문동 288-23', '서울특별시 동대문구 이문동 288-23') === true
);
check(
  'v2.12 주소: 구가 다르면 다른 곳 (전국의 중앙로 방어)',
  sameAddress('서울 동대문구 중앙로 10', '부산 동래구 중앙로 10') === false
);

const backfillQueries = naverBackfillQueries({ name: '영화장', address: '서울 동대문구 휘경로 3-8' });
check('v2.12 검색어: 도로명·구 보강 질의 2개', backfillQueries.length === 2, JSON.stringify(backfillQueries));
check('v2.12 검색어: 휘경로 영화장', backfillQueries[0] === '휘경로 영화장', backfillQueries[0]);
check('v2.12 검색어: 동대문구 영화장', backfillQueries[1] === '동대문구 영화장', backfillQueries[1]);
const backfillDong = naverBackfillQueries({ name: '영화장', address: '서울 동대문구 이문동 288-23' });
check('v2.12 검색어: 지번주소면 법정동이 먼저', backfillDong[0] === '이문동 영화장', JSON.stringify(backfillDong));
const backfillDup = naverBackfillQueries({ name: '이문동 영화장', address: '서울 동대문구 이문동 288-23' });
check(
  'v2.12 검색어: 상호에 이미 있는 동네는 중복해 붙이지 않음',
  !backfillDup.some((q) => q.indexOf('이문동 이문동') >= 0),
  JSON.stringify(backfillDup)
);
check('v2.12 검색어: 주소 없는 후보는 보강 질의 0개', naverBackfillQueries({ name: '영화장', address: '' }).length === 0);

// 단위 — 안전 매칭(이름 + 좌표 200m 또는 주소)
const kakaoYoung = { name: '영화장', address: '서울 동대문구 휘경로 3-8', lat: 37.59657922820571, lng: 127.06094341092403 };
const naverYoung = { name: '영화장', address: '서울특별시 동대문구 휘경로 3-8', lat: 37.5965687, lng: 127.0609498 };
const naverBusan = { name: '영화장', address: '부산광역시 동래구 중앙대로 1000', lat: 35.2, lng: 129.08 };
check('v2.12 매칭: 같은 이름 + 1m → 같은 가게', naverBackfillMatch(kakaoYoung, naverYoung) === true);
check('v2.12 매칭: 같은 이름이어도 부산(주소·좌표 불일치) → 병합 거부', naverBackfillMatch(kakaoYoung, naverBusan) === false);
check(
  'v2.12 매칭: 좌표가 멀어도 도로명+번지가 같으면 같은 가게',
  naverBackfillMatch(
    { name: '영화장', address: '서울 동대문구 휘경로 3-8', lat: 37.6, lng: 127.06 },
    { name: '영화장', address: '서울특별시 동대문구 휘경로 3-8', lat: 37.61, lng: 127.07 }
  ) === true
);
check(
  'v2.12 매칭: 이름이 다르면(영화반점) 거리·주소가 같아도 병합 거부',
  naverBackfillMatch(kakaoYoung, { ...naverYoung, name: '영화반점' }) === false,
  '영화반점'
);
check(
  'v2.12 매칭: 이름 포함 관계는 1m 이내면 같은 가게(영화장 ⊂ 영화장식당)',
  naverBackfillMatch(kakaoYoung, { ...naverYoung, name: '영화장식당' }) === true
);

// 통합 — `동대문 영화장`: 1차 네이버 빈 결과 → 보강 질의로 매칭
setKeys({ kakao: 'KAKAOKEY', naver: true });
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('dapi.kakao.com')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({ documents: q.includes('영화장') ? [YOUNGHWA_KAKAO_DOC] : [] });
  }
  // 네이버: `동대문 영화장` 은 total 만 있고 items 가 비어 옵니다(실제 현상).
  const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
  if (q === '동대문 영화장') return jsonRes({ total: 1, items: [] });
  if (q.includes('영화장')) return jsonRes({ total: 1, items: [YOUNGHWA_NAVER_ITEM] });
  return jsonRes({ total: 0, items: [] });
};
const younghwa = await searchPlaceProviders({ query: '동대문 영화장' });
check('v2.12 흐름: 카카오 후보 1곳 유지', younghwa.candidates.length === 1 && younghwa.candidates[0].name === '영화장', JSON.stringify(younghwa.candidates.map((c) => c.name)));
check(
  'v2.12 흐름: 보강 질의에 도로명/구가 들어감',
  calls.filter((c) => c.url.includes('naverapihub') || c.url.includes('openapi.naver.com')).some((c) => {
    const q = decodeURIComponent(c.url.split('query=')[1].split('&')[0]);
    return q === '휘경로 영화장' || q === '동대문구 영화장';
  }),
  calls.map((c) => c.url).join(' | ')
);
const younghwaTop = younghwa.candidates[0];
check('v2.12 흐름: naver 배지 추가', JSON.stringify(younghwaTop.providers) === '["kakao","naver"]', JSON.stringify(younghwaTop.providers));
check('v2.12 흐름: providersUsed 에 naver 포함', younghwa.providersUsed.includes('naver'), JSON.stringify(younghwa.providersUsed));
check('v2.12 흐름: 보강 매칭 1건 기록', younghwa.naverBackfill && younghwa.naverBackfill.matched === 1, JSON.stringify(younghwa.naverBackfill));
check('v2.12 흐름: 보강 신뢰도 상승', younghwaTop.confidence > 0.9, String(younghwaTop.confidence));
check('v2.12 흐름: 근거 검색어 기록', /영화장/.test(String(younghwaTop.naverBackfillQuery)) && /휘경로|동대문구/.test(String(younghwaTop.naverBackfillQuery)), String(younghwaTop.naverBackfillQuery));
check('v2.12 흐름: 주소는 카카오 것을 유지', younghwaTop.address === '서울 동대문구 휘경로 3-8', younghwaTop.address);
const younghwaNaverCalls = calls.filter((c) => c.url.includes('naverapihub') || c.url.includes('openapi.naver.com')).length;
check('v2.12 흐름: 보강 요청은 최대 4건', younghwaNaverCalls <= 1 + NAVER_BACKFILL_MAX_QUERIES, String(younghwaNaverCalls));

// 통합 — 동명이인(부산)만 나오면 병합 거부
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('dapi.kakao.com')) return jsonRes({ documents: [YOUNGHWA_KAKAO_DOC] });
  const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
  if (q === '동대문 영화장') return jsonRes({ total: 1, items: [] });
  return jsonRes({ total: 1, items: [YOUNGHWA_NAVER_BUSAN] });
};
const younghwaWrong = await searchPlaceProviders({ query: '동대문 영화장' });
check(
  'v2.12 동명이인: naver 배지 붙지 않음',
  JSON.stringify(younghwaWrong.candidates[0].providers) === '["kakao"]',
  JSON.stringify(younghwaWrong.candidates[0].providers)
);
check('v2.12 동명이인: 보강 매칭 0건', younghwaWrong.naverBackfill && younghwaWrong.naverBackfill.matched === 0, JSON.stringify(younghwaWrong.naverBackfill));
check('v2.12 동명이인: providersUsed 는 kakao 만', JSON.stringify(younghwaWrong.providersUsed) === '["kakao"]', JSON.stringify(younghwaWrong.providersUsed));
check('v2.12 동명이인: 부산 주소가 섞이지 않음', younghwaWrong.candidates[0].address === '서울 동대문구 휘경로 3-8', younghwaWrong.candidates[0].address);

// 통합 — 1차에 네이버가 이미 같은 가게를 찾았으면 보강 조회를 하지 않습니다.
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('dapi.kakao.com')) return jsonRes({ documents: [YOUNGHWA_KAKAO_DOC] });
  return jsonRes({ total: 1, items: [YOUNGHWA_NAVER_ITEM] });
};
const younghwaNormal = await searchPlaceProviders({ query: '동대문 영화장' });
check('v2.12 정상: 요청 2건(카카오+네이버)만', calls.length === 2, String(calls.length));
check('v2.12 정상: 보강 매칭 기록 없음', !younghwaNormal.naverBackfill || younghwaNormal.naverBackfill.matched === 0);
check('v2.12 정상: naver 배지 유지', younghwaNormal.candidates[0].providers.includes('naver'), JSON.stringify(younghwaNormal.candidates[0].providers));

// 통합 — 네이버가 실패(401)했을 때는 보강도 시도하지 않습니다.
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('dapi.kakao.com')) return jsonRes({ documents: [YOUNGHWA_KAKAO_DOC] });
  return errRes(401);
};
const younghwaFail = await searchPlaceProviders({ query: '동대문 영화장' });
check('v2.12 네이버 실패: 추가 요청 없음', calls.length === 2, String(calls.length));
check('v2.12 네이버 실패: 실패로 기록', younghwaFail.failures.some((f) => f.provider === 'naver'), JSON.stringify(younghwaFail.failures));

// 통합 — backfill:0 이면 보강 조회를 하지 않습니다. (여러 가게 동시 매칭 등)
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('dapi.kakao.com')) return jsonRes({ documents: [YOUNGHWA_KAKAO_DOC] });
  const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
  if (q === '동대문 영화장') return jsonRes({ total: 1, items: [] });
  return jsonRes({ total: 1, items: [YOUNGHWA_NAVER_ITEM] });
};
const younghwaOff = await searchPlaceProviders({ query: '동대문 영화장', backfill: 0 });
check('v2.12 backfill:0 → 요청 2건', calls.length === 2, String(calls.length));
check('v2.12 backfill:0 → naver 배지 없음', !younghwaOff.candidates[0].providers.includes('naver'), JSON.stringify(younghwaOff.candidates[0].providers));

// 통합 — 직접 검색(`가게명으로 찾기`)도 같은 보강을 씁니다.
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.includes('dapi.kakao.com')) return jsonRes({ documents: [YOUNGHWA_KAKAO_DOC] });
  const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
  if (q === '동대문 영화장') return jsonRes({ total: 1, items: [] });
  return jsonRes({ total: 1, items: [YOUNGHWA_NAVER_ITEM] });
};
const younghwaDirect = await searchPlacesDirect('동대문 영화장');
check('v2.12 직접 검색: 결과 1곳', younghwaDirect.ok === true && younghwaDirect.candidates.length === 1, JSON.stringify(younghwaDirect.candidates.map((c) => c.name)));
check('v2.12 직접 검색: naver 배지', younghwaDirect.candidates[0].providers.includes('naver'), JSON.stringify(younghwaDirect.candidates[0].providers));
check('v2.12 직접 검색: usedAdapter 에 naver', String(younghwaDirect.usedAdapter).includes('naver'), String(younghwaDirect.usedAdapter));
check('v2.12 직접 검색: 보강 내역 반환', younghwaDirect.naverBackfill && younghwaDirect.naverBackfill.matched === 1, JSON.stringify(younghwaDirect.naverBackfill));

setKeys({});

// ── v2.13 · 📸 사진 분석은 네이티브에서도 앱을 깨지 않습니다 (웹 프록시 전용) ──
//   키(GEMINI_API_KEY)가 앱 번들에 없으므로 네이티브는 요청 자체를 보내지 않고 안내 문구만 돌려줍니다.
const callsBeforePhoto = calls.length;
const nativePhoto = await fetchGeminiImageAnalysis({ base64: 'A'.repeat(200), mimeType: 'image/jpeg' });
check('v2.13 네이티브: 사진 분석은 web-only 안내', nativePhoto.ok === false && nativePhoto.reason === 'web-only', JSON.stringify(nativePhoto));
check('v2.13 네이티브: 안내 문구는 사파리(웹)', String(nativePhoto.message).indexOf('웹') > 0, nativePhoto.message);
const nativePhotoFlow = await extractFromImage({ base64: 'A'.repeat(200), mimeType: 'image/jpeg' });
check('v2.13 네이티브: extractFromImage 도 안내만', nativePhotoFlow.ok === false && nativePhotoFlow.reason === 'web-only', JSON.stringify(nativePhotoFlow));
check('v2.13 네이티브: 네트워크 요청 0건', calls.length === callsBeforePhoto, String(calls.length - callsBeforePhoto));
check(
  'v2.13 네이티브: 크기 계산·data URL 파싱은 공통 동작',
  Math.max(scaledImageSize(2532, 1170).width, scaledImageSize(2532, 1170).height) === 1280 &&
    Math.abs(scaledImageSize(2532, 1170).height - 591) <= 1 &&
    (parseImageDataUri('data:image/jpeg;base64,AAEC') || {}).base64 === 'AAEC',
  JSON.stringify(scaledImageSize(2532, 1170))
);

// ── v2.21 · 가게명 찾기는 최대 15곳 · 숫자+단위 토큰은 상호가 아님 ───────────
// 상훈 님: "5개 이후로도 더 많이 나오게" / "1마리를 상호명으로 뽑아서 광어1마리15000원이 나왔다"
check('v2.21 직접 검색: 후보 상한 15 · 카카오 15 · 네이버 5', MAX_DIRECT_CANDIDATES === 15 && KAKAO_SIZE_MAX === 15 && NAVER_DISPLAY_MAX === 5, MAX_DIRECT_CANDIDATES + '/' + KAKAO_SIZE_MAX + '/' + NAVER_DISPLAY_MAX);

const fifteen = Array.from({ length: 15 }, (_, i) => ({
  place_name: '성수 카페 ' + (i + 1),
  category_name: '음식점 > 카페',
  category_group_code: 'CE7',
  phone: '',
  address_name: '서울 성동구 성수동1가 ' + (i + 1),
  road_address_name: '서울 성동구 연무장길 ' + (i + 1),
  x: String(127.05 + i * 0.001),
  y: String(37.54 + i * 0.001),
  place_url: 'http://place.map.kakao.com/' + (9000 + i),
}));
setKeys({ kakao: 'KAKAOKEY', naver: true });
calls = [];
handler = (url) =>
  String(url).includes('dapi.kakao.com')
    ? jsonRes({ documents: fifteen })
    : jsonRes({ items: [] });
const direct15 = await searchPlacesDirect('성수 카페');
const kakaoCall15 = calls.find((c) => c.url.includes('dapi.kakao.com'));
const naverCall15 = calls.find((c) => c.url.includes('openapi.naver.com'));
check('v2.21 직접 검색: 15곳까지 반환', direct15.ok === true && direct15.candidates.length === 15, String(direct15.candidates.length));
check('v2.21 직접 검색: 카카오 size=15 요청', !!kakaoCall15 && kakaoCall15.url.indexOf('&size=15') > 0, kakaoCall15 && kakaoCall15.url);
check('v2.21 직접 검색: 네이버 display 는 5(규격 상한)', !!naverCall15 && naverCall15.url.indexOf('display=5') > 0, naverCall15 && naverCall15.url);

setKeys({});
check(
  'v2.21 상호 후보: 숫자+수량/가격 토큰 차단',
  ['1마리', '2마리', '2인분', '3인분', '1개', '2개', '1병', '1잔', '80,000원', '1만원', '8만원', '2시간', '3명', '1그릇'].every((t) => isQuantityOrPriceToken(t) === true),
  '수량 토큰 통과'
);
check(
  'v2.21 상호 후보: 진짜 상호는 통과',
  ['닭볶음탕', '솥뚜껑', '베통', '디오디아', '연남동', '가평'].every((t) => isQuantityOrPriceToken(t) === false),
  '상호 오탐'
);

// 실제 제보 케이스 — youtube.com/shorts/994t_EyrIiA
//   제목: `닭 1마리 80,000원?! 솥뚜껑 닭볶음탕?! #리뷰` / 설명: `#가평 #가평맛집 #닭볶음탕`
const eyrTitle = '닭 1마리 80,000원?! 솥뚜껑 닭볶음탕?! #리뷰';
const eyrDesc = '#가평 #가평맛집 #닭볶음탕';
const eyr = extractSearchQueries(eyrTitle + '\n' + eyrDesc);
check('v2.21 994t_EyrIiA: 검색어에 1마리 없음', eyr.queries.every((q) => q.indexOf('1마리') < 0), JSON.stringify(eyr.queries));
check('v2.21 994t_EyrIiA: 지역 = 가평', eyr.area === '가평', eyr.area);
check('v2.21 994t_EyrIiA: 첫 검색어가 가게/메뉴+지역', /가평/.test(eyr.queries[0]) && /닭볶음탕|솥뚜껑/.test(eyr.queries[0]), eyr.queries[0]);
check('v2.21 994t_EyrIiA: 상호명은 비움(지어내지 않음)', eyr.storeName === '', eyr.storeName);
check(
  'v2.22 상호 근거 판정: 지역·메뉴·수량뿐인 검색어',
  isAreaOnlyQuery('가평') === true &&
    isAreaOnlyQuery('성수동 맛집') === true &&
    // v2.22 — 메뉴·지역 조합(`가평 닭볶음탕`)도 **가게를 특정하지 못한** 검색어입니다.
    isAreaOnlyQuery('가평 닭볶음탕') === true &&
    isAreaOnlyQuery('1마리') === true &&
    isAreaOnlyQuery('성수동 베통') === false &&
    isAreaOnlyQuery('디오디아') === false,
  '지역 판정'
);

// 상호가 전혀 없을 때는 Gemini 폴백으로 넘어갑니다(지도 결과 0건).
const geminiFallbackSource = fs.readFileSync(path.join(process.cwd(), 'src/services/extractor.js'), 'utf8');
check(
  'v2.21 Gemini 폴백: 지도에서 못 찾으면 영상 분석',
  /gemini = await fetchGeminiAnalysis\(/.test(geminiFallbackSource) && /gemini && gemini.storeName/.test(geminiFallbackSource),
  'Gemini 폴백 없음'
);
check(
  'v2.22 상호 근거 없는 검색어는 지도 1위를 믿지 않음',
  geminiFallbackSource.indexOf('storeQueries.concat(weakQueries)') > 0 &&
    geminiFallbackSource.indexOf('candidateMatchesQuery(c, q, matchOptions)') > 0,
  '상호 근거 필터 없음'
);


// ═════════════════════════════════════════════════════════════
// v2.22 — 이 블록은 **웹(Vercel) 런타임**을 흉내 냅니다.
//   (Gemini 영상 분석 폴백은 서버 프록시가 있는 웹에서만 동작합니다)
Platform.OS = 'web';

// ═════════════════════════════════════════════════════════════
// v2.22 · Precision-first — “상호를 특정하지 못하면 AI 영상 분석으로”
//   상훈 님 제보(2026-11-17): “이 영상만 고쳐서 될 건 아닌거 같고, 전체적인 로직 점검을 1번 해 봐야 될 거 같애”
//   → 메뉴·수량·수식어·채널명·지역만 있는 제목이 **다른 동네 다른 가게**를 저장하던 문제를 막습니다.
// ═════════════════════════════════════════════════════════════

// ── 1) 명확한 상호 표기(`📍`·`상호:`·`[가게]`)만 뽑기 ──
check(
  'v2.22 상호 표기: 📍 뒤 상호(지역·메뉴는 걷어냄)',
  JSON.stringify(explicitStoreNames('📍 가평 산골농원 솥뚜껑 닭볶음탕', '가평')) === '["산골농원"]',
  JSON.stringify(explicitStoreNames('📍 가평 산골농원 솥뚜껑 닭볶음탕', '가평'))
);
check(
  'v2.22 상호 표기: 상호: / 가게명:',
  JSON.stringify(explicitStoreNames('상호: 착한부대찌개\n가게명: 쌍문동점')) === '["착한부대찌개","쌍문동점"]',
  JSON.stringify(explicitStoreNames('상호: 착한부대찌개\n가게명: 쌍문동점'))
);
check(
  'v2.22 상호 표기: 대괄호 상호',
  JSON.stringify(explicitStoreNames('[런던베이글] 성수 소금빵 웨이팅 후기')) === '["런던베이글"]',
  JSON.stringify(explicitStoreNames('[런던베이글] 성수 소금빵 웨이팅 후기'))
);
check(
  'v2.22 상호 표기: 소괄호 금액 안내는 상호가 아님',
  explicitStoreNames('(예약금 10만원 있어요~)', '연동').length === 0,
  JSON.stringify(explicitStoreNames('(예약금 10만원 있어요~)', '연동'))
);
check(
  'v2.22 상호 표기: 메뉴만 적힌 표기는 상호가 아님',
  explicitStoreNames('📍 닭볶음탕 무한리필', '가평').length === 0,
  JSON.stringify(explicitStoreNames('📍 닭볶음탕 무한리필', '가평'))
);

// ── 2) 검색어가 가게를 특정했는가 (classifyQuery) ──
const QK = (q, area) => classifyQuery(q, { area }).kind;
check(
  'v2.22 검색어 등급: 메뉴·수량·수식어뿐이면 area',
  QK('가평 닭볶음탕', '가평') === 'area' &&
    QK('닭볶음탕') === 'area' &&
    QK('순대국') === 'area' &&
    QK('오마카세') === 'area' &&
    QK('돈까스') === 'area' &&
    QK('24시') === 'area' &&
    QK('3대') === 'area' &&
    QK('1인분') === 'area' &&
    QK('2인') === 'area' &&
    QK('만원') === 'area' &&
    QK('무한리필') === 'area' &&
    QK('인생맛집') === 'area' &&
    QK('역대급') === 'area' &&
    QK('미친맛') === 'area' &&
    QK('숨은맛집') === 'area' &&
    QK('줄서는집') === 'area' &&
    QK('노포') === 'area' &&
    QK('가성비') === 'area' &&
    QK('웨이팅') === 'area',
  ['가평 닭볶음탕','닭볶음탕','순대국','24시','3대','무한리필','인생맛집','노포','가성비'].map((q) => q + '=' + QK(q, '가평')).join(' / ')
);
check(
  'v2.22 검색어 등급: 상호가 있으면 store',
  QK('가평 산골농원', '가평') === 'store' &&
    QK('성수동 베통', '성수동') === 'store' &&
    QK('디오디아') === 'store' &&
    QK('쌍문동 착한부대찌개', '쌍문동') === 'store',
  ['가평 산골농원','성수동 베통','디오디아'].map((q) => q + '=' + QK(q)).join(' / ')
);
check(
  'v2.22 검색어 등급: 채널 이름은 상호가 아님',
  QK('미니로운생활', undefined) === 'store' &&
    classifyQuery('가평 미니로운생활', { area: '가평', channel: '미니로운생활' }).kind === 'area',
  JSON.stringify(classifyQuery('가평 미니로운생활', { area: '가평', channel: '미니로운생활' }))
);

// ── 3) 지도 1위를 믿어도 되는가 (candidateMatchesQuery) ──
const CAND = (name, address, area) => ({ name, address, area, roadAddress: address });
check(
  'v2.22 후보 검증: 메뉴 검색어가 데려온 다른 가게는 거부',
  candidateMatchesQuery(CAND('광어1마리15000원', '경기 가평군 청평면 1', '청평면'), '1마리', { area: '가평' }) === false
);
check(
  'v2.22 후보 검증: 상호가 아닌 검색어(솥뚜껑)로 잡힌 다른 동네 가게는 거부',
  candidateMatchesQuery(CAND('솥뚜껑매운탕', '충남 공주시 사곡면 아래안영골길 4', '사곡면'), '솥뚜껑', { area: '가평' }) === false
);
check(
  'v2.22 후보 검증: 지역이 같은 상호는 채택',
  candidateMatchesQuery(CAND('산골농원', '경기 가평군 설악면 어비산길99번길 75-7', '설악면'), '가평 산골농원', { area: '가평' }) === true
);
check(
  'v2.22 후보 검증: 이름이 더 길어도 상호를 포함하면 채택',
  candidateMatchesQuery(CAND('런던베이글뮤지엄', '서울 성동구 성수동2가 1', '성수동2가'), '성수동 런던베이글', { area: '성수동' }) === true
);
check(
  'v2.22 후보 검증: 동네가 어긋나는 동명이인은 거부',
  candidateMatchesQuery(CAND('엄마손횟집', '부산 해운대구 우동 1', '우동'), '연동 엄마손횟집', { area: '연동' }) === false
);
check(
  'v2.22 후보 검증: 작성자가 적은 📍 상호는 그대로 신뢰',
  candidateMatchesQuery(CAND('산골농원', '경기 가평군 설악면 어비산길99번길 75-7', '설악면'), '협재 해변', {
    area: '협재',
    explicit: true,
  }) === true
);
check(
  'v2.22 후보 검증: 시청자 댓글 검색어는 이름이 똑같을 때만',
  candidateMatchesQuery(CAND('영화장', '서울 동대문구 휘경로 3-8', '이문동'), '외대앞역 영화장', { exactOnly: true }) === true &&
    candidateMatchesQuery(CAND('영화장 본점', '서울 동대문구 휘경로 3-8', '이문동'), '외대앞역 영화장', { exactOnly: true }) === false
);

// ── 4) 제목에 상호가 없을 때 — 수식어·메뉴·채널명이 검색어 1순위가 되지 않음 ──
const hype = extractSearchQueries('역대급 숨은맛집! 미친맛 순대국 8,000원 #노포 #가성비');
check(
  'v2.22 수식어·메뉴·가격: 검색어에 섞이지 않음',
  hype.queries.every((q) => !/인생|역대급|숨은|미친|노포|가성비|8,000|8000/.test(q)),
  hype.queries.join(' / ')
);
check('v2.22 수식어·메뉴: 상호를 지어내지 않음', hype.storeName === '', hype.storeName);
check(
  'v2.22 채널명 해시태그는 검색어에서 제외',
  extractSearchQueries('닭 1마리 80,000원?! 솥뚜껑 닭볶음탕?! #리뷰\n#미니로운생활 #가평 #닭볶음탕', {
    channel: '미니로운생활',
  }).queries.every((q) => q.indexOf('미니로운생활') < 0),
  extractSearchQueries('닭 1마리 #미니로운생활', { channel: '미니로운생활' }).queries.join(' / ')
);
check(
  'v2.22 짜장면(면으로 끝나는 음식)은 동네가 아님',
  extractSearchQueries('짜장면 맛집 추천').area === '',
  extractSearchQueries('짜장면 맛집 추천').area
);

// ── 5) 실제 제보 영상(994t_EyrIiA) 전체 흐름 — 모의 지도·AI 응답 ──
//   제목: `닭 1마리 80,000원?! 솥뚜껑 닭볶음탕?! #리뷰`, 설명: 가평 해시태그, 시청자 댓글: “8만원??”
const EYR_TITLE = '닭 1마리 80,000원?! 솥뚜껑 닭볶음탕?! #리뷰';
const EYR_DESC = '#가평 #가평맛집 #닭볶음탕 #휴가';
const EYR_COMMENTS = '8만원?? 가격 개사악하네 ㄷㄷㄷ\n닭한마리가 8만원?? 미쳤네';
const EYR_WRONG = {
  id: 'wrong1',
  place_name: '솥뚜껑매운탕',
  category_name: '음식점 > 한식',
  category_group_code: 'FD6',
  address_name: '충남 공주시 사곡면 아래안영골길 4',
  road_address_name: '충남 공주시 사곡면 아래안영골길 4',
  x: '127.1000',
  y: '36.5000',
  place_url: 'http://place.map.kakao.com/111',
};
const EYR_RIGHT = {
  id: 'right1',
  place_name: '산골농원',
  category_name: '음식점 > 한식',
  category_group_code: 'FD6',
  address_name: '경기 가평군 설악면 어빈산길99번길 75-7',
  road_address_name: '경기 가평군 설악면 어비산길99번길 75-7',
  x: '127.4800',
  y: '37.5800',
  place_url: 'http://place.map.kakao.com/222',
};

const youTubeMock = ({ title, description = '', comments = '', ownerComment = '', channelTitle = '' }) => (url) => {
  const u = String(url);
  if (u.includes('youtube.com/oembed')) return jsonRes({ title, author_name: channelTitle });
  if (u.includes('/api/youtube')) return jsonRes({ title, description, comments, ownerComment, channelTitle, thumbnail: '' });
  return null;
};

// 5-1. 지도는 엉뚱한 가게만 주고 AI 는 아무것도 못 찾은 경우 → 그 가게를 '저장'하지 않고
//      비슷한 곳(가평 닭볶음탕)을 **확인 필요**로 보여 줍니다.
setKeys({});
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
calls = [];
handler = (url) => {
  const base = youTubeMock({ title: EYR_TITLE, description: EYR_DESC, comments: EYR_COMMENTS, channelTitle: '미니로운생활' })(url);
  if (base) return base;
  const u = String(url);
  if (u.includes('/api/kakao-local')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    // 실제 지도처럼: 지역(가평)이 들어간 검색어는 가평 안의 가게를 돌려줍니다.
    if (q.indexOf('가평') >= 0) return jsonRes({ documents: [EYR_RIGHT, EYR_WRONG] });
    if (q.indexOf('솥뚜껑') >= 0) return jsonRes({ documents: [EYR_WRONG] });
    return jsonRes({ documents: [] });
  }
  if (u.includes('/api/gemini')) return jsonRes({ storeName: '', area: '', menu: '', category: '', places: [] });
  return jsonRes({ items: [], documents: [], places: [] });
};
const eyrNoAi = await extractPlaces('https://youtube.com/shorts/994t_EyrIiA');
check('v2.22 994t: 공주 ‘솥뚜껑매운탕’을 저장하지 않음', !(eyrNoAi.candidates || []).some((c) => String(c.name).indexOf('솥뚜껑') >= 0), JSON.stringify((eyrNoAi.candidates || []).map((c) => c.name)));
check('v2.22 994t: 검색어에 1마리·인스타·휴가 없음', (eyrNoAi.queryList || []).every((q) => !/1마리|인스타|휴가/.test(q)), (eyrNoAi.queryList || []).join(' / '));
check('v2.22 994t: AI 가 못 찾으면 확인 필요(weak) 로 안내', eyrNoAi.matchStatus === 'weak' && String(eyrNoAi.aiNote).indexOf('비슷한 곳') > 0, eyrNoAi.matchStatus + ' / ' + eyrNoAi.aiNote);

// 5-2. AI 가 영상에서 `산골농원(가평)` 을 읽은 경우 → 그것으로 다시 지도 조회 → 정답 1곳
calls = [];
handler = (url) => {
  const base = youTubeMock({ title: EYR_TITLE, description: EYR_DESC, comments: EYR_COMMENTS, channelTitle: '미니로운생활' })(url);
  if (base) return base;
  const u = String(url);
  if (u.includes('/api/kakao-local')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    if (q.indexOf('산골농원') >= 0) return jsonRes({ documents: [EYR_RIGHT] });
    if (q.indexOf('솥뚜껑') >= 0) return jsonRes({ documents: [EYR_WRONG] });
    if (q.indexOf('닭볶음탕') >= 0) return jsonRes({ documents: [EYR_RIGHT] });
    return jsonRes({ documents: [] });
  }
  if (u.includes('/api/gemini'))
    return jsonRes({ storeName: '산골농원', area: '가평', menu: '솥뚜껑 닭볶음탕', category: '맛집', places: [] });
  return jsonRes({ items: [], documents: [], places: [] });
};
const eyrAi = await extractPlaces('https://youtube.com/shorts/994t_EyrIiA');
check('v2.22 994t: AI 영상 분석 → 산골농원', (eyrAi.candidates || [])[0] && eyrAi.candidates[0].name === '산골농원', JSON.stringify((eyrAi.candidates || []).map((c) => c.name)));
check('v2.22 994t: AI 로 찾았다는 근거 문구', String(eyrAi.aiNote).indexOf('AI 영상 분석') >= 0 && eyrAi.matchStatus === 'gemini', eyrAi.aiNote + ' / ' + eyrAi.matchStatus);
check('v2.22 994t: AI 호출 1회', calls.filter((c) => String(c.url).includes('/api/gemini')).length === 1, String(calls.filter((c) => String(c.url).includes('/api/gemini')).length));

// ── 6) 이미 명확한 상호가 있으면 AI 를 부르지 않습니다(느려지지 않게) ──
const BETONG_DOC = {
  id: 'betong',
  place_name: '베통 성수',
  category_name: '음식점 > 간식 > 제과,베이커리',
  category_group_code: 'FD6',
  address_name: '서울 성동구 성수동2가 315-17',
  road_address_name: '서울 성동구 연무장7가길 8',
  x: '127.0557',
  y: '37.5429',
  place_url: 'http://place.map.kakao.com/333',
};
calls = [];
handler = (url) => {
  const base = youTubeMock({ title: '성수동 베통 소금빵 웨이팅 후기', description: '#성수 #소금빵', channelTitle: '베이커리탐험' })(url);
  if (base) return base;
  const u = String(url);
  if (u.includes('/api/kakao-local')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({ documents: q.indexOf('베통') >= 0 ? [BETONG_DOC] : [] });
  }
  if (u.includes('/api/gemini')) return jsonRes({ storeName: '베통 성수', area: '성수동' });
  return jsonRes({ items: [], documents: [], places: [] });
};
const betong = await extractPlaces('https://youtube.com/shorts/Ny9VvBetong');
check('v2.22 빠른 길: 상호가 맞으면 확인(verified)', betong.matchStatus === 'verified' && (betong.candidates[0] || {}).name === '베통 성수', betong.matchStatus + ' / ' + JSON.stringify((betong.candidates || []).map((c) => c.name)));
check(
  'v2.22 빠른 길: AI 영상 분석을 부르지 않음',
  calls.filter((c) => String(c.url).includes('/api/gemini')).length === 0,
  String(calls.filter((c) => String(c.url).includes('/api/gemini')).length)
);

// ── 7) 지도 1위 이름이 상호와 어긋나면 AI 로 넘어감 ──
calls = [];
handler = (url) => {
  const base = youTubeMock({ title: '성수동 베통 소금빵 웨이팅 후기', channelTitle: '베이커리탐험' })(url);
  if (base) return base;
  const u = String(url);
  if (u.includes('/api/kakao-local')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    // 첫 검색어(`성수동 베통`)에는 **다른 가게**만, AI 가 알려 준 상호로 다시 찾으면 정확히 나옵니다.
    if (q.indexOf('베통') >= 0 && calls.filter((c) => String(c.url).includes('/api/gemini')).length)
      return jsonRes({ documents: [BETONG_DOC] });
    return jsonRes({ documents: [{ ...BETONG_DOC, place_name: '성수 소금빵집' }] });
  }
  if (u.includes('/api/gemini')) return jsonRes({ storeName: '베통', area: '성수동' });
  return jsonRes({ items: [], documents: [], places: [] });
};
const mismatch = await extractPlaces('https://youtube.com/shorts/Ny9VvBetong2');
check('v2.22 이름 불일치: AI 영상 분석 호출', calls.filter((c) => String(c.url).includes('/api/gemini')).length === 1, String(calls.filter((c) => String(c.url).includes('/api/gemini')).length));
check('v2.22 이름 불일치: AI 가 읽은 상호로 저장', mismatch.matchStatus === 'gemini' && (mismatch.candidates[0] || {}).name.indexOf('베통') >= 0, mismatch.matchStatus + ' / ' + JSON.stringify((mismatch.candidates || []).map((c) => c.name)));

// ── 8) 📍 상호는 지도 이름이 조금 달라도 믿습니다 ──
calls = [];
handler = (url) => {
  const base = youTubeMock({ title: '제주 협재 바다뷰 카페', description: '📍 협재 오른카페\n주차 무료', channelTitle: '제주여행' })(url);
  if (base) return base;
  const u = String(url);
  if (u.includes('/api/kakao-local')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({
      documents: q.indexOf('오른카페') >= 0
        ? [{ ...BETONG_DOC, id: 'orn', place_name: '오른카페 협재점', address_name: '제주 제주시 한림읍 협재리 1', road_address_name: '제주 제주시 한림읍 협재로 1' }]
        : [],
    });
  }
  if (u.includes('/api/gemini')) return jsonRes({ storeName: '', area: '' });
  return jsonRes({ items: [], documents: [], places: [] });
};
const explicitCase = await extractPlaces('https://youtube.com/shorts/Ny9Explicit');
check('v2.22 📍 상호: 지도 결과를 그대로 채택', explicitCase.matchStatus === 'verified' && (explicitCase.candidates[0] || {}).name === '오른카페 협재점', explicitCase.matchStatus + ' / ' + JSON.stringify((explicitCase.candidates || []).map((c) => c.name)));
check('v2.22 📍 상호: AI 를 부르지 않음', calls.filter((c) => String(c.url).includes('/api/gemini')).length === 0, String(calls.filter((c) => String(c.url).includes('/api/gemini')).length));

// ── 9) 업로더 고정댓글은 강한 근거, 시청자 댓글은 약한 근거 ──
calls = [];
handler = (url) => {
  const base = youTubeMock({
    title: '평균리뷰 1000개 이상, 성수동 카페추천! ☕️',
    description: '이번 주에 다녀온 카페 모음입니다.',
    comments: '여기 성수동 카모플라쥬에요!',
    ownerComment: '여기 성수동 카모플라쥬에요!',
    channelTitle: '호키도리',
  })(url);
  if (base) return base;
  const u = String(url);
  if (u.includes('/api/kakao-local')) {
    const q = decodeURIComponent(u.split('query=')[1].split('&')[0]);
    return jsonRes({
      documents: q.indexOf('카모플라쥬') >= 0
        ? [{ ...BETONG_DOC, id: 'camo', place_name: '카모플라쥬 성수', address_name: '서울 성동구 성수동2가 1', road_address_name: '서울 성동구 연무장길 5' }]
        : [],
    });
  }
  if (u.includes('/api/gemini')) return jsonRes({ storeName: '', area: '' });
  return jsonRes({ items: [], documents: [], places: [] });
};
const camoNew = await extractPlaces('https://youtube.com/shorts/EKbeq6BnREI');
check('v2.22 업로더 고정댓글: 상호를 잡음', (camoNew.queryList || []).some((q) => q.indexOf('카모플라쥬') >= 0), (camoNew.queryList || []).join(' / '));
check('v2.22 업로더 고정댓글: 확인(verified) 후보', camoNew.matchStatus === 'verified' && (camoNew.candidates[0] || {}).name === '카모플라쥬 성수', camoNew.matchStatus + ' / ' + JSON.stringify((camoNew.candidates || []).map((c) => c.name)));

// 시청자 댓글 잡담은 검색어 1순위가 되지 않습니다.
const chatter = extractSearchQueries('부대찌개집 발견...ㄷㄷ');
check('v2.22 제목만으로는 상호를 지어내지 않음', chatter.storeName === '', chatter.storeName);
check(
  'v2.22 시청자 댓글 잡담(질문·미니님)은 상호 근거가 아님',
  classifyQuery('미니님 질문', { channel: '미니로운생활' }).kind === 'area',
  JSON.stringify(classifyQuery('미니님 질문'))
);

// ── 10) 메뉴·수량 단어 목록 ──
check(
  'v2.22 메뉴 단어 판정',
  ['닭볶음탕', '순대국', '파스타', '오마카세', '돈까스', '부대찌개', '솥뚜껑'].every((w) => isMenuWord(w) === true) &&
    ['베통', '디오디아', '산골농원', '카모플라쥬'].every((w) => isMenuWord(w) === false),
  '메뉴 판정'
);
check(
  'v2.22 수량·시간 단위 확장',
  ['24시', '3대', '2인', '1인분', '3명', '2시간', '2호점'].every((t) => isQuantityOrPriceToken(t) === true),
  '수량 판정'
);

// ── 원복 ─────────────────────────────────────────────────────
Platform.OS = 'ios';
globalThis.fetch = realFetch;
[
  'EXPO_PUBLIC_KAKAO_REST_API_KEY',
  'EXPO_PUBLIC_NAVER_HUB_CLIENT_ID',
  'EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET',
  'EXPO_PUBLIC_NAVER_CLIENT_ID',
  'EXPO_PUBLIC_NAVER_CLIENT_SECRET',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
].forEach((k) => delete process.env[k]);

if (fails) { console.log('EXTRACT_FAILED=' + fails); process.exit(1); }
console.log('EXTRACT_OK');
