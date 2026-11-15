import fs from 'node:fs';
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
} from '../src/services/extractor.js';
import {
  naverMapAppUrl,
  naverMapWebUrl,
  kakaoMapAppUrl,
  kakaoMapWebUrl,
  buildShareLink,
  normalizePlaceUrl,
  openPlace,
} from '../src/utils/links.js';
import { buildPin, normalizePin, normalizePins, findExistingPin } from '../src/utils/pins.js';

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
check('재시도: 시도 기록 2건', Array.isArray(retry.attempts) && retry.attempts.length === 2, JSON.stringify(retry.attempts));
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

// ── 원복 ─────────────────────────────────────────────────────
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
