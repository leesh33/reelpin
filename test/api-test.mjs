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

const SECRETS = ['YOUTUBE_SECRET_KEY', 'KAKAO_SECRET_KEY', 'HUB_SECRET_KEY', 'LEGACY_SECRET_KEY'];
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
['youtube.js', 'kakao-local.js', 'naver-local.js'].forEach((file) => {
  const src = fs.readFileSync(path.join(root, 'api', file), 'utf8');
  check('api/' + file + ': module.exports = async function', /module\.exports\s*=\s*async\s+function/.test(src));
  check('api/' + file + ': 키를 응답에 직접 넣지 않음', !/sendJson\([^)]*process\.env/.test(src));
});

// server/http.js 공용 모듈이 api 밖에 있는지 (Vercel 함수로 배포되지 않도록)
check('server/http.js 분리', fs.existsSync(path.join(root, 'server', 'http.js')));

// ── 9. vercel.json 배포 설정 ──────────────────────────────
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
check('vercel.json: 빌드 명령', vercel.buildCommand === 'npx expo export --platform web', vercel.buildCommand);
check('vercel.json: 출력 폴더 dist', vercel.outputDirectory === 'dist', vercel.outputDirectory);
check('vercel.json: api/*.js 함수 설정', Object.keys(vercel.functions || {}).indexOf('api/*.js') >= 0, JSON.stringify(Object.keys(vercel.functions || {})));
const rewrite = (vercel.rewrites || [])[0] || {};
check('vercel.json: SPA rewrite → index.html', rewrite.destination === '/index.html', JSON.stringify(rewrite));
check('vercel.json: /api 는 rewrite 제외', String(rewrite.source).indexOf('(?!api/)') > 0, String(rewrite.source));
check('vercel.json: 확장자 있는 파일(js·png) 은 rewrite 제외', String(rewrite.source).indexOf('(?!.*\\.)') > 0, String(rewrite.source));

if (fails) {
  console.log('\nAPI_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nAPI_TESTS_OK');
