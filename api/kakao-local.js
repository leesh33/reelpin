/**
 * api/kakao-local.js — Vercel Serverless Function
 * ─────────────────────────────────────────────────────────────
 * GET /api/kakao-local?query=<검색어>&size=<1~15>
 *
 * 카카오 로컬 키워드 검색을 **서버에서** 대신 호출하고 응답(JSON)을 그대로 전달합니다.
 *   → 브라우저 CORS 차단 없음, 키는 브라우저 번들에 없음.
 *
 * 키: 서버 환경변수 `KAKAO_REST_API_KEY` (또는 `EXPO_PUBLIC_KAKAO_REST_API_KEY`)
 * 실패 응답에는 키·업스트림 본문을 담지 않습니다.
 */
const { queryParam, rawParam, fetchWithTimeout, sendJson, isGet, readJson, warn } = require('../server/http.js');

const KAKAO_KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';

function clampSize(value) {
  const n = Number(String(value == null ? '' : value).trim());
  if (!Number.isFinite(n)) return 3;
  return Math.min(15, Math.max(1, Math.trunc(n)));
}

module.exports = async function handler(req, res) {
  if (!isGet(req)) return sendJson(res, 405, { error: 'method-not-allowed' });

  const query = queryParam(req, 'query', 120);
  if (!query) return sendJson(res, 400, { error: 'missing-query', message: 'query(검색어)가 필요합니다.' });

  const key = process.env.KAKAO_REST_API_KEY || process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';
  if (!key) return sendJson(res, 503, { error: 'kakao-key-missing' });

  const size = clampSize(rawParam(req, 'size'));
  const url =
    KAKAO_KEYWORD_ENDPOINT +
    '?query=' +
    encodeURIComponent(query) +
    '&size=' +
    size +
    '&sort=accuracy';

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Authorization: 'KakaoAK ' + key },
  });
  if (!response) {
    warn('kakao-local: network/timeout');
    return sendJson(res, 504, { error: 'kakao-timeout' });
  }
  if (!response.ok) {
    warn('kakao-local: upstream ' + response.status);
    return sendJson(res, 502, { error: 'kakao-failed', status: response.status });
  }

  const json = await readJson(response);
  if (!json) return sendJson(res, 502, { error: 'kakao-bad-body' });

  // 카카오 응답({ documents, meta })을 그대로 — 앱의 파싱 코드를 바꾸지 않아도 됩니다.
  return sendJson(res, 200, json, 300);
};
