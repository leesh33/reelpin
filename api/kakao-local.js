/**
 * api/kakao-local.js — Vercel Serverless Function
 * ─────────────────────────────────────────────────────────────
 * GET /api/kakao-local?query=<검색어>&size=<1~15>[&x=<경도>&y=<위도>&radius=<m>&sort=distance]
 *
 * 카카오 로컬 키워드 검색을 **서버에서** 대신 호출하고 응답(JSON)을 그대로 전달합니다.
 *   → 브라우저 CORS 차단 없음, 키는 브라우저 번들에 없음.
 *
 * v2.26 — `x`·`y`·`radius`·`sort=distance` 를 그대로 전달합니다 (카카오 공식 인자).
 *   사진으로 찾기에서 **사진을 찍은 자리와 가까운 순서**로 결과를 받을 때 씁니다.
 *   좌표가 없거나 잘못되면 기존처럼 `sort=accuracy` 로 부릅니다.
 *
 * 키: 서버 환경변수 `KAKAO_REST_API_KEY` (또는 `EXPO_PUBLIC_KAKAO_REST_API_KEY`)
 * 실패 응답에는 키·업스트림 본문을 담지 않습니다.
 */
const { queryParam, rawParam, fetchWithTimeout, sendJson, isGet, readJson, warn } = require('../server/http.js');

const KAKAO_KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';
/** 카카오 키워드 검색 radius 상한(m) — 문서 규격 */
const KAKAO_RADIUS_MAX = 20000;

function clampSize(value) {
  const n = Number(String(value == null ? '' : value).trim());
  if (!Number.isFinite(n)) return 3;
  return Math.min(15, Math.max(1, Math.trunc(n)));
}

/** 좌표 숫자만 통과 (경도 x · 위도 y). 좌표가 반쪽만 오면 둘 다 버립니다. */
function coordinatesOf(req) {
  const x = Number(String(rawParam(req, 'x') || '').trim());
  const y = Number(String(rawParam(req, 'y') || '').trim());
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > 180 || Math.abs(y) > 90) return null;
  if (x === 0 && y === 0) return null;
  const radiusRaw = Number(String(rawParam(req, 'radius') || '').trim());
  const radius =
    Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(KAKAO_RADIUS_MAX, Math.trunc(radiusRaw)) : 5000;
  return { x, y, radius };
}

module.exports = async function handler(req, res) {
  if (!isGet(req)) return sendJson(res, 405, { error: 'method-not-allowed' });

  const query = queryParam(req, 'query', 120);
  if (!query) return sendJson(res, 400, { error: 'missing-query', message: 'query(검색어)가 필요합니다.' });

  const key = process.env.KAKAO_REST_API_KEY || process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';
  if (!key) return sendJson(res, 503, { error: 'kakao-key-missing' });

  const size = clampSize(rawParam(req, 'size'));
  const coords = coordinatesOf(req);
  const sortByDistance =
    String(queryParam(req, 'sort', 20) || '').trim().toLowerCase() === 'distance' && Boolean(coords);
  const url =
    KAKAO_KEYWORD_ENDPOINT +
    '?query=' +
    encodeURIComponent(query) +
    '&size=' +
    size +
    '&sort=' +
    (sortByDistance ? 'distance' : 'accuracy') +
    (sortByDistance
      ? '&x=' + coords.x + '&y=' + coords.y + '&radius=' + coords.radius
      : '');

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
