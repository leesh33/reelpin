/**
 * test/proxy-test.mjs
 * ─────────────────────────────────────────────────────────────
 * v1.4 — **웹(Platform.OS='web')** 에서 동일 출처 프록시(/api/*)를 타는지 검증합니다.
 *
 *   node 로 src 를 번들할 때 react-native 를 `test/stubs/react-native-web.js` 로 치환해
 *   Platform.OS === 'web' 인 상황을 만듭니다. (네이티브 동작은 extractor-test.mjs 가 검증)
 */
import {
  API_PROXY,
  API_PROXY_TIMEOUT_MS,
  isWebPlatform,
  isNativeRuntime,
  proxyPathOf,
  fetchYouTubeProxy,
  naverLocalAdapter,
  kakaoLocalAdapter,
  searchPlaceProviders,
  searchPlacesDirect,
  extractPlaces,
  parseUrl,
  // v2.0 — 네이버 단축·지도 링크는 웹에서도 프록시로
  resolveShortLink,
  resolvePlaceLinkFromInput,
  // v2.9 — Gemini 영상 분석(음성·화면 자막) 프록시
  GEMINI_PROXY_TIMEOUT_MS,
  fetchGeminiAnalysis,
  geminiQueryList,
  geminiNoteOf,
} from '../src/services/extractor.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails++;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
};

// ── 0. 환경 맞추기: 웹 런타임 + 번들 키 없음 (배포된 Vercel 웹앱과 같은 상태) ──
['EXPO_PUBLIC_KAKAO_REST_API_KEY', 'EXPO_PUBLIC_NAVER_HUB_CLIENT_ID', 'EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET',
 'EXPO_PUBLIC_NAVER_CLIENT_ID', 'EXPO_PUBLIC_NAVER_CLIENT_SECRET', 'EXPO_PUBLIC_YOUTUBE_API_KEY',
 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', 'EXPO_PUBLIC_OPENAI_API_KEY'].forEach((k) => delete process.env[k]);

let calls = [];
let handler = () => ({ ok: true, status: 200, json: async () => ({}) });
const jsonRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status) => ({ ok: false, status, json: async () => ({}) });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return handler(String(url), init);
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

// ── 1. 런타임 판별 ────────────────────────────────────────────
check('web: isWebPlatform = true', isWebPlatform() === true);
check('web: isNativeRuntime = false', isNativeRuntime() === false);
check('web: 프록시 주소 상수', API_PROXY.youtube === '/api/youtube' && API_PROXY.kakao === '/api/kakao-local' && API_PROXY.naver === '/api/naver-local');
check('web: 프록시 타임아웃 4.5초(서버 4초보다 김)', API_PROXY_TIMEOUT_MS > 4000 && API_PROXY_TIMEOUT_MS < 6000, String(API_PROXY_TIMEOUT_MS));
check(
  'web: proxyPathOf 인코딩',
  proxyPathOf('naver', { query: '성수 소금빵', display: 3 }) ===
    '/api/naver-local?query=' + encodeURIComponent('성수 소금빵') + '&display=3',
  proxyPathOf('naver', { query: '성수 소금빵', display: 3 })
);
check('web: proxyPathOf 빈 값 제거', proxyPathOf('youtube', { id: 'abc', q: '' }) === '/api/youtube?id=abc', proxyPathOf('youtube', { id: 'abc', q: '' }));
check('web: proxyPathOf 모르는 이름', proxyPathOf('nope', {}) === '');

// ── 2. 네이버 지역검색 = /api/naver-local ────────────────────
check('web/naver: 키 없이도 configured (프록시)', naverLocalAdapter.isConfigured() === true);

calls = [];
handler = (url) => {
  if (url.indexOf('/api/naver-local') === 0) return jsonRes({ items: [NAVER_ITEM] });
  if (url.indexOf('/api/kakao-local') === 0) return jsonRes({ documents: [KAKAO_DOC] });
  return errRes(404);
};
const naverWeb = await naverLocalAdapter.search({ query: '성수 소금빵', limit: 3 });
check('web/naver: 프록시 1회 호출', calls.length === 1 && calls[0].url.indexOf('/api/naver-local?') === 0, calls.map((c) => c.url).join(' | '));
check('web/naver: query·display 전달', calls[0].url === '/api/naver-local?query=' + encodeURIComponent('성수 소금빵') + '&display=3', calls[0].url);
check('web/naver: 키 헤더 없음(서버가 붙임)', !calls[0].init.headers, JSON.stringify(calls[0].init.headers));
check('web/naver: 후보 매핑', naverWeb.length === 1 && naverWeb[0].name === '성수동 소금빵집', JSON.stringify(naverWeb[0] && naverWeb[0].name));
check('web/naver: 좌표 1e7 스케일', Math.abs(naverWeb[0].lat - 37.5445) < 1e-6 && Math.abs(naverWeb[0].lng - 127.0557) < 1e-6, naverWeb[0].lat + ',' + naverWeb[0].lng);
calls = [];
await naverLocalAdapter.search({ query: 'x', limit: 99 });
check('web/naver: display 상한 5', calls[0].url.indexOf('&display=5') > 0, calls[0].url);

// ── 3. 카카오 로컬 = /api/kakao-local ────────────────────────
check('web/kakao: 키 없이도 configured (프록시)', kakaoLocalAdapter.isConfigured() === true);
calls = [];
const kakaoWeb = await kakaoLocalAdapter.search({ query: '성수 소금빵집', limit: 4 });
check('web/kakao: 프록시 호출', calls.length === 1 && calls[0].url.indexOf('/api/kakao-local?') === 0, calls.map((c) => c.url).join(' | '));
check('web/kakao: size 전달', calls[0].url.indexOf('&size=4') > 0, calls[0].url);
check('web/kakao: 후보 매핑', kakaoWeb.length === 1 && kakaoWeb[0].name === '성수동 소금빵집' && kakaoWeb[0].provider === 'kakao', JSON.stringify(kakaoWeb[0] && kakaoWeb[0].name));

// ── 4. 두 지도사 병렬 조회 (웹) — 프록시만 쓰고 직접 호출은 없음 ──
calls = [];
const chain = await searchPlaceProviders({ query: '성수 소금빵' });
const hosts = calls.map((c) => c.url);
check('web/chain: 프록시 2곳 호출', hosts.length === 2, hosts.join(' | '));
check('web/chain: 외부 도메인 직접 호출 없음', !hosts.some((u) => u.indexOf('http') === 0), hosts.join(' | '));
check('web/chain: 후보 병합', chain.candidates.length === 1 && chain.candidates[0].providers.length === 2, JSON.stringify(chain.candidates[0] && chain.candidates[0].providers));
check('web/chain: providersTried', JSON.stringify(chain.providersTried.sort()) === '["kakao","naver"]', JSON.stringify(chain.providersTried));

// ── 5. 프록시가 없거나 실패하면: 조용한 실패 + 다른 지도사 결과 유지 ──
calls = [];
handler = (url) => {
  if (url.indexOf('/api/naver-local') === 0) return errRes(404);
  if (url.indexOf('/api/kakao-local') === 0) return jsonRes({ documents: [KAKAO_DOC] });
  return errRes(404);
};
const partial = await searchPlaceProviders({ query: '성수 소금빵' });
check('web/실패: 네이버는 failure 로 기록', partial.failures.some((f) => f.provider === 'naver'), JSON.stringify(partial.failures));
check('web/실패: 카카오 결과로 진행', partial.candidates.length === 1 && partial.candidates[0].name === '성수동 소금빵집', JSON.stringify(partial.candidates.map((c) => c.name)));

// ── 6. 유튜브 = /api/youtube (키 없이 웹) ────────────────────
calls = [];
handler = (url) => {
  if (url.indexOf('/api/youtube') === 0) {
    return jsonRes({
      title: '제주 연동 엄마손횟집 다녀왔어요',
      description: '제주시 연동 “엄마손횟집”\n자연산 돌돔을 먹을 수 있는 집',
      thumbnail: 'https://i.ytimg.com/vi/2QZPPEle9IY/hq.jpg',
      comments: '여기 제주 연동 엄마손횟집이에요',
      channelId: 'UC_owner',
    });
  }
  if (url.indexOf('https://www.youtube.com/oembed') === 0) {
    return jsonRes({ title: '제목( oEmbed )', author_name: '호키도리', thumbnail_url: 'https://i.ytimg.com/vi/2QZPPEle9IY/hq.jpg' });
  }
  if (url.indexOf('https://www.googleapis.com') === 0) return errRes(500);
  return jsonRes({ documents: [KAKAO_DOC], items: [NAVER_ITEM] });
};
const ytUrl = 'https://youtube.com/shorts/2QZPPEle9IY';
const ytProxy = await fetchYouTubeProxy(parseUrl(ytUrl));
check('web/youtube: 프록시 응답 파싱', ytProxy && ytProxy.title.includes('엄마손횟집') && ytProxy.source === 'youtube-proxy', JSON.stringify(ytProxy && ytProxy.title));
check('web/youtube: 설명글·댓글 유지', String(ytProxy.description).includes('엄마손횟집') && ytProxy.comments.includes('엄마손횟집'));

calls = [];
const ytFlow = await extractPlaces(ytUrl);
const urlList = calls.map((c) => c.url);
check('web/youtube: /api/youtube?id= 호출', urlList.some((u) => u === '/api/youtube?id=2QZPPEle9IY'), urlList.join(' | '));
check('web/youtube: Data API 직접 호출 없음(키 없음)', !urlList.some((u) => u.indexOf('googleapis.com') === 0), urlList.join(' | '));
check('web/youtube: 제목은 프록시/ oEmbed 로', String(ytFlow.sourceTitle).includes('엄마손횟집'), ytFlow.sourceTitle);
check('web/youtube: titleStatus=video', ytFlow.titleStatus === 'video', ytFlow.titleStatus);
check('web/youtube: 검색어에 상호 반영', ytFlow.queryList[0] === '연동 엄마손횟집', ytFlow.queryList.join(' / '));
// v2.9 — 정상적으로 찾은 릴스는 Gemini 를 부르지 않습니다(0.5초 · 크레딧 0)
check('web/youtube: 1차에서 찾으면 /api/gemini 호출 없음', !urlList.some((u) => u.indexOf('/api/gemini') === 0), urlList.join(' | '));

// ── 7. 프록시 실패 → oEmbed 폴백 (앱이 멈지지 않음) ──────────
calls = [];
handler = (url) => {
  if (url.indexOf('/api/youtube') === 0) return errRes(404);
  if (url.indexOf('https://www.youtube.com/oembed') === 0) {
    return jsonRes({ title: '연남동 딸기 케이크 맛집', thumbnail_url: 'https://i.ytimg.com/vi/9Xk2mQpLz7A/hq.jpg' });
  }
  return jsonRes({ documents: [], items: [] });
};
const fallbackFlow = await extractPlaces('https://youtube.com/shorts/9Xk2mQpLz7A');
check('web/폴백: oEmbed 로 제목 확보', fallbackFlow.sourceTitle === '연남동 딸기 케이크 맛집', fallbackFlow.sourceTitle);
check('web/폴백: oEmbed 는 CORS 열려 있어 웹에서 동작', calls.some((c) => c.url.indexOf('youtube.com/oembed') > 0), calls.map((c) => c.url).join(' | '));
check('web/폴백: ok 결과 유지', fallbackFlow.ok === true && fallbackFlow.candidates.length > 0, String(fallbackFlow.candidates.length));

// ── 7-1. v2.9 Gemini 영상 분석 폴백 (유튜브 · 1차 실패 시에만) ──
check('web/gemini: 프록시 주소 상수', API_PROXY.gemini === '/api/gemini', String(API_PROXY.gemini));
check('web/gemini: 타임아웃 12초 이상', GEMINI_PROXY_TIMEOUT_MS >= 12000, String(GEMINI_PROXY_TIMEOUT_MS));

calls = [];
handler = (url) => {
  if (url === '/api/gemini') return jsonRes({ storeName: '엄마손횟집', area: '제주 연동', menu: '돌돔', category: '맛집', places: [] });
  return errRes(404);
};
const gAnalysis = await fetchGeminiAnalysis(parseUrl('https://youtube.com/shorts/LPLE_SH2b9U'), {
  title: '제주 연동 맛집',
  description: '자연산 돌돔',
});
const gCall = calls[0] || { url: '', init: {} };
const gPayload = JSON.parse(gCall.init.body || '{}');
check('web/gemini: POST /api/gemini', gCall.url === '/api/gemini' && gCall.init.method === 'POST', gCall.url);
check(
  'web/gemini: watch 주소 + 제목·설명글 전송',
  gPayload.url === 'https://www.youtube.com/watch?v=LPLE_SH2b9U' && gPayload.title === '제주 연동 맛집' && gPayload.description === '자연산 돌돔',
  JSON.stringify(gPayload)
);
check('web/gemini: 분석 결과 매핑', gAnalysis && gAnalysis.storeName === '엄마손횟집' && gAnalysis.area === '제주 연동', JSON.stringify(gAnalysis));
check(
  'web/gemini: 인스타 링크는 호출하지 않음',
  (await fetchGeminiAnalysis(parseUrl('https://www.instagram.com/reel/C8xSg2pQ1K/'), {})) === null && calls.length === 1,
  String(calls.length)
);
check(
  'web/gemini: 검색어는 지역+상호 먼저',
  JSON.stringify(geminiQueryList(gAnalysis).slice(0, 2)) === JSON.stringify(['제주 연동 엄마손횟집', '엄마손횟집']),
  JSON.stringify(geminiQueryList(gAnalysis))
);
check('web/gemini: 근거 문구', geminiNoteOf(gAnalysis) === 'AI 영상 분석으로 찾았어요 · “엄마손횟집” (제주 연동)', geminiNoteOf(gAnalysis));

// 1차(제목·설명글)가 비어 지도에서 실매장을 못 찾은 유튜브 → Gemini 가 영상 읽기 → 지도 재조회
const GEMINI_KAKAO_DOC = {
  ...KAKAO_DOC,
  id: '90001',
  place_name: '엄마손횟집',
  category_name: '음식점 > 한식 > 해물,생선',
  address_name: '제주 제주시 연동 123-4',
  y: '33.4890',
  x: '126.4983',
};
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.indexOf('/api/youtube') === 0) return jsonRes({ title: '', description: '', comments: '', thumbnail: '', channelId: '' });
  if (u.indexOf('https://www.youtube.com/oembed') === 0) return errRes(404);
  if (u === '/api/gemini') return jsonRes({ storeName: '엄마손횟집', area: '제주 연동', menu: '돌돔', category: '맛집', places: [] });
  if (u.indexOf('/api/kakao-local') === 0) {
    return decodeURIComponent(u).indexOf('엄마손횟집') >= 0 ? jsonRes({ documents: [GEMINI_KAKAO_DOC] }) : jsonRes({ documents: [] });
  }
  if (u.indexOf('/api/naver-local') === 0) return jsonRes({ items: [] });
  return jsonRes({ items: [], documents: [] });
};
const gFlow = await extractPlaces('https://youtube.com/shorts/LPLE_SH2b9U');
const gFlowUrls = calls.map((c) => c.url);
check('web/gemini 흐름: 1차 실패 → /api/gemini 호출', gFlowUrls.indexOf('/api/gemini') >= 0, gFlowUrls.join(' | '));
check(
  'web/gemini 흐름: 찾은 상호로 지도를 다시 조회',
  gFlowUrls.some((u) => u.indexOf('/api/kakao-local') === 0 && decodeURIComponent(u).indexOf('엄마손횟집') > 0),
  gFlowUrls.join(' | ')
);
check('web/gemini 흐름: 실매장 후보', gFlow.candidates.length === 1 && gFlow.candidates[0].name === '엄마손횟집', JSON.stringify(gFlow.candidates.map((c) => c.name)));
check('web/gemini 흐름: usedAdapter 가 gemini 로 시작', String(gFlow.usedAdapter).indexOf('gemini') === 0, gFlow.usedAdapter);
check(
  'web/gemini 흐름: 한 줄 근거(aiNote)',
  String(gFlow.aiNote).indexOf('AI 영상 분석으로 찾았어요') === 0 && String(gFlow.aiNote).indexOf('엄마손횟집') > 0,
  gFlow.aiNote
);
check('web/gemini 흐름: 메뉴 → menuTags', JSON.stringify(gFlow.candidates[0].menuTags) === '["돌돔"]', JSON.stringify(gFlow.candidates[0].menuTags));
check('web/gemini 흐름: 지도 분류가 우선', gFlow.candidates[0].category === '맛집', gFlow.candidates[0].category);

// Gemini 가 지도에서 좌표를 못 채워도 **영상에서 읽은 상호**는 살립니다(좌표 없는 수동 후보)
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.indexOf('/api/youtube') === 0) return jsonRes({ title: '', description: '', comments: '', thumbnail: '', channelId: '' });
  if (u === '/api/gemini') return jsonRes({ storeName: '모리식당', area: '성수동', menu: '규동', category: '맛집', places: [] });
  return jsonRes({ items: [], documents: [] });
};
const gManual = await extractPlaces('https://youtube.com/shorts/LPLE_SH2b9U');
check('web/gemini 수동: 상호와 동네는 남김', gManual.candidates[0].name === '모리식당' && gManual.candidates[0].area === '성수동', JSON.stringify(gManual.candidates[0]));
check('web/gemini 수동: 좌표를 지어내지 않음', gManual.candidates[0].lat === null && gManual.candidates[0].lng === null, JSON.stringify([gManual.candidates[0].lat, gManual.candidates[0].lng]));
check('web/gemini 수동: 근거 문구 유지', String(gManual.aiNote).indexOf('AI 영상 분석으로 찾았어요') === 0, gManual.aiNote);

// Gemini 가 빈 결과/프록시 503 → 조용히 기존 오프라인 폴백
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.indexOf('/api/youtube') === 0) return jsonRes({ title: '', description: '', comments: '', thumbnail: '', channelId: '' });
  if (u === '/api/gemini') return jsonRes({ storeName: '', area: '', menu: '', category: '', places: [] });
  return jsonRes({ items: [], documents: [] });
};
const gEmpty = await extractPlaces('https://youtube.com/shorts/LPLE_SH2b9U');
check('web/gemini 빈 결과: 오프라인 폴백 유지', String(gEmpty.usedAdapter).indexOf('offline') === 0 && gEmpty.candidates.length > 0, gEmpty.usedAdapter);
check('web/gemini 빈 결과: aiNote 없음', !gEmpty.aiNote, String(gEmpty.aiNote));

handler = (url) => {
  const u = String(url);
  if (u.indexOf('/api/youtube') === 0) return jsonRes({ title: '', description: '', comments: '', thumbnail: '', channelId: '' });
  if (u === '/api/gemini') return { ok: false, status: 503, json: async () => ({ error: 'gemini-not-configured' }) };
  return jsonRes({ items: [], documents: [] });
};
const g503 = await extractPlaces('https://youtube.com/shorts/LPLE_SH2b9U');
check('web/gemini 미설정(503): 앱은 그대로 오프라인 폴백', String(g503.usedAdapter).indexOf('offline') === 0 && g503.ok === true, g503.usedAdapter);

// ── 8. 직접 검색('가게명으로 찾기')도 웹에서 동작 ────────────
handler = (url) => {
  if (url.indexOf('/api/kakao-local') === 0) return jsonRes({ documents: [KAKAO_DOC] });
  if (url.indexOf('/api/naver-local') === 0) return jsonRes({ items: [NAVER_ITEM] });
  return errRes(404);
};
const direct = await searchPlacesDirect('성수 소금빵');
check('web/direct: 결과 있음', direct.ok === true && direct.candidates.length >= 1, JSON.stringify(direct.candidates.map((c) => c.name)));
check('web/direct: usedAdapter = kakao+naver', direct.usedAdapter === 'kakao+naver', String(direct.usedAdapter));

// ── 10. v2.0: 네이버 단축 링크 → /api/resolve-url 프록시 ─────────
calls = [];
handler = (url) => {
  const u = String(url);
  if (u.indexOf('/api/resolve-url') === 0) {
    return jsonRes({
      ok: true,
      url: 'https://m.place.naver.com/place/1736095566/home',
      kind: 'naver-place',
      naverPlaceId: '1736095566',
      title: '칸다소바',
      lat: 37.5492716,
      lng: 126.9227124,
      address: '서울 마포구 와우산로 51-6',
      phone: '0507-1375-1660',
    });
  }
  return jsonRes({ items: [], places: [], documents: [] });
};
const webResolved = await resolveShortLink('https://naver.me/GabcdEfg');
check('web/resolve: /api/resolve-url 프록시 호출', calls.length > 0 && calls[0].url.indexOf('/api/resolve-url?url=') === 0, calls[0] && calls[0].url);
check(
  'web/resolve: 링크 인코딩',
  calls[0] && calls[0].url.indexOf(encodeURIComponent('https://naver.me/GabcdEfg')) > 0,
  calls[0] && calls[0].url
);
check('web/resolve: placeId·제목·좌표', webResolved.naverPlaceId === '1736095566' && webResolved.title === '칸다소바' && Math.abs(webResolved.lat - 37.5492716) < 1e-9, JSON.stringify(webResolved));
check('web/resolve: 네이버 페이지 직접 호출 없음', !calls.some((c) => c.url.indexOf('m.place.naver.com') === 0));

calls = [];
const webPlaceLink = await resolvePlaceLinkFromInput(['https://map.naver.com/p/entry/place/1736095566']);
check('web/placeLink: 지도 링크에서 placeId', webPlaceLink && webPlaceLink.naverPlaceId === '1736095566', JSON.stringify(webPlaceLink));
check('web/placeLink: 프록시로 제목 보강', webPlaceLink && webPlaceLink.title === '칸다소바' && webPlaceLink.phone === '0507-1375-1660', JSON.stringify(webPlaceLink));

calls = [];
handler = (url) => {
  const u = String(url);
  if (u.indexOf('/api/resolve-url') === 0) {
    return jsonRes({ ok: true, url: 'https://m.place.naver.com/place/1736095566/home', naverPlaceId: '1736095566', title: '칸다소바', lat: 37.5492716, lng: 126.9227124, address: '서울 마포구 와우산로 51-6', phone: '0507-1375-1660' });
  }
  if (u.indexOf('/api/kakao-local') === 0) return jsonRes({ documents: [] });
  return jsonRes({ items: [], places: [], documents: [] });
};
const webNaverPin = await extractPlaces('https://m.place.naver.com/place/1736095566');
check('web/extract: 네이버 링크는 placeId 핀', webNaverPin.usedAdapter === 'naver-place-link' && (webNaverPin.candidates[0] || {}).naverPlaceId === '1736095566', JSON.stringify(webNaverPin.usedAdapter));
check('web/extract: 좌표·전화까지 저장', (webNaverPin.candidates[0] || {}).phone === '0507-1375-1660' && Number.isFinite((webNaverPin.candidates[0] || {}).lat));


// ── 9. 네트워크 예외도 앱을 멈추지 않음 ─────────────────────
globalThis.fetch = async () => {
  throw new Error('network-down');
};
const thrown = await searchPlacesDirect('성수 소금빵');
check('web/예외: 조용히 실패 처리', thrown.ok === false && thrown.candidates.length === 0, JSON.stringify(thrown.reason));
const thrownExtract = await extractPlaces(ytUrl);
check('web/예외: 추출기는 오프라인 폴백', thrownExtract.ok === true && thrownExtract.candidates.length > 0, thrownExtract.usedAdapter);

if (fails) {
  console.log('\nPROXY_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nPROXY_TESTS_OK');
