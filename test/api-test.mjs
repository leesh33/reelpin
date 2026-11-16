/**
 * test/api-test.mjs
 * ─────────────────────────────────────────────────────────────
 * Vercel Serverless Functions(`api/*.js`) 핸들러 단위 테스트.
 *
 *   · 입력 검증(빈 query → 400, 잘못된 id → 400, 메서드 → 405)
 *   · 업스트림 호출 모양(엔드포인트·헤더·쿼리)
 *   · 응답 모양(프록시는 응답 그대로 전달, 유튜브는 { title, description, thumbnail, comments, channelId })
 *   · 실패 시 **키가 응답 본문에 절대 들어가지 않음**
 *   · 4초 타임아웃
 *
 * 네트워크는 globalThis.fetch 스텁으로 대체합니다.
 */
import youtubeHandler from '../api/youtube.js';
import kakaoHandler from '../api/kakao-local.js';
import naverHandler from '../api/naver-local.js';
import resolveUrlHandler, {
  ALLOWED_HOSTS,
  TOTAL_TIMEOUT_MS as resolveUrlHandlerTotal,
  extractNaverPlaceId as apiExtractNaverPlaceId,
  normalizeTarget,
  parseNaverPlaceHtml as apiParseNaverPlaceHtml,
} from '../api/resolve-url.js';
import geminiHandler from '../api/gemini.js';
import fs from 'node:fs';
import path from 'node:path';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails++;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
};

// ── 도우미 ───────────────────────────────────────────────────
function makeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    end(chunk) {
      if (chunk != null) this.body = String(chunk);
      this.ended = true;
    },
    jsonBody() {
      try {
        return JSON.parse(this.body || 'null');
      } catch (e) {
        return null;
      }
    },
  };
  return res;
}

async function call(handler, query = {}, method = 'GET') {
  const res = makeRes();
  await handler({ method, query }, res);
  return { status: res.statusCode, body: res.jsonBody(), raw: res.body, headers: res.headers };
}

const jsonRes = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const errRes = (status) => ({ ok: false, status, json: async () => ({}) });

const SECRETS = ['YOUTUBE_SECRET_KEY', 'KAKAO_SECRET_KEY', 'HUB_SECRET_KEY', 'LEGACY_SECRET_KEY', 'GEMINI_SECRET_KEY'];
const leaksSecret = (raw) => SECRETS.some((s) => String(raw || '').indexOf(s) >= 0);

let calls = [];
let handler = () => jsonRes({});
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return handler(String(url), init);
};

// ── 1. 유튜브: 입력 검증 ─────────────────────────────────────
let r = await call(youtubeHandler, {});
check('youtube: id 없음 → 400', r.status === 400 && r.body.error === 'missing-id', JSON.stringify(r.body));
r = await call(youtubeHandler, { id: '../etc/passwd' });
check('youtube: 이상한 id → 400', r.status === 400, JSON.stringify(r.body));
r = await call(youtubeHandler, { id: 'abc' });
check('youtube: 너무 짧은 id → 400', r.status === 400, JSON.stringify(r.body));
r = await call(youtubeHandler, { id: '2QZPPEle9IY' }, 'POST');
check('youtube: POST → 405', r.status === 405, String(r.status));

// ── 2. 유튜브: 키 없음 → oEmbed 폴백 ────────────────────────
delete process.env.YOUTUBE_API_KEY;
delete process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
calls = [];
handler = (url) => {
  if (url.indexOf('https://www.youtube.com/oembed') === 0) {
    return jsonRes({ title: '연남동 딸기 케이크 맛집', author_name: 'food', thumbnail_url: 'https://i.ytimg.com/vi/x/hq.jpg' });
  }
  return errRes(500);
};
r = await call(youtubeHandler, { id: '2QZPPEle9IY' });
check('youtube(키 없음): oEmbed 만 호출', calls.length === 1 && calls[0].url.indexOf('youtube.com/oembed') > 0, calls.map((c) => c.url).join(' | '));
check('youtube(키 없음): 200 + 제목', r.status === 200 && r.body.title === '연남동 딸기 케이크 맛집', JSON.stringify(r.body));
check('youtube(키 없음): source=oembed', r.body.source === 'oembed' && r.body.comments === '' && r.body.channelId === '', JSON.stringify(r.body));
check('youtube: oEmbed URL 에 watch 주소 인코딩', calls[0].url.indexOf(encodeURIComponent('https://www.youtube.com/watch?v=2QZPPEle9IY')) > 0, calls[0].url);

handler = () => errRes(404);
r = await call(youtubeHandler, { id: '2QZPPEle9IY' });
check('youtube(키 없음): oEmbed 도 실패 → 502', r.status === 502, String(r.status));

// ── 3. 유튜브: 키 있음 → videos + commentThreads 병렬 ───────
process.env.YOUTUBE_API_KEY = 'YOUTUBE_SECRET_KEY';
calls = [];
handler = (url) => {
  if (url.indexOf('/youtube/v3/videos') > 0) {
    return jsonRes({
      items: [
        {
          snippet: {
            title: '제주 연동 엄마손횟집 다녀왔어요',
            description: '제주시 연동 “엄마손횟집”\n자연산 돌돔',
            channelId: 'UC_owner',
            thumbnails: { high: { url: 'https://i.ytimg.com/vi/x/hq.jpg' } },
          },
        },
      ],
    });
  }
  if (url.indexOf('/youtube/v3/commentThreads') > 0) {
    return jsonRes({
      items: [
        {
          snippet: {
            topLevelComment: {
              snippet: { textDisplay: '다른 사람 댓글', authorChannelId: { value: 'UC_other' }, likeCount: 3 },
            },
          },
        },
        {
          snippet: {
            topLevelComment: {
              snippet: { textDisplay: '여기 제주 연동 엄마손횟집이에요', authorChannelId: { value: 'UC_owner' }, likeCount: 1 },
            },
          },
        },
      ],
    });
  }
  if (url.indexOf('youtube.com/oembed') > 0) return jsonRes({ title: 'oEmbed 제목' });
  return errRes(500);
};
r = await call(youtubeHandler, { id: '2QZPPEle9IY' });
const twoCalls = calls.filter((c) => c.url.indexOf('googleapis.com') > 0).map((c) => c.url);
check('youtube(키): videos + commentThreads 2회', twoCalls.length === 2, twoCalls.join(' | '));
check('youtube(키): videos 파라미터', twoCalls.some((u) => u.indexOf('part=snippet&id=2QZPPEle9IY&key=') > 0), twoCalls.join(' | '));
check(
  'youtube(키): commentThreads 파라미터(관련도·5개·plainText)',
  twoCalls.some((u) => u.indexOf('order=relevance&maxResults=5&textFormat=plainText') > 0),
  twoCalls.join(' | ')
);
check('youtube(키): 제목·설명글', r.body.title === '제주 연동 엄마손횟집 다녀왔어요' && r.body.description.indexOf('엄마손횟집') >= 0, JSON.stringify(r.body.title));
check('youtube(키): channelId', r.body.channelId === 'UC_owner', r.body.channelId);
check(
  'youtube(키): 업로더 댓글 먼저',
  r.body.comments.split('\n')[0] === '여기 제주 연동 엄마손횟집이에요',
  JSON.stringify(r.body.comments)
);
check('youtube(키): 썸네일', String(r.body.thumbnail).indexOf('ytimg') > 0, String(r.body.thumbnail));
check('youtube(키): 키가 응답에 없음', !leaksSecret(r.raw), r.raw.slice(0, 80));

// 댓글 비허용(403) → 제목·설명글은 살림
handler = (url) => {
  if (url.indexOf('/youtube/v3/videos') > 0) {
    return jsonRes({ items: [{ snippet: { title: '제목만', description: '', channelId: 'UC_x' } }] });
  }
  if (url.indexOf('/youtube/v3/commentThreads') > 0) return errRes(403);
  return errRes(500);
};
r = await call(youtubeHandler, { id: '2QZPPEle9IY' });
check('youtube(키): 댓글 403 이어도 200', r.status === 200 && r.body.title === '제목만' && r.body.comments === '', JSON.stringify(r.body));

// videos 500 + oEmbed 성공 → oEmbed 로
handler = (url) => {
  if (url.indexOf('youtube.com/oembed') > 0) return jsonRes({ title: 'oEmbed 제목' });
  return errRes(500);
};
r = await call(youtubeHandler, { id: '2QZPPEle9IY' });
check('youtube(키): Data API 실패 → oEmbed 폴백', r.status === 200 && r.body.title === 'oEmbed 제목' && r.body.source === 'oembed', JSON.stringify(r.body));

// ── 4. 카카오: 입력 검증·에러·성공 ──────────────────────────
delete process.env.KAKAO_REST_API_KEY;
delete process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
r = await call(kakaoHandler, {});
check('kakao: query 없음 → 400', r.status === 400 && r.body.error === 'missing-query', JSON.stringify(r.body));
r = await call(kakaoHandler, { query: '성수' });
check('kakao: 키 없음 → 503', r.status === 503 && r.body.error === 'kakao-key-missing', JSON.stringify(r.body));
r = await call(kakaoHandler, { query: '성수' }, 'DELETE');
check('kakao: DELETE → 405', r.status === 405, String(r.status));

process.env.KAKAO_REST_API_KEY = 'KAKAO_SECRET_KEY';
calls = [];
handler = () => jsonRes({ documents: [{ id: '1', place_name: '성수동 소금빵집' }], meta: { total_count: 1 } });
r = await call(kakaoHandler, { query: '성수 소금빵', size: '99' });
check('kakao: 성공 200', r.status === 200, String(r.status));
check('kakao: 카카오 응답 그대로 전달', JSON.stringify(r.body).indexOf('성수동 소금빵집') > 0, JSON.stringify(r.body));
check('kakao: 업스트림 URL', calls[0].url.indexOf('https://dapi.kakao.com/v2/local/search/keyword.json?query=') === 0, calls[0].url);
check('kakao: size 상한 15', calls[0].url.indexOf('&size=15') > 0, calls[0].url);
check('kakao: KakaoAK 헤더', calls[0].init.headers.Authorization === 'KakaoAK KAKAO_SECRET_KEY');
check('kakao: 키가 응답에 없음', !leaksSecret(r.raw), r.raw.slice(0, 80));
check('kakao: 같은 출처용 캐시 헤더', String(r.headers['cache-control'] || '').indexOf('s-maxage') > 0, JSON.stringify(r.headers));

// req.query 없이 req.url 만 오는 런타임/프록시 → 쿼리스트링에서 읽기
calls = [];
handler = () => jsonRes({ documents: [] });
const urlOnly = makeRes();
await kakaoHandler(
  { method: 'GET', url: '/api/kakao-local?query=' + encodeURIComponent('성수 소금빵') + '&size=7' },
  urlOnly
);
check('kakao: req.query 없어도 URL 쿼리 사용', urlOnly.statusCode === 200 && calls[0].url.indexOf('query=' + encodeURIComponent('성수 소금빵')) > 0, calls[0] && calls[0].url);
check('kakao: URL 쿼리의 size 도 반영', calls[0].url.indexOf('&size=7') > 0, calls[0] && calls[0].url);

// 깨진 퍼센트 인코딩(%zz)에도 500 으로 터지지 않음
calls = [];
const broken = makeRes();
await kakaoHandler({ method: 'GET', url: '/api/kakao-local?query=%zz&size=abc' }, broken);
check('kakao: 깨진 인코딩에도 예외 없음', broken.statusCode === 200, String(broken.statusCode));
check('kakao: 숫자가 아닌 size 는 기본 3', calls[0].url.indexOf('&size=3') > 0, calls[0] && calls[0].url);

handler = () => errRes(401);
r = await call(kakaoHandler, { query: '성수' });
check('kakao: 업스트림 401 → 502', r.status === 502 && r.body.error === 'kakao-failed' && r.body.status === 401, JSON.stringify(r.body));
check('kakao(실패): 키·본문 노출 없음', !leaksSecret(r.raw), r.raw);

// ── 5. 네이버: HUB 규격 ─────────────────────────────────────
delete process.env.NAVER_HUB_CLIENT_ID;
delete process.env.NAVER_HUB_CLIENT_SECRET;
delete process.env.NAVER_CLIENT_ID;
delete process.env.NAVER_CLIENT_SECRET;
for (const k of ['EXPO_PUBLIC_NAVER_HUB_CLIENT_ID', 'EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET', 'EXPO_PUBLIC_NAVER_CLIENT_ID', 'EXPO_PUBLIC_NAVER_CLIENT_SECRET']) delete process.env[k];

r = await call(naverHandler, {});
check('naver: query 없음 → 400', r.status === 400 && r.body.error === 'missing-query', JSON.stringify(r.body));
r = await call(naverHandler, { query: '성수' });
check('naver: 키 없음 → 503', r.status === 503 && r.body.error === 'naver-key-missing', JSON.stringify(r.body));

process.env.NAVER_HUB_CLIENT_ID = 'HUB_ID';
process.env.NAVER_HUB_CLIENT_SECRET = 'HUB_SECRET_KEY';
calls = [];
handler = () => jsonRes({ items: [{ title: '<b>성수동</b> 소금빵집', mapx: '1270557000', mapy: '375445000' }] });
r = await call(naverHandler, { query: '성수 소금빵', display: '9' });
check('naver(hub): 성공 200', r.status === 200, String(r.status));
check('naver(hub): 업스트림 URL', calls[0].url.indexOf('https://naverapihub.apigw.ntruss.com/search/v1/local?query=') === 0, calls[0].url);
check('naver(hub): display 상한 5', calls[0].url.indexOf('&display=5') > 0, calls[0].url);
check('naver(hub): format=json', calls[0].url.indexOf('&format=json') > 0, calls[0].url);
check(
  'naver(hub): X-NCP 헤더 두 개',
  calls[0].init.headers['X-NCP-APIGW-API-KEY-ID'] === 'HUB_ID' && calls[0].init.headers['X-NCP-APIGW-API-KEY'] === 'HUB_SECRET_KEY',
  JSON.stringify(Object.keys(calls[0].init.headers))
);
check('naver(hub): 응답 그대로 전달', JSON.stringify(r.body).indexOf('소금빵집') > 0, JSON.stringify(r.body));
check('naver(hub): 키가 응답에 없음', !leaksSecret(r.raw), r.raw.slice(0, 80));

handler = () => errRes(401);
r = await call(naverHandler, { query: '성수' });
check('naver(hub): 업스트림 401 → 502', r.status === 502 && r.body.error === 'naver-failed', JSON.stringify(r.body));
check('naver(hub,실패): 키 노출 없음', !leaksSecret(r.raw), r.raw);

// ── 6. 네이버: 구 개발자센터 키만 있을 때 하위 호환 ─────────
delete process.env.NAVER_HUB_CLIENT_ID;
delete process.env.NAVER_HUB_CLIENT_SECRET;
process.env.NAVER_CLIENT_ID = 'LEGACY_ID';
process.env.NAVER_CLIENT_SECRET = 'LEGACY_SECRET_KEY';
calls = [];
handler = () => jsonRes({ items: [] });
r = await call(naverHandler, { query: '성수' });
check('naver(legacy): 구 엔드포인트 호출', calls[0].url.indexOf('https://openapi.naver.com/v1/search/local.json?query=') === 0, calls[0].url);
check('naver(legacy): X-Naver 헤더', calls[0].init.headers['X-Naver-Client-Id'] === 'LEGACY_ID' && calls[0].init.headers['X-Naver-Client-Secret'] === 'LEGACY_SECRET_KEY', JSON.stringify(Object.keys(calls[0].init.headers)));
check('naver(legacy): 200', r.status === 200, String(r.status));

// ── 6-1. v2.9 Gemini 영상 분석 (/api/gemini) ────────────────
//   · 키 없음 → 503 (앱은 조용히 기존 폴백)
//   · 유튜브가 아니면 → 200 빈 결과 + 업스트림 호출 0 (키를 다른 데 쓰지 않음)
//   · 유튜브면 fileUri=watch 주소 + 제목·설명글 + JSON 모드로 generateContent
//   · 실패·미확인은 모두 200 빈 결과 (앱을 멈지지 않음) · 키는 응답에 절대 없음
async function callGemini(body, method = 'POST') {
  const res = makeRes();
  await geminiHandler({ method, body }, res);
  return { status: res.statusCode, body: res.jsonBody(), raw: res.body, headers: res.headers };
}
const GEMINI_SECRET = 'GEMINI_SECRET_KEY';
const GEMINI_OK = {
  storeName: '엄마손횟집',
  area: '제주 연동',
  menu: '돌돔, 전복',
  category: '맛집',
  places: [{ name: '엄마손횟집', area: '제주 연동', menu: '돌돔' }],
};
const geminiText = (obj) => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }, finishReason: 'STOP' }] });

delete process.env.GEMINI_API_KEY;
calls = [];
handler = () => jsonRes({});
r = await callGemini({ url: 'https://youtube.com/shorts/LPLE_SH2b9U' });
check('gemini: 키 없음 → 503 gemini-not-configured', r.status === 503 && r.body.error === 'gemini-not-configured', JSON.stringify(r.body));
check('gemini(키 없음): 업스트림 호출 0', calls.length === 0, String(calls.length));

process.env.GEMINI_API_KEY = GEMINI_SECRET;
calls = [];
r = await callGemini({ url: 'https://youtube.com/shorts/LPLE_SH2b9U' }, 'GET');
check('gemini: GET → 405 (POST 만)', r.status === 405, String(r.status));
r = await callGemini({});
check('gemini: url 없음 → 400', r.status === 400 && r.body.error === 'missing-url', JSON.stringify(r.body));
r = await callGemini({ url: 'https://www.instagram.com/reel/C8xSg2pQ1K/' });
check(
  'gemini: 유튜브 아님 → 200 빈 결과',
  r.status === 200 && r.body.storeName === '' && Array.isArray(r.body.places) && r.body.places.length === 0,
  JSON.stringify(r.body)
);
check('gemini: 유튜브 아니면 업스트림 호출 없음', calls.length === 0, String(calls.length));
check('gemini(유튜브 아님): 키 노출 없음', !leaksSecret(r.raw), r.raw.slice(0, 80));

// 요청 모양 — 유튜브 URL 정규화 + 제목·설명글 + JSON 응답 모드
calls = [];
handler = () => jsonRes(geminiText('```json\n' + JSON.stringify(GEMINI_OK) + '\n```'));
r = await callGemini({ url: 'https://youtu.be/LPLE_SH2b9U?t=12', title: '제주 연동 엄마손횟집', description: '자연산 돌돔' });
const gReq = calls[0] || { url: '', init: {} };
const gBody = JSON.parse(gReq.init.body || '{}');
check(
  'gemini: 업스트림 엔드포인트(v1beta · gemini-3.5-flash-lite)',
  gReq.url === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  gReq.url
);
check(
  'gemini: 키는 x-goog-api-key 헤더(URL 에 없음)',
  gReq.init.headers['x-goog-api-key'] === GEMINI_SECRET && gReq.url.indexOf('key=') < 0,
  gReq.url
);
check(
  'gemini: youtu.be → watch 주소로 fileData',
  gBody.contents[0].parts[0].fileData.fileUri === 'https://www.youtube.com/watch?v=LPLE_SH2b9U',
  JSON.stringify(gBody.contents[0].parts[0])
);
check(
  'gemini: 제목·설명글도 함께 전송',
  gBody.contents[0].parts[1].text.indexOf('엄마손횟집') > 0 && gBody.contents[0].parts[1].text.indexOf('자연산 돌돔') > 0,
  gBody.contents[0].parts[1].text.slice(0, 120)
);
check(
  'gemini: responseMimeType=application/json (스키마 없이 JSON 모드)',
  gBody.generationConfig.responseMimeType === 'application/json' && !gBody.generationConfig.responseSchema,
  JSON.stringify(Object.keys(gBody.generationConfig || {}))
);
check(
  'gemini: 프롬프트가 JSON 키를 지정',
  String(gBody.contents[0].parts[1].text).indexOf('storeName') > 0 && String(gBody.contents[0].parts[1].text).indexOf('"places"') > 0,
  String(gBody.contents[0].parts[1].text).slice(0, 160)
);
check(
  'gemini: 첫 시도는 thinkingConfig 없이(lite 는 생각 없이 4초대)',
  !gBody.generationConfig.thinkingConfig,
  JSON.stringify(gBody.generationConfig.thinkingConfig)
);
check(
  'gemini: 응답 파싱(```json 울타리 제거)',
  r.status === 200 && r.body.storeName === '엄마손횟집' && r.body.area === '제주 연동' && r.body.category === '맛집',
  JSON.stringify(r.body)
);
check('gemini: places 배열 유지', r.body.places.length === 1 && r.body.places[0].name === '엄마손횟집', JSON.stringify(r.body.places));
check('gemini: 모델·출처 표시', r.body.model === 'gemini-3.5-flash-lite' && r.body.source === 'gemini', JSON.stringify([r.body.model, r.body.source]));
check('gemini: 생각 옵션 표시(생략)', r.body.thinking === 'off', String(r.body.thinking));
check('gemini: 걸린 시간(elapsedMs) 함께 반환', typeof r.body.elapsedMs === 'number' && r.body.elapsedMs >= 0, String(r.body.elapsedMs));
check('gemini: 응답에 키 없음', !leaksSecret(r.raw), r.raw.slice(0, 100));

// places 만 온 경우 → 첫 가게를 storeName 으로
handler = () => jsonRes(geminiText({ storeName: '', area: '', menu: '', category: '', places: [{ name: '디오디아2.0', area: '강남' }] }));
r = await callGemini({ url: 'https://www.youtube.com/watch?v=WtB53sC3weY' });
check('gemini: places 만 있어도 상호·동네를 채움', r.body.storeName === '디오디아2.0' && r.body.area === '강남', JSON.stringify(r.body));

// 가게를 못 찾음 / JSON 아님 / 업스트림 실패 → 모두 200 빈 결과
handler = () => jsonRes(geminiText({ storeName: '', area: '', menu: '', category: '', places: [] }));
r = await callGemini({ url: 'https://www.youtube.com/shorts/LPLE_SH2b9U' });
check('gemini: 가게 못 찾음 → 200 빈 결과', r.status === 200 && r.body.storeName === '' && r.body.places.length === 0, JSON.stringify(r.body));

handler = () => jsonRes(geminiText('죄송해요. 이 영상에서는 가게를 찾을 수 없습니다.'));
r = await callGemini({ url: 'https://www.youtube.com/shorts/LPLE_SH2b9U' });
check('gemini: JSON 아님 → 200 빈 결과', r.status === 200 && r.body.storeName === '' && r.body.reason === 'gemini-unparsed', JSON.stringify(r.body));

handler = () => errRes(500);
r = await callGemini({ url: 'https://www.youtube.com/shorts/LPLE_SH2b9U' });
check('gemini: 업스트림 500 → 200 빈 결과', r.status === 200 && r.body.storeName === '' && r.body.reason === 'gemini-upstream-500', JSON.stringify(r.body));
check('gemini(업스트림 실패): 키 노출 없음', !leaksSecret(r.raw), r.raw);

// thinkingConfig 를 모르는 모델(400) → 옵션 빼고 1회 재시도
calls = [];
let geminiTries = 0;
handler = () => {
  geminiTries += 1;
  return geminiTries === 1 ? errRes(400) : jsonRes(geminiText(GEMINI_OK));
};
r = await callGemini({ url: 'https://www.youtube.com/shorts/LPLE_SH2b9U' });
const retryBody = JSON.parse((calls[1] || { init: {} }).init.body || '{}');
check('gemini: 400 이면 생각 옵션을 바꿔 한 번 더 시도', calls.length === 2 && r.body.storeName === '엄마손횟집', calls.length + ' | ' + r.body.storeName);
check(
  'gemini: 2번째 시도는 thinkingLevel LOW (생각 줄이기 · Gemini 3 규격)',
  (retryBody.generationConfig || {}).thinkingConfig && retryBody.generationConfig.thinkingConfig.thinkingLevel === 'LOW',
  JSON.stringify(retryBody.generationConfig && retryBody.generationConfig.thinkingConfig)
);

// 400 이 계속되면 ③thinkingConfig 없이 한 번 더, 그래도 400 이면 중단(같은 요청 반복 금지)
calls = [];
handler = (url, init) => {
  const b = JSON.parse((init && init.body) || '{}');
  const gc = (b.generationConfig || {});
  if (!gc.thinkingConfig) return errRes(400);
  return errRes(400);
};
r = await callGemini({ url: 'https://www.youtube.com/shorts/LPLE_SH2b9U' });
const modes = calls.map((c) => {
  const gc = (JSON.parse(c.init.body || '{}').generationConfig || {});
  return gc.thinkingConfig ? (gc.thinkingConfig.thinkingLevel ? 'level' : 'budget') : 'off';
});
check('gemini: 400 이면 off → level → budget 순서로 시도', calls.length === 3 && JSON.stringify(modes) === JSON.stringify(['off', 'level', 'budget']), JSON.stringify(modes));
check('gemini: 세 번 다 400 이면 빈 결과로 끝', r.body.storeName === '' && r.body.reason === 'gemini-upstream-400', r.body.reason);

// 503(모델 과부하)은 잠깐 쉬고 한 번 더 — 무료 등급에서 흔함
calls = [];
let overloads = 0;
handler = () => {
  overloads += 1;
  return overloads === 1 ? errRes(503) : jsonRes(geminiText(GEMINI_OK));
};
r = await callGemini({ url: 'https://www.youtube.com/shorts/LPLE_SH2b9U' });
check('gemini: 503 이면 한 번 더 시도해 살림', calls.length === 2 && r.body.storeName === '엄마손횟집', calls.length + ' | ' + r.body.storeName);

calls = [];
handler = () => errRes(503);
r = await callGemini({ url: 'https://www.youtube.com/shorts/LPLE_SH2b9U' });
check('gemini: 503 이 계속되면 두 번에서 멈춤', calls.length === 2 && r.body.reason === 'gemini-upstream-503', calls.length + ' | ' + r.body.reason);

// 모델이 폐기·미제공(404)이면 다음 모델로 내려감
calls = [];
let geminiModelTry = 0;
handler = () => {
  geminiModelTry += 1;
  return geminiModelTry === 1 ? errRes(404) : jsonRes(geminiText(GEMINI_OK));
};
r = await callGemini({ url: 'https://www.youtube.com/shorts/LPLE_SH2b9U' });
check(
  'gemini: 모델 404 면 다음 모델(gemini-3.8-flash)로 폴백',
  calls.length === 2 && calls[1].url.indexOf('gemini-3.8-flash') > 0 && r.body.storeName === '엄마손횟집',
  calls.map((c) => c.url).join(' | ')
);
check('gemini: 실제 쓴 모델을 응답에 표시', r.body.model === 'gemini-3.8-flash', r.body.model);
check(
  'gemini: 3.8-flash 폴백은 thinkingLevel LOW 로 시작',
  JSON.parse((calls[1] || { init: {} }).init.body || '{}').generationConfig.thinkingConfig.thinkingLevel === 'LOW',
  JSON.stringify((JSON.parse((calls[1] || { init: {} }).init.body || '{}').generationConfig || {}).thinkingConfig)
);

// 쿼타·서버 오류(429·500)는 모델을 바꿔도 같으므로 한 번에 끝냄
calls = [];
handler = () => errRes(429);
r = await callGemini({ url: 'https://www.youtube.com/shorts/LPLE_SH2b9U' });
check('gemini: 429 는 모델 폴백 없이 빈 결과', calls.length === 1 && r.body.reason === 'gemini-upstream-429', calls.length + ' | ' + r.body.reason);
check('gemini: 응답 타임아웃 25초 이상', geminiHandler.GEMINI_TIMEOUT_MS >= 25000, String(geminiHandler.GEMINI_TIMEOUT_MS));
check('gemini: 전체 예산이 maxDuration(60초) 안', geminiHandler.TOTAL_BUDGET_MS <= 59000, String(geminiHandler.TOTAL_BUDGET_MS));
check('gemini: 기본 모델은 gemini-3.5-flash-lite', geminiHandler.DEFAULT_MODEL === 'gemini-3.5-flash-lite', geminiHandler.DEFAULT_MODEL);
delete process.env.GEMINI_MODEL;
check(
  'gemini: 모델 후보 순서(lite 우선 → 3.8 → 3.1-lite → 2.5, 중복 없음)',
  JSON.stringify(geminiHandler.modelCandidates()) ===
    JSON.stringify(['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']),
  JSON.stringify(geminiHandler.modelCandidates())
);
process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
check(
  'gemini: GEMINI_MODEL 이 기본 모델과 같아도 중복 없음',
  JSON.stringify(geminiHandler.modelCandidates()) ===
    JSON.stringify(['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']),
  JSON.stringify(geminiHandler.modelCandidates())
);
process.env.GEMINI_MODEL = 'gemini-3.8-flash';
check(
  'gemini: GEMINI_MODEL 을 주면 그것이 1순위',
  geminiHandler.modelCandidates()[0] === 'gemini-3.8-flash' && geminiHandler.modelCandidates()[1] === 'gemini-3.5-flash-lite',
  JSON.stringify(geminiHandler.modelCandidates())
);
delete process.env.GEMINI_MODEL;
check(
  'gemini: lite 는 thinkingConfig 없이 먼저, 그 밖은 LOW 로 먼저',
  JSON.stringify(geminiHandler.thinkingModesFor('gemini-3.5-flash-lite')) === JSON.stringify(['off', 'level', 'budget']) &&
    JSON.stringify(geminiHandler.thinkingModesFor('gemini-3.8-flash')) === JSON.stringify(['level', 'budget', 'off']),
  JSON.stringify([geminiHandler.thinkingModesFor('gemini-3.5-flash-lite'), geminiHandler.thinkingModesFor('gemini-3.8-flash')])
);
check(
  'gemini normalize: shorts·embed·watch·youtu.be',
  geminiHandler.normalizeYouTubeUrl('https://www.youtube.com/shorts/LPLE_SH2b9U') === 'https://www.youtube.com/watch?v=LPLE_SH2b9U' &&
    geminiHandler.normalizeYouTubeUrl('https://m.youtube.com/watch?v=LPLE_SH2b9U&t=3') === 'https://www.youtube.com/watch?v=LPLE_SH2b9U' &&
    geminiHandler.normalizeYouTubeUrl('https://www.youtube.com/embed/LPLE_SH2b9U') === 'https://www.youtube.com/watch?v=LPLE_SH2b9U',
  geminiHandler.normalizeYouTubeUrl('https://m.youtube.com/watch?v=LPLE_SH2b9U&t=3')
);
check('gemini normalize: 유튜브 사칭 주소 거부', geminiHandler.normalizeYouTubeUrl('https://youtube.com.evil.com/shorts/LPLE_SH2b9U') === '');
check('gemini parse: 잡담 섞인 JSON 도 파싱', geminiHandler.parseJsonLoose('결과: {"storeName":"A","places":[]} 입니다').storeName === 'A');
delete process.env.GEMINI_API_KEY;

// ── 7. 4초 타임아웃 (응답이 영영 안 오는 업스트림) ──────────
globalThis.fetch = (url, init = {}) =>
  new Promise((resolve, reject) => {
    if (init && init.signal) {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }
  });
const started = Date.now();
r = await call(kakaoHandler, { query: '성수' });
const elapsed = Date.now() - started;
check('kakao: 타임아웃 → 504', r.status === 504 && r.body.error === 'kakao-timeout', JSON.stringify(r.body));
check('kakao: 실제로 4초 안에 끊김', elapsed >= 3800 && elapsed < 6000, elapsed + 'ms');
check('kakao(타임아웃): 키 노출 없음', !leaksSecret(r.raw), r.raw);

// ── 8. api/*.js 는 Vercel Node 함수 규격(module.exports = handler) ──
const root = process.cwd(); // run-tests.mjs 가 프로젝트 루트에서 실행합니다
['youtube.js', 'kakao-local.js', 'naver-local.js', 'resolve-url.js', 'gemini.js'].forEach((file) => {
  const src = fs.readFileSync(path.join(root, 'api', file), 'utf8');
  check('api/' + file + ': module.exports = async function', /module\.exports\s*=\s*async\s+function/.test(src));
  check('api/' + file + ': 키를 응답에 직접 넣지 않음', !/sendJson\([^)]*process\.env/.test(src));
});

// server/http.js 공용 모듈이 api 밖에 있는지 (Vercel 함수로 배포되지 않도록)
check('server/http.js 분리', fs.existsSync(path.join(root, 'server', 'http.js')));

// ═════════════════════════════════════════════════════════════
// 10. v2.0 — /api/resolve-url (단축 링크 목적지 + SSRF 방어)
// ═════════════════════════════════════════════════════════════
// 7번에서 '영영 응답 없는' fetch 로 바꿔 두었으니, 여기서 표준 스텁으로 되돌립니다.
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return handler(String(url), init);
};

const redirectRes = (location, status = 302) => ({
  ok: false,
  status,
  headers: { get: (name) => (String(name).toLowerCase() === 'location' ? location : null) },
  text: async () => '',
  json: async () => ({}),
});
const htmlUpstream = (html, status = 200) => ({
  ok: status < 400,
  status,
  headers: { get: () => null },
  text: async () => html,
  json: async () => ({}),
});

const NAVER_PLACE_HTML_API =
  '<html><head><meta property="og:title" content="칸다소바 : 네이버" /></head><body>' +
  '<a href="https://nmap.place.naver.com/launchApp/route?path=route&amp;type=place&amp;dlat=37.5492716&amp;dlng=126.9227124&amp;did=1736095566&amp;dname=%EC%B9%B8%EB%8B%A4%EC%86%8C%EB%B0%94">길찾기</a>' +
  '<a href="#" data-line-description="서울 마포구 와우산로 51-6">공유</a>' +
  '<a href="tel:0507-1375-1660">전화</a></body></html>';

r = await call(resolveUrlHandler, {});
check('resolve: url 없음 → 400', r.status === 400 && r.body.error === 'missing-url', JSON.stringify(r.body));
r = await call(resolveUrlHandler, { url: 'https://naver.me/x' }, 'POST');
check('resolve: POST → 405', r.status === 405, String(r.status));

calls = [];
r = await call(resolveUrlHandler, { url: 'https://evil.example.com/x' });
check('resolve: 허용 목록 밖 호스트 → 403', r.status === 403 && r.body.error === 'host-not-allowed', JSON.stringify(r.body));
check('resolve: 허용 목록 밖은 요청조차 안 함', calls.length === 0, JSON.stringify(calls));
check('resolve: 허용 호스트 목록에 naver.me·map·m.place 포함', ['naver.me', 'map.naver.com', 'm.place.naver.com'].every((h) => ALLOWED_HOSTS.indexOf(h) >= 0), ALLOWED_HOSTS.join(','));

for (const [label, bad] of [
  ['IP 주소', 'http://127.0.0.1/admin'],
  ['내부망 메타데이터', 'http://169.254.169.254/latest/meta-data/'],
  ['사설 IP', 'https://10.0.0.5/'],
  ['자격증명 포함', 'https://user:pass@naver.me/x'],
  ['이상한 포트', 'https://naver.me:8080/x'],
  ['file 스킴', 'file:///etc/passwd'],
]) {
  calls = [];
  r = await call(resolveUrlHandler, { url: bad });
  check('resolve: ' + label + ' 거부', r.status === 403 || r.status === 400, String(r.status));
  check('resolve: ' + label + ' 요청 없음', calls.length === 0, JSON.stringify(calls));
}

// 정상: naver.me → m.place.naver.com
calls = [];
handler = (url) => {
  if (url === 'https://naver.me/GabcdEfg') return redirectRes('https://m.place.naver.com/restaurant/1736095566/home');
  if (url.indexOf('https://m.place.naver.com/restaurant/1736095566/home') === 0) return htmlUpstream(NAVER_PLACE_HTML_API);
  return htmlUpstream('');
};
r = await call(resolveUrlHandler, { url: 'https://naver.me/GabcdEfg' });
check('resolve: naver.me → 200', r.status === 200, JSON.stringify(r.body));
check('resolve: 최종 주소', r.body.url === 'https://m.place.naver.com/restaurant/1736095566/home', r.body.url);
check('resolve: placeId 추출', r.body.naverPlaceId === '1736095566', r.body.naverPlaceId);
check('resolve: kind=naver-place', r.body.kind === 'naver-place', r.body.kind);
check('resolve: 제목', r.body.title === '칸다소바', r.body.title);
check('resolve: 좌표', Math.abs(r.body.lat - 37.5492716) < 1e-9 && Math.abs(r.body.lng - 126.9227124) < 1e-9, JSON.stringify([r.body.lat, r.body.lng]));
check('resolve: 주소·전화', r.body.address === '서울 마포구 와우산로 51-6' && r.body.phone === '0507-1375-1660', JSON.stringify([r.body.address, r.body.phone]));
check('resolve: 리다이렉트는 manual 로 따라감', calls[0].init.redirect === 'manual', String(calls[0] && calls[0].init.redirect));
check('resolve: 캐시 헤더', String(r.headers['cache-control'] || '').indexOf('s-maxage') > 0, JSON.stringify(r.headers));

// 허용 목록 밖으로 튕기는 리다이렉트는 중단 + 그 호스트로 요청하지 않음
calls = [];
handler = (url) => (url === 'https://naver.me/evil' ? redirectRes('https://evil.example.com/take-key') : htmlUpstream(''));
r = await call(resolveUrlHandler, { url: 'https://naver.me/evil' });
check('resolve: 밖으로 튕기는 리다이렉트 → 403', r.status === 403 && r.body.error === 'redirect-not-allowed', JSON.stringify(r.body));
check('resolve: 악성 호스트로 요청 없음', !calls.some((c) => c.url.indexOf('evil.example.com') >= 0), JSON.stringify(calls.map((c) => c.url)));

// 리다이렉트 3홉 초과
calls = [];
handler = () => redirectRes('https://naver.me/loop');
r = await call(resolveUrlHandler, { url: 'https://naver.me/loop' });
check('resolve: 리다이렉트 무한 루프 → 400', r.status === 400 && r.body.error === 'too-many-redirects', JSON.stringify(r.body));
check('resolve: 홉 수 제한(4회 이하)', calls.length <= 4, String(calls.length));

// youtu.be → youtube.com/watch (영상 ID)
calls = [];
handler = (url) => (url === 'https://youtu.be/2QZPPEle9IY' ? redirectRes('https://www.youtube.com/watch?v=2QZPPEle9IY&feature=share') : htmlUpstream('<title>제목</title>'));
r = await call(resolveUrlHandler, { url: 'https://youtu.be/2QZPPEle9IY' });
check('resolve: youtu.be 목적지', r.status === 200 && r.body.videoId === '2QZPPEle9IY', JSON.stringify(r.body));
check('resolve: youtube kind', r.body.kind === 'youtube', r.body.kind);
check('resolve: youtube 좌표는 비움', r.body.lat === null && r.body.naverPlaceId === '', JSON.stringify(r.body));

// 업스트림 오류·타임아웃
handler = () => htmlUpstream('', 500);
r = await call(resolveUrlHandler, { url: 'https://map.naver.com/p/entry/place/1736095566' });
check('resolve: 업스트림 500 → 502', r.status === 502 && r.body.error === 'upstream-failed', JSON.stringify(r.body));
handler = () => {
  throw new Error('network-down');
};
r = await call(resolveUrlHandler, { url: 'https://map.naver.com/p/entry/place/1736095566' });
check('resolve: 네트워크 실패 → 504', r.status === 504 && r.body.error === 'resolve-timeout', JSON.stringify(r.body));

// 정규화·파서 단위
check('resolve normalize: www 제거 후 허용', normalizeTarget('https://www.naver.me/x').url === 'https://naver.me/x', JSON.stringify(normalizeTarget('https://www.naver.me/x')));
check('resolve normalize: http → https 승격', normalizeTarget('http://map.naver.com/p/entry/place/1').url === 'https://map.naver.com/p/entry/place/1', JSON.stringify(normalizeTarget('http://map.naver.com/p/entry/place/1')));
check('resolve normalize: 서브도메인 사칭 거부', normalizeTarget('https://naver.me.evil.com/x').error === 'host-not-allowed');
check('resolve normalize: 긴 URL 거부', normalizeTarget('https://naver.me/' + 'a'.repeat(600)).error === 'invalid-url');
check('resolve api: placeId 패턴', apiExtractNaverPlaceId('https://map.naver.com/p/entry/place/1736095566') === '1736095566');
check('resolve api: 페이지 파서 이름·좌표', apiParseNaverPlaceHtml(NAVER_PLACE_HTML_API).title === '칸다소바' && Math.abs(apiParseNaverPlaceHtml(NAVER_PLACE_HTML_API).lat - 37.5492716) < 1e-9);
check('resolve api: 키·본문이 응답에 없음', !leaksSecret(r.raw), r.raw.slice(0, 120));
check('resolve: 전체 시간 예산이 함수 제한(10초) 안', resolveUrlHandlerTotal <= 9000, String(resolveUrlHandlerTotal));


// ── 9. vercel.json 배포 설정 ──────────────────────────────
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
// v2.0 — 빌드 마지막에 PWA 메타 주입 스크립트가 붙습니다. (그래야 홈 화면 아이콘·manifest 가 실제로 나갑니다)
check(
  'vercel.json: 빌드 명령 (expo export + PWA 메타 주입)',
  vercel.buildCommand === 'npx expo export --platform web && node scripts/patch-web-html.mjs',
  vercel.buildCommand
);
check('vercel.json: PWA 메타 주입 스크립트 존재', fs.existsSync(path.join(root, 'scripts', 'patch-web-html.mjs')));
check('vercel.json: 출력 폴더 dist', vercel.outputDirectory === 'dist', vercel.outputDirectory);
check('vercel.json: api/*.js 함수 설정', Object.keys(vercel.functions || {}).indexOf('api/*.js') >= 0, JSON.stringify(Object.keys(vercel.functions || {})));
check(
  'vercel.json: /api/gemini 만 maxDuration 60초 · 나머지는 10초',
  (vercel.functions['api/gemini.js'] || {}).maxDuration === 60 && (vercel.functions['api/*.js'] || {}).maxDuration === 10,
  JSON.stringify(vercel.functions)
);
// Vercel 은 파일마다 '처음 매칭되는 키' 하나만 씁니다. 와이드 패턴이 먼저 오면 api/gemini.js 키는
// 'unused_function' 빌드 오류가 됩니다 → 구체 패턴이 반드시 앞에 와야 합니다.
check(
  'vercel.json: 구체 패턴(api/gemini.js)이 와이드(api/*.js)보다 앞',
  Object.keys(vercel.functions || {})[0] === 'api/gemini.js',
  JSON.stringify(Object.keys(vercel.functions || {}))
);
const rewrite = (vercel.rewrites || [])[0] || {};
check('vercel.json: SPA rewrite → index.html', rewrite.destination === '/index.html', JSON.stringify(rewrite));
check('vercel.json: /api 는 rewrite 제외', String(rewrite.source).indexOf('(?!api/)') > 0, String(rewrite.source));
check('vercel.json: 확장자 있는 파일(js·png) 은 rewrite 제외', String(rewrite.source).indexOf('(?!.*\\.)') > 0, String(rewrite.source));

if (fails) {
  console.log('\nAPI_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nAPI_TESTS_OK');
