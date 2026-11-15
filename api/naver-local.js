/**
 * api/naver-local.js — Vercel Serverless Function
 * ─────────────────────────────────────────────────────────────
 * GET /api/naver-local?query=<검색어>&display=<1~5>
 *
 * 네이버 지역검색을 **서버에서** 대신 호출하고 응답(JSON)을 그대로 전달합니다.
 *   → 네이버는 CORS 헤더를 주지 않아 브라우저에서는 늘 막혔지만,
 *     이 프록시를 거치면 웹에서도 네이버 결과가 나옵니다. 키도 브라우저에 없습니다.
 *
 * 키: `NAVER_HUB_CLIENT_ID` / `NAVER_HUB_CLIENT_SECRET`
 *     (또는 `EXPO_PUBLIC_NAVER_HUB_CLIENT_ID` / `EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET`)
 *     HUB 키가 없고 구 개발자센터 키만 있으면 그 규격으로 호출합니다.
 *     `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` (또는 EXPO_PUBLIC_*)
 */
const { queryParam, rawParam, fetchWithTimeout, sendJson, isGet, readJson, warn } = require('../server/http.js');

/** 2026년 7월 말 이후 신규 규격 — 네이버 클라우드 플랫폼 NAVER API HUB */
const NAVER_HUB_LOCAL_ENDPOINT = 'https://naverapihub.apigw.ntruss.com/search/v1/local';
/** 구 개발자센터 규격 (기존 키만 동작) — 하위 호환 */
const NAVER_LEGACY_LOCAL_ENDPOINT = 'https://openapi.naver.com/v1/search/local.json';

function clampDisplay(value) {
  const n = Number(String(value == null ? '' : value).trim());
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.trunc(n))); // 두 규격 모두 display 상한이 5입니다.
}

/** 어느 규격으로 호출할지 — 키가 반쪽만 있으면 그 규격은 건너뜁니다. */
function credentials() {
  const hubId = process.env.NAVER_HUB_CLIENT_ID || process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_ID || '';
  const hubSecret =
    process.env.NAVER_HUB_CLIENT_SECRET || process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET || '';
  if (hubId && hubSecret) return { mode: 'hub', id: hubId, secret: hubSecret };

  const legacyId = process.env.NAVER_CLIENT_ID || process.env.EXPO_PUBLIC_NAVER_CLIENT_ID || '';
  const legacySecret = process.env.NAVER_CLIENT_SECRET || process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET || '';
  if (legacyId && legacySecret) return { mode: 'legacy', id: legacyId, secret: legacySecret };

  return null;
}

module.exports = async function handler(req, res) {
  if (!isGet(req)) return sendJson(res, 405, { error: 'method-not-allowed' });

  const query = queryParam(req, 'query', 120);
  if (!query) return sendJson(res, 400, { error: 'missing-query', message: 'query(검색어)가 필요합니다.' });

  const creds = credentials();
  if (!creds) return sendJson(res, 503, { error: 'naver-key-missing' });

  const display = clampDisplay(rawParam(req, 'display'));
  const request =
    creds.mode === 'hub'
      ? {
          url:
            NAVER_HUB_LOCAL_ENDPOINT +
            '?query=' +
            encodeURIComponent(query) +
            '&display=' +
            display +
            '&sort=comment' +
            '&format=json',
          headers: {
            'X-NCP-APIGW-API-KEY-ID': creds.id,
            'X-NCP-APIGW-API-KEY': creds.secret,
          },
        }
      : {
          url:
            NAVER_LEGACY_LOCAL_ENDPOINT +
            '?query=' +
            encodeURIComponent(query) +
            '&display=' +
            display,
          headers: {
            'X-Naver-Client-Id': creds.id,
            'X-Naver-Client-Secret': creds.secret,
          },
        };

  const response = await fetchWithTimeout(request.url, { method: 'GET', headers: request.headers });
  if (!response) {
    warn('naver-local: network/timeout (' + creds.mode + ')');
    return sendJson(res, 504, { error: 'naver-timeout' });
  }
  if (!response.ok) {
    warn('naver-local: upstream ' + response.status + ' (' + creds.mode + ')');
    return sendJson(res, 502, { error: 'naver-failed', status: response.status });
  }

  const json = await readJson(response);
  if (!json) return sendJson(res, 502, { error: 'naver-bad-body' });

  // 네이버 응답({ items: [...] })을 그대로 — 앱의 파싱 코드를 바꾸지 않아도 됩니다.
  return sendJson(res, 200, json, 300);
};
