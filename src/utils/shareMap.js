/**
 * utils/shareMap.js — v2.0 '내 맛집 지도 공유 링크'
 * ─────────────────────────────────────────────────────────────
 * 서버 DB 없이도 **링크 하나로** 내 맛집 지도를 건네줍니다.
 *
 *   https://reelpin.vercel.app/?share=<압축·Base64URL 코드>
 *
 * 왜 서버가 필요 없나
 *   · 지도에 필요한 최소 정보(이름·카테고리·동네·좌표·매장 URL·네이버 placeId·전화·주소)만
 *     `이름|카테고리|…` 형태로 이어 붙이고(구분자만 남긴 압축), UTF-8 바이트 → Base64URL 로 감쌉니다.
 *   · 받는 사람은 링크를 열기만 하면 되고, 서버·로그인·DB 가 필요 없습니다.
 *   · 코드가 길어지지 않게 핀 1곳당 빈 값은 아예 빼고, 최대 100곳까지만 담습니다.
 *
 * 이 파일은 **순수 자바스크립트**입니다. (react-native·clipboard import 없음)
 *   → Node 테스트(`test/extractor-test.mjs`)에서 그대로 불러 쓸 수 있고, SSR(node)에서도 안전합니다.
 *   window·navigator 접근은 `typeof` 로 감싸 브라우저에서만 동작하게 했습니다.
 * ─────────────────────────────────────────────────────────────
 */

/** 공유 코드 앞에 붙는 규격 표식 — 나중에 형식이 바뀌어도 구 링크를 구분할 수 있습니다. */
export const SHARE_CODE_PREFIX = 'r2-';
export const SHARE_VERSION = 2;
export const SHARE_PARAM = 'share';
/** 링크가 너무 길어지지 않게 담는 핀 수 상한 */
export const SHARE_MAX_PINS = 100;
/** 필드 상한 — 비정상적으로 긴 값이 링크를 망가뜨리지 않게 */
export const SHARE_FIELD_MAX = { name: 60, area: 30, category: 20, placeUrl: 300, phone: 24, address: 120, memo: 60 };

/** 배포 주소 — 브라우저가 아닌 곳(테스트·SSR)에서 쓰는 기본 origin */
export const DEFAULT_SHARE_ORIGIN = 'https://reelpin.vercel.app';

// ── UTF-8 ↔ 바이트 ──────────────────────────────────────────
/** 문자열 → UTF-8 바이트 배열 (TextEncoder 없이도 동작) */
export function utf8Encode(text) {
  const s = String(text == null ? '' : text);
  const out = [];
  for (let i = 0; i < s.length; i += 1) {
    let code = s.charCodeAt(i);
    // 서로게이트 페어 → 4바이트
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
  }
  return out;
}

/** UTF-8 바이트 배열 → 문자열 */
export function utf8Decode(bytes) {
  const list = Array.isArray(bytes) ? bytes : [];
  let out = '';
  for (let i = 0; i < list.length; ) {
    const b = list[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (list[i + 1] & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((list[i + 1] & 0x3f) << 6) | (list[i + 2] & 0x3f));
      i += 3;
    } else {
      const code =
        ((b & 0x07) << 18) |
        ((list[i + 1] & 0x3f) << 12) |
        ((list[i + 2] & 0x3f) << 6) |
        (list[i + 3] & 0x3f);
      const c = code - 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
      i += 4;
    }
  }
  return out;
}

// ── Base64URL ───────────────────────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 바이트 배열 → Base64URL (`+`→`-`, `/`→`_`, `=` 없음 → URL 에 그대로) */
export function base64UrlEncode(bytes) {
  const list = Array.isArray(bytes) ? bytes : [];
  let out = '';
  for (let i = 0; i < list.length; i += 3) {
    const b0 = list[i] & 0xff;
    const b1 = i + 1 < list.length ? list[i + 1] & 0xff : NaN;
    const b2 = i + 2 < list.length ? list[i + 2] & 0xff : NaN;
    out += B64.charAt(b0 >> 2);
    out += B64.charAt(((b0 & 0x03) << 4) | (Number.isNaN(b1) ? 0 : b1 >> 4));
    if (Number.isNaN(b1)) break;
    out += B64.charAt(((b1 & 0x0f) << 2) | (Number.isNaN(b2) ? 0 : b2 >> 6));
    if (Number.isNaN(b2)) break;
    out += B64.charAt(b2 & 0x3f);
  }
  return out;
}

/** Base64URL → 바이트 배열 (잘못된 글자가 있으면 null) */
export function base64UrlDecode(code) {
  const s = String(code || '').replace(/=+$/, '');
  if (!s) return [];
  const out = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i += 1) {
    const v = B64.indexOf(s.charAt(i));
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

// ── 핀 → 짧은 문자열 ────────────────────────────────────────
/** 구분자와 겹치지 않게 값 안의 `% | ~` 를 이스케이프합니다. */
function escapeField(value) {
  return String(value == null ? '' : value)
    .replace(/%/g, '%25')
    .replace(/\|/g, '%7C')
    .replace(/~/g, '%7E')
    .replace(/\n/g, ' ');
}

function unescapeField(value) {
  return String(value == null ? '' : value)
    .replace(/%7E/gi, '~')
    .replace(/%7C/gi, '|')
    .replace(/%25/gi, '%');
}

function clampText(value, max) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * 핀 → `이름|카테고리|동네|위도|경도|placeUrl|naverPlaceId|전화|주소|가봤어요|메모`
 * 빈 값은 뒤에서부터 잘라 링크를 짧게 유지합니다.
 * v2.10 — 뒤에 `visited`('1' 또는 빈 값) · `memo` 가 붙습니다.
 *   구 버전 링크(9칸)는 그대로 읽히고(방문 false), 구 버전 앱도 앞의 9칸만 읽으므로
 *   형식 번호(SHARE_VERSION)를 올리지 않아도 됩니다 — 양방향 호환.
 * @param {object} pin
 */
export function encodePinTuple(pin) {
  if (!pin || !pin.name) return '';
  const fields = [
    clampText(pin.name, SHARE_FIELD_MAX.name),
    clampText(pin.category, SHARE_FIELD_MAX.category),
    clampText(pin.area, SHARE_FIELD_MAX.area),
    Number.isFinite(Number(pin.lat)) ? String(Number(pin.lat)) : '',
    Number.isFinite(Number(pin.lng)) ? String(Number(pin.lng)) : '',
    clampText(pin.placeUrl, SHARE_FIELD_MAX.placeUrl),
    String(pin.naverPlaceId || '').replace(/\D/g, '').slice(0, 20),
    clampText(pin.phone, SHARE_FIELD_MAX.phone),
    clampText(pin.address, SHARE_FIELD_MAX.address),
    pin.visited === true ? '1' : '',
    clampText(pin.memo, SHARE_FIELD_MAX.memo),
  ].map(escapeField);
  while (fields.length > 3 && !fields[fields.length - 1]) fields.pop();
  return fields.join('|');
}

/** `이름|카테고리|…` → 핀 (좌표가 없으면 지도에 못 올리므로 버립니다) */
export function decodePinTuple(tuple, index) {
  const parts = String(tuple || '').split('|').map(unescapeField);
  const name = clampText(parts[0], SHARE_FIELD_MAX.name);
  const lat = Number(parts[3]);
  const lng = Number(parts[4]);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    id: 'share-' + index,
    name,
    category: clampText(parts[1], SHARE_FIELD_MAX.category) || '맛집',
    area: clampText(parts[2], SHARE_FIELD_MAX.area),
    lat,
    lng,
    placeUrl: clampText(parts[5], SHARE_FIELD_MAX.placeUrl),
    placeUrlLabel: '',
    naverPlaceId: String(parts[6] || '').replace(/\D/g, ''),
    phone: clampText(parts[7], SHARE_FIELD_MAX.phone),
    address: clampText(parts[8], SHARE_FIELD_MAX.address) || '주소 미확인',
    menuTags: [],
    providers: [],
    platform: 'share',
    sourceUrl: '',
    note: '공유받은 맛집 지도',
    // v2.10 — 공유한 사람의 방문 체크 · 한줄 메모도 함께 (없던 링크는 false / '')
    visited: parts[9] === '1',
    visitedAt: '',
    memo: clampText(parts[10], SHARE_FIELD_MAX.memo),
    shared: true,
  };
}

/** 핀 목록 → 공유 코드 (`r2-…`) */
export function encodeSharePins(pins) {
  const list = (Array.isArray(pins) ? pins : []).filter((p) => p && p.name).slice(0, SHARE_MAX_PINS);
  const body = list
    .map(encodePinTuple)
    .filter(Boolean)
    .join('~');
  return SHARE_CODE_PREFIX + base64UrlEncode(utf8Encode(SHARE_VERSION + '|' + body));
}

/**
 * 공유 코드 → { pins, count }
 *   잘못된 코드(난수·손상·다른 버전)는 예외 없이 null.
 * @returns {{pins:Array<object>, count:number, version:number}|null}
 */
export function decodeSharePins(code) {
  const raw = String(code || '').trim();
  if (!raw) return null;
  if (raw.indexOf(SHARE_CODE_PREFIX) !== 0) return null;
  const bytes = base64UrlDecode(raw.slice(SHARE_CODE_PREFIX.length));
  if (!bytes || !bytes.length) return null;
  let text = '';
  try {
    text = utf8Decode(bytes);
  } catch (e) {
    return null;
  }
  const sep = text.indexOf('|');
  if (sep < 0) return null;
  const version = Number(text.slice(0, sep));
  if (version !== SHARE_VERSION) return null;
  const body = text.slice(sep + 1);
  const pins = [];
  body.split('~').forEach((tuple) => {
    if (!tuple) return;
    const pin = decodePinTuple(tuple, pins.length);
    if (pin) pins.push(pin);
  });
  if (!pins.length) return null;
  return { pins, count: pins.length, version };
}

// ── 링크 만들기 · 읽기 ──────────────────────────────────────
/** 지금 보고 있는 사이트 주소(브라우저) 또는 기본 배포 주소 */
export function currentOrigin() {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return String(window.location.origin);
    }
  } catch (e) {
    /* SSR·네이티브 */
  }
  return DEFAULT_SHARE_ORIGIN;
}

/**
 * 공유 링크 만들기 — `https://<origin>/?share=r2-…`
 * @param {Array<object>} pins
 * @param {{origin?:string}} [options]
 */
export function buildShareUrl(pins, options = {}) {
  const origin = String(options.origin || currentOrigin()).replace(/\/+$/, '');
  const code = encodeSharePins(pins);
  return origin + '/?' + SHARE_PARAM + '=' + code;
}

/**
 * 핀들이 한 동네에 몰려 있을 때만 그 동네 이름을 씁니다.
 * (여러 동네에 흩어져 있으면 '내 릴스 맛집 지도' 가 맞습니다)
 */
export function dominantArea(pins) {
  const list = Array.isArray(pins) ? pins.filter(Boolean) : [];
  if (!list.length) return '';
  const counts = {};
  list.forEach((pin) => {
    const area = String((pin && pin.area) || '').trim();
    if (area) counts[area] = (counts[area] || 0) + 1;
  });
  const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (!ranked.length) return '';
  return counts[ranked[0]] * 2 >= list.length ? ranked[0] : '';
}

/** 공유와 함께 보여 줄 짧은 문구 */
export function shareMessage(pins, options = {}) {
  const list = Array.isArray(pins) ? pins.filter(Boolean) : [];
  const area = dominantArea(list);
  const title = options.title || (area ? '내 ' + area + ' 릴스 지도' : '내 릴스 맛집 지도');
  return title + ' · ' + list.length + '곳';
}

/**
 * `?share=…` 또는 `#share=…` 문자열/주소에서 공유 지도를 읽습니다.
 * @param {string} searchOrUrl
 * @returns {{pins:Array<object>, count:number}|null}
 */
export function parseShareFromUrl(searchOrUrl) {
  const text = String(searchOrUrl || '');
  if (!text) return null;
  const m = text.match(new RegExp('[?&#]' + SHARE_PARAM + '=([A-Za-z0-9_\\-%.]+)'));
  if (!m) return null;
  let code = m[1];
  try {
    code = decodeURIComponent(code);
  } catch (e) {
    /* 이미 풀린 값 */
  }
  return decodeSharePins(code);
}

/** 브라우저 주소창에서 공유 지도 읽기 (SSR·네이티브에서는 null) */
export function readShareFromLocation() {
  try {
    if (typeof window === 'undefined' || !window.location) return null;
    return parseShareFromUrl(String(window.location.search || '') + String(window.location.hash || ''));
  } catch (e) {
    return null;
  }
}

/**
 * 공유를 마친 뒤 주소창에서 `share` 파라미터만 지웁니다. (새로고침해도 배너가 다시 뜨지 않게)
 * @returns {boolean} 주소를 바꿨는지
 */
export function clearShareFromLocation() {
  try {
    if (typeof window === 'undefined' || !window.history || !window.location) return false;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SHARE_PARAM)) return false;
    url.searchParams.delete(SHARE_PARAM);
    window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
    return true;
  } catch (e) {
    return false;
  }
}

/** 이 브라우저가 공유 시트(navigator.share)를 지원하는지 */
export function canNativeShare() {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  } catch (e) {
    return false;
  }
}

/**
 * 공유 시트 열기 — 사용자가 취소하면 { cancelled:true } 로 돌아옵니다. (예외는 던지지 않음)
 * @returns {Promise<{shared:boolean, cancelled?:boolean}>}
 */
export async function nativeShare(url, options = {}) {
  if (!canNativeShare()) return { shared: false };
  try {
    await navigator.share({
      title: options.title || '릴스핀 — 내 맛집 지도',
      text: options.text || '',
      url,
    });
    return { shared: true };
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || e.name === 'NotAllowedError');
    return { shared: false, cancelled: Boolean(aborted) };
  }
}
