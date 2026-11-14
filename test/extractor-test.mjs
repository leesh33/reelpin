import fs from 'node:fs';
import path from 'node:path';
import {
  parseUrl,
  isSupportedUrl,
  extractPlaces,
  searchPlaceProviders,
  kakaoLocalAdapter,
  naverLocalAdapter,
  googlePlacesAdapter,
  offlineSmartExtract,
  PRESETS,
} from '../src/services/extractor.js';
import { naverMapAppUrl, naverMapWebUrl, kakaoMapAppUrl, kakaoMapWebUrl, buildShareLink } from '../src/utils/links.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else { fails++; console.log('FAIL ' + label + (extra ? '  -> ' + extra : '')); }
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
check('query: hashtag/emoji/link stripped', sentQuery === '성수 소금빵 맛집', sentQuery);

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
