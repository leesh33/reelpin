/**
 * server/http.js
 * ─────────────────────────────────────────────────────────────
 * Vercel Serverless Functions(`api/*.js`)가 함께 쓰는 작은 도우미 모음.
 *
 * 지켜야 할 규칙
 *   1. **키는 절대 응답에 담지 않습니다.** 실패는 `{ error, status }` 같은
 *      고정된 모양으로만 돌려주고, 업스트림 본문·헤더는 성공했을 때만 그대로 전달합니다.
 *   2. 모든 업스트림 호출은 4초 안에 끊습니다. (Vercel 무료 플랜 함수 시간 보호)
 *   3. 같은 출처(우리 사이트)에서만 호출되도록 CORS 헤더를 열지 않습니다.
 *      → 다른 사이트가 우리 API 키로 검색하지 못합니다.
 */

/** 업스트림 타임아웃 — 요구사항: 4초 */
const TIMEOUT_MS = 4000;

/** 문자열 정리: 공백 제거 + 최대 길이 제한 */
function cleanParam(value, maxLength) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  return text.slice(0, maxLength);
}

/** 잘못된 퍼센트 인코딩(`%zz`)에도 예외 없이 원문을 돌려줍니다. */
function decodeSafe(value) {
  const text = String(value == null ? '' : value).replace(/\+/g, ' ');
  try {
    return decodeURIComponent(text);
  } catch (e) {
    return text;
  }
}

/** 쿼리에서 안전한 문자열 하나를 꺼냅니다. (없으면 '') */
function queryParam(req, name, maxLength = 120) {
  const query = (req && req.query) || {};
  if (query[name] != null) return cleanParam(query[name], maxLength);
  // req.query 가 비어 오는 런타임/테스트를 위한 폴백 — req.url 의 쿼리스트링에서 읽습니다.
  const url = String((req && req.url) || '');
  const qs = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1) : '';
  if (!qs) return '';
  for (const pair of qs.split('&')) {
    const i = pair.indexOf('=');
    const key = decodeSafe(i < 0 ? pair : pair.slice(0, i));
    if (key !== name) continue;
    return cleanParam(decodeSafe(i < 0 ? '' : pair.slice(i + 1)), maxLength);
  }
  return '';
}

/** 크기·개수 같은 숫자 쿼리 — req.query 가 없으면 req.url 에서 읽습니다. */
function rawParam(req, name) {
  const query = (req && req.query) || {};
  if (query[name] != null) return query[name];
  const url = String((req && req.url) || '');
  const m = new RegExp('[?&]' + name + '=([^&]*)').exec(url);
  return m ? decodeSafe(m[1]) : '';
}

/**
 * `fetch` 를 ms 안에 끊습니다. 실패·타임아웃은 예외 없이 `null`.
 * @returns {Promise<Response|null>}
 */
async function fetchWithTimeout(url, init = {}, timeoutMs = TIMEOUT_MS) {
  if (typeof fetch !== 'function') return null;
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        /* 이미 끝난 요청 */
      }
    }, ms);
  }
  try {
    return await fetch(url, controller ? { ...init, signal: controller.signal } : init);
  } catch (e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** JSON 응답. 캐시 헤더는 선택. */
function sendJson(res, status, body, cacheSeconds) {
  try {
    res.statusCode = status;
    if (typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      // 같은 출처에서만 쓰는 프록시 — 다른 사이트에 열어 주지 않습니다.
      res.setHeader('Vary', 'Origin');
      if (cacheSeconds > 0) res.setHeader('Cache-Control', 'public, s-maxage=' + cacheSeconds + ', stale-while-revalidate=60');
      else res.setHeader('Cache-Control', 'no-store');
    }
    res.end(JSON.stringify(body));
  } catch (e) {
    /* 응답이 이미 닫힌 경우 */
  }
}

/** GET 만 허용 */
function isGet(req) {
  return String((req && req.method) || 'GET').toUpperCase() === 'GET';
}

/** 업스트림 응답 → JSON (실패하면 null). 본문은 키를 담지 않습니다. */
async function readJson(response) {
  if (!response || !response.ok || typeof response.json !== 'function') return null;
  try {
    return await response.json();
  } catch (e) {
    return null;
  }
}

/** 로그 한 줄 — 키 값은 절대 찍지 않습니다. */
function warn(message) {
  try {
    console.warn('[reelpin-api] ' + message);
  } catch (e) {
    /* no-op */
  }
}

module.exports = {
  TIMEOUT_MS,
  cleanParam,
  queryParam,
  rawParam,
  fetchWithTimeout,
  sendJson,
  isGet,
  readJson,
  warn,
};
