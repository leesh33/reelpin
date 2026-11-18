/**
 * src/services/reversePlace.js — v2.33.0
 * ─────────────────────────────────────────────────────────────
 * 지도에서 **꾹 누른 좌표**를 주소·주변 장소로 바꿔 주는 서버 프록시 호출.
 *
 *   · `/api/reverse-place?lat=…&lng=…&radius=…` (api/reverse-place.js)
 *     → 카카오 coord2address(도로명·지번·건물명) + 반경 60m 업종 검색(음식점·카페·관광명소·문화시설)
 *   · 카카오 키는 **서버에만** 있습니다 — 브라우저는 우리 서버만 부릅니다. (CORS·키 노출 없음)
 *   · 서버 프록시가 있는 **웹에서만** 부릅니다. 네이티브에서는 조용히 실패로 돌려주고
 *     화면은 `이름 직접 입력` 으로 이어집니다. (등록 자체는 언제나 가능)
 *   · 실패해도 예외를 던지지 않습니다 — 꾹 누르기 UI 는 항상 열립니다.
 */

import { REVERSE_PLACE_RADIUS_M } from '../utils/longPressPlace';

export const REVERSE_PLACE_ENDPOINT = '/api/reverse-place';
/** 서버가 다섯 요청을 동시에 보내고 4초에 끊습니다 — 화면은 그보다 조금 더 기다립니다. */
export const REVERSE_PLACE_TIMEOUT_MS = 9000;

/** 좌표·반경이 올바른지 (위경도 범위·0,0 제외) */
export function isValidPoint(point) {
  if (!point) return false;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return !(lat === 0 && lng === 0);
}

/** `/api/reverse-place` 요청 경로 (좌표 없으면 '') */
export function buildReversePlacePath(point, options = {}) {
  if (!isValidPoint(point)) return '';
  const radius = Number(options.radius) > 0 ? Math.trunc(Number(options.radius)) : REVERSE_PLACE_RADIUS_M;
  return (
    REVERSE_PLACE_ENDPOINT +
    '?lat=' +
    encodeURIComponent(String(Number(point.lat))) +
    '&lng=' +
    encodeURIComponent(String(Number(point.lng))) +
    '&radius=' +
    encodeURIComponent(String(radius))
  );
}

/** 서버 프록시가 있는 웹인가 (services/placeInfo.js 와 같은 판정) */
function isWebRuntime() {
  try {
    const { Platform } = require('react-native');
    return Boolean(Platform && Platform.OS === 'web');
  } catch (e) {
    return typeof window !== 'undefined';
  }
}

async function getJson(url, timeoutMs) {
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        /* 이미 끝남 */
      }
    }, timeoutMs);
  }
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 꾹 누른 자리 → { address, places }
 * @returns {Promise<{ok:boolean, address?:object|null, places?:Array, reason?:string}>}
 */
export async function fetchReversePlace(point, options = {}) {
  if (!isValidPoint(point)) return { ok: false, reason: 'bad-coords' };
  if (!isWebRuntime()) return { ok: false, reason: 'web-only' };
  const path = buildReversePlacePath(point, options);
  if (!path) return { ok: false, reason: 'bad-coords' };
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : REVERSE_PLACE_TIMEOUT_MS;
  const json = await getJson((options.baseUrl || '') + path, timeoutMs);
  if (!json || typeof json !== 'object') return { ok: false, reason: 'network' };
  if (json.ok === false || json.error) return { ok: false, reason: String(json.error || 'reverse-place-failed') };
  const address = json.address && typeof json.address === 'object' ? json.address : null;
  const places = Array.isArray(json.places) ? json.places.filter(Boolean) : [];
  return { ok: true, address, places };
}
