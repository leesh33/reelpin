/**
 * api/resolve-url.js — Vercel Serverless Function (v2.0)
 * ─────────────────────────────────────────────────────────────
 * GET /api/resolve-url?url=<단축·네이버 지도 링크>
 *
 * `naver.me/…` 같은 단축 링크는 **리다이렉트를 따라가야** 목적지(플레이스 ID)를 알 수 있는데,
 * 브라우저는 CORS 로 그 응답을 읽지 못합니다. 그래서 서버가 대신 따라가고,
 * 목적지 주소에서 뽑은 **placeId·제목·좌표·주소·전화**만 돌려줍니다.
 *
 * ⚠️ SSRF 방지 (이 파일에서 가장 중요한 부분)
 *   1. **허용 호스트 화이트리스트**만 요청합니다 — naver.me · map.naver.com · m.place.naver.com ·
 *      place.naver.com · youtu.be · youtube.com (www./m. 는 정규화해서 같은 값으로 봅니다).
 *      IP 주소·내부망(localhost·169.254·10.x)·다른 사이트는 첫 요청부터 거부합니다.
 *   2. **리다이렉트도 직접 따라가며 매 홉을 다시 검사**합니다(`redirect: 'manual'`).
 *      허용 목록 밖으로 튕기는 리다이렉트는 즉시 중단합니다. (최대 3홉)
 *   3. 사용자 이름·비밀번호가 들어간 주소(`https://a:b@host`)와 기본 포트가 아닌 주소는 거부합니다.
 *   4. 업스트림 본문·헤더·키는 **응답에 담지 않습니다.** 실패는 고정된 모양(`{ error }`)으로만.
 *   5. 모든 요청은 4초 안에 끊습니다. (Vercel 무료 플랜 함수 시간 보호)
 *
 * 응답(200): { ok:true, url, kind, naverPlaceId, videoId, title, lat, lng, address, phone }
 */
const { queryParam, fetchWithTimeout, sendJson, isGet, warn } = require('../server/http.js');

/** 요청을 허용하는 호스트 — 여기 없는 곳으로는 **한 번도** 요청하지 않습니다. */
const ALLOWED_HOSTS = [
  'naver.me',
  'map.naver.com',
  'm.place.naver.com',
  'place.naver.com',
  'youtu.be',
  'youtube.com',
  'm.youtube.com',
];

const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 500;
const MAX_HTML_CHARS = 500000;
/** 한 번의 요청에 쓰는 시간 상한 — Vercel 함수 제한(10초) 안에서 리다이렉트를 다 따라가기 위한 총 예산 */
const TOTAL_TIMEOUT_MS = 8000;
/** 홉 하나가 기다리는 최대 시간 */
const HOP_TIMEOUT_MS = 4000;

/** 네이버 지도·플레이스 링크의 placeId 패턴 (앱 `src/utils/links.js` 와 같은 규칙) */
const NAVER_PLACE_PATTERNS = [
  /map\.naver\.com\/p\/entry\/place\/(\d{5,})/i,
  /map\.naver\.com\/p\/place\/(\d{5,})/i,
  /map\.naver\.com\/v5\/entry\/place\/(\d{5,})/i,
  /(?:m\.)?place\.naver\.com\/(?:place|restaurant|hairshop|hospital|accommodation|cafe|store|school|attraction)\/(\d{5,})/i,
  /(?:m\.)?place\.naver\.com\/[a-z]+\/(\d{5,})/i,
];

/** 문자열에서 네이버 placeId (없으면 '') */
function extractNaverPlaceId(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{5,}$/.test(s)) return s;
  for (const re of NAVER_PLACE_PATTERNS) {
    const m = s.match(re);
    if (m && m[1]) return m[1];
  }
  return '';
}

/** 유튜브 영상 ID (youtu.be · shorts · watch) */
function extractVideoId(value) {
  const s = String(value || '');
  const m =
    s.match(/youtu\.be\/([A-Za-z0-9_-]{6,20})/) ||
    s.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,20})/) ||
    s.match(/[?&]v=([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : '';
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * 네이버 플레이스 페이지 HTML → { title, lat, lng, address, phone }
 *   · 이름  : og:title ('칸다소바 : 네이버' → '칸다소바'), 없으면 지도 앱 링크의 dname
 *   · 좌표  : 지도 앱 길찾기 링크의 dlat/dlg (placeId 에 묶인 좌표)
 *   · 주소  : 공유 버튼의 data-line-description
 *   · 전화  : tel: 링크
 * (앱의 `parseNaverPlaceHtml` 과 같은 규칙 — 양쪽 테스트가 같은 예시를 씁니다)
 */
function parseNaverPlaceHtml(html) {
  const text = String(html || '');
  if (!text) return { title: '', lat: null, lng: null, address: '', phone: '' };
  const ogTitle = (text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || [])[1];
  const titleTag = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const cleanName = (value) =>
    decodeEntities(String(value || '').replace(/<[^>]*>/g, ''))
      .replace(/[\u0000-\u001f]/g, ' ')
      .replace(/\s*[:\-|]\s*네이버.*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  let title = cleanName(ogTitle || titleTag);
  if (/^네이버\s*(지도|플레이스)?$/i.test(title)) title = '';
  // `&amp;` 가 그대로 들어 있는 HTML 도 있어서 한 번 풀고 읽습니다.
  const flat = text.replace(/&amp;/g, '&');
  const dname = (flat.match(/[?&]dname=([^&"'\\]{2,80})/) || [])[1];
  if (!title && dname) {
    try {
      title = cleanName(decodeURIComponent(dname));
    } catch (e) {
      title = cleanName(dname);
    }
  }
  const lat = Number((flat.match(/[?&]dlat=([0-9]{1,3}\.[0-9]{4,})/) || [])[1]);
  const lng = Number((flat.match(/[?&]dlng=([0-9]{1,3}\.[0-9]{4,})/) || [])[1]);
  const address = decodeEntities((text.match(/data-line-description="([^"]{4,120})"/) || [])[1] || '').trim();
  const phone = String((text.match(/href="tel:([0-9+\-]{7,20})"/) || [])[1] || '').trim();
  return {
    title,
    lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
    lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null,
    address,
    phone,
  };
}

/**
 * 입력 주소 검사 → { url, host } 또는 { error }
 * IP·내부망·다른 사이트·이상한 포트는 여기서 걸립니다.
 */
function normalizeTarget(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text || text.length > MAX_URL_LENGTH) return { error: 'invalid-url' };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
  } catch (e) {
    return { error: 'invalid-url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'invalid-scheme' };
  if (url.username || url.password) return { error: 'invalid-url' };
  if (url.port && url.port !== '80' && url.port !== '443') return { error: 'invalid-port' };
  const host = String(url.hostname || '').toLowerCase().replace(/^www\./, '');
  if (!host || ALLOWED_HOSTS.indexOf(host) < 0) return { error: 'host-not-allowed' };
  url.protocol = 'https:';
  url.port = '';
  url.hostname = host;
  return { url: url.toString(), host };
}

/**
 * 리다이렉트를 **직접** 따라갑니다. (매 홉마다 화이트리스트 재검사)
 * @returns {Promise<{url:string, status:number, html:string}|{error:string, status?:number}>}
 */
async function resolveTarget(startUrl) {
  let current = startUrl;
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remaining = Math.max(500, deadline - Date.now());
    const response = await fetchWithTimeout(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    }, Math.min(HOP_TIMEOUT_MS, remaining));
    if (!response) return { error: 'timeout' };

    if (response.status >= 300 && response.status < 400) {
      const location =
        response.headers && typeof response.headers.get === 'function' ? response.headers.get('location') : '';
      if (!location) return { error: 'bad-redirect' };
      let absolute = '';
      try {
        absolute = new URL(location, current).toString();
      } catch (e) {
        return { error: 'bad-redirect' };
      }
      const next = normalizeTarget(absolute);
      if (next.error) {
        warn('resolve-url: redirect blocked (' + next.error + ')');
        return { error: 'redirect-not-allowed' };
      }
      current = next.url;
      continue;
    }

    if (!response.ok) return { error: 'upstream-failed', status: response.status };
    let html = '';
    if (typeof response.text === 'function') {
      try {
        html = String(await response.text()).slice(0, MAX_HTML_CHARS);
      } catch (e) {
        html = '';
      }
    }
    return { url: current, status: response.status, html };
  }
  return { error: 'too-many-redirects' };
}

module.exports = async function handler(req, res) {
  if (!isGet(req)) return sendJson(res, 405, { error: 'method-not-allowed' });

  const raw = queryParam(req, 'url', MAX_URL_LENGTH);
  if (!raw) return sendJson(res, 400, { error: 'missing-url', message: 'url(링크)이 필요합니다.' });

  const target = normalizeTarget(raw);
  if (target.error) {
    return sendJson(res, target.error === 'host-not-allowed' ? 403 : 400, {
      error: target.error,
      allowed: ALLOWED_HOSTS,
    });
  }

  const resolved = await resolveTarget(target.url);
  if (resolved.error) {
    if (resolved.error === 'timeout') {
      warn('resolve-url: timeout (' + target.host + ')');
      return sendJson(res, 504, { error: 'resolve-timeout' });
    }
    if (resolved.error === 'redirect-not-allowed') return sendJson(res, 403, { error: 'redirect-not-allowed' });
    if (resolved.error === 'upstream-failed') {
      return sendJson(res, 502, { error: 'upstream-failed', status: resolved.status });
    }
    return sendJson(res, 400, { error: resolved.error });
  }

  const finalUrl = resolved.url;
  const naverPlaceId = extractNaverPlaceId(finalUrl) || extractNaverPlaceId(resolved.html.slice(0, 4000));
  const videoId = extractVideoId(finalUrl);
  const page = parseNaverPlaceHtml(resolved.html);
  // 제목은 네이버 플레이스가 아니어도 쓸 수 있습니다. (유튜브·매장 홈페이지)
  const title = page.title;

  return sendJson(
    res,
    200,
    {
      ok: true,
      url: finalUrl,
      kind: naverPlaceId ? 'naver-place' : videoId ? 'youtube' : 'page',
      naverPlaceId,
      videoId,
      title,
      lat: naverPlaceId ? page.lat : null,
      lng: naverPlaceId ? page.lng : null,
      address: naverPlaceId ? page.address : '',
      phone: naverPlaceId ? page.phone : '',
    },
    600
  );
};

module.exports.parseNaverPlaceHtml = parseNaverPlaceHtml;
module.exports.extractNaverPlaceId = extractNaverPlaceId;
module.exports.extractVideoId = extractVideoId;
module.exports.normalizeTarget = normalizeTarget;
module.exports.ALLOWED_HOSTS = ALLOWED_HOSTS;
module.exports.TOTAL_TIMEOUT_MS = TOTAL_TIMEOUT_MS;
