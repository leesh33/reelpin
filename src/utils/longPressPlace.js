/**
 * src/utils/longPressPlace.js — v2.33.0
 * ─────────────────────────────────────────────────────────────
 * 지도 **꾹 누르기(long press)** 로 장소를 등록할 때 쓰는 순수 규칙만 모읍니다.
 * (네이버 지도·Leaflet 공통 · 화면 없이 검사할 수 있게 DOM 을 건드리지 않습니다)
 *
 * 상훈 님 요청(2026-11-18):
 *   "혹시 지도상에서 꾹 누르면 해당 위치의 장소를 등록 하는 기능은 못 만들까?"
 *   "꾹 누르면 해당장소의 장소명칭 나오면서 등록가능하게 부탁할게"
 *
 *   ① 꾹 누른 자리(픽셀) → 지도 좌표 … 화면 쪽(RealMapView)이 지도 API 로 바꿉니다
 *   ② 좌표 → 주소·주변 장소 … `/api/reverse-place` (카카오) 가 돌려줍니다
 *   ③ 그 답 → 화면에 보여 줄 이름·분류·거리 … **이 파일**
 *   ④ 저장 … 핀 모양으로 바꿔 App 이 지도에 꽂습니다 (`buildLongPressPin`)
 */

import { buildPin, normalizeMemo } from './pins';

/** 꾹 누르기로 인정하는 시간(ms) — 카카오·네이버 지도와 비슷한 체감 */
export const LONG_PRESS_MS = 550;
/** 이만큼(px) 움직이면 꾹 누르기가 아니라 **지도 끌기**로 봅니다 */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 12;
/** 같은 자리에서 두 번(내 타이머 + 지도 엔진 이벤트) 울렸을 때 한 번만 처리하는 창(ms) */
export const LONG_PRESS_DEDUPE_MS = 1200;
/** 두 번으로 볼 거리(m) */
export const LONG_PRESS_DEDUPE_METERS = 30;

/** 꾹 누른 자리 주변에서 보여 줄 장소 수 (가까운 순) — 짧은 목록이 한눈에 들어옵니다 */
export const NEARBY_PLACE_LIMIT = 3;

/** 반경 기본값(m) — 손가락 바로 아래만 (서버 기본값과 같습니다) */
export const REVERSE_PLACE_RADIUS_M = 60;

/**
 * 화면에서 꾹 누른 픽셀 → 지도 컨테이너 안의 offset 좌표.
 * @param {{left:number, top:number}} rect 지도 컨테이너의 getBoundingClientRect()
 */
export function offsetPoint(rect, clientX, clientY) {
  const left = Number(rect && rect.left) || 0;
  const top = Number(rect && rect.top) || 0;
  const x = Number(clientX) - left;
  const y = Number(clientY) - top;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * v2.33.1 — 꾹 누른 **화면 픽셀** → 지도 API 의 **offset 좌표계** 좌표.
 *
 * 왜 한 번 더 계산하나 (신고: "지도를 이동해서 꾹 누르면 그 장소 인식을 못해")
 *   · 네이버 지도 v3 의 `projection.fromOffsetToCoord(p)` 는 지도 컨테이너의 픽셀이 아니라
 *     `offset = 컨테이너 픽셀 − containerTopLeft` 인 **offset 좌표계**를 받습니다.
 *     (SDK: `fromOffsetToPoint(p) = scaleDown(p + containerTopLeft) + projectionTopLeft`)
 *   · `containerTopLeft` 는 지도를 끌 때마다 `panBy` 가 쌓아 두는 값이라, 옮긴 뒤에
 *     컨테이너 픽셀을 그대로 넣으면 **옮기기 전 화면 자리**의 좌표가 나옵니다.
 *     → 내 위치 근처에서만 주소가 맞고, 멀리 옮기면 엉뚱한 동네가 나옵니다.
 *
 *   · 화면 한가운데 픽셀의 offset 은 `fromCoordToOffset(지도 중심)` 이고,
 *     화면에서의 변위는 offset 에서의 변위와 같습니다(같은 픽셀 배율).
 *     ⇒ 중심 offset + (누른 픽셀 − 화면 한가운데) = 누른 자리의 offset (이동·확대와 무관)
 *
 * @param {{x:number,y:number}|null} centerOffset 화면 한가운데의 offset — fromCoordToOffset(지도 중심)
 * @param {{w:number,h:number}|{width:number,height:number}|null} size 지도 화면 크기(px)
 * @param {{x:number,y:number}} press 꾹 누른 픽셀(컨테이너 안 offset — Rect 기준)
 * @returns {{x:number,y:number}|null}
 */
export function pressOffsetPoint(centerOffset, size, press) {
  if (!centerOffset || !size || !press) return null;
  const cx = Number(centerOffset.x);
  const cy = Number(centerOffset.y);
  const w = Number(size.w != null ? size.w : size.width);
  const h = Number(size.h != null ? size.h : size.height);
  const px = Number(press.x);
  const py = Number(press.y);
  if (![cx, cy, w, h, px, py].every(Number.isFinite)) return null;
  if (!(w > 0 && h > 0)) return null;
  return { x: cx + (px - w / 2), y: cy + (py - h / 2) };
}

/** 처음 누른 자리에서 tolerance(px) 보다 더 움직였는가 (지도 끌기 판정) */
export function movedBeyondTolerance(start, current, tolerance = LONG_PRESS_MOVE_TOLERANCE_PX) {
  if (!start || !current) return false;
  const dx = Number(current.x) - Number(start.x);
  const dy = Number(current.y) - Number(start.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  const limit = Number(tolerance) > 0 ? Number(tolerance) : LONG_PRESS_MOVE_TOLERANCE_PX;
  return Math.abs(dx) > limit || Math.abs(dy) > limit;
}

/** 두 좌표 사이 거리(m) — 꾹 누르기 중복 판정용 (Haversine) */
export function metersBetween(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 같은 자리에서 곧바로 또 울린 꾹 누르기는 무시합니다.
 * (내 타이머가 먼저 알리고, 지도 엔진의 longtap 이 1초 뒤에 또 오는 경우)
 * @param {{lat:number,lng:number,at:number}|null} last
 */
export function isDuplicateLongPress(last, point, now = Date.now(), options = {}) {
  if (!last || !point) return false;
  const windowMs = Number(options.windowMs) > 0 ? Number(options.windowMs) : LONG_PRESS_DEDUPE_MS;
  const maxMeters =
    Number(options.meters) > 0 ? Number(options.meters) : LONG_PRESS_DEDUPE_METERS;
  const elapsed = Number(now) - Number(last.at);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > windowMs) return false;
  return metersBetween(last, point) <= maxMeters;
}

/** 거리 표기 — 12m · 1.2km (지도·목록과 같은 결) */
export function placeDistanceLabel(meters) {
  // null·undefined·'' 는 Number() 가 0 이 되므로 먼저 걸러 냅니다 ('0m' 이라고 쓰지 않게)
  if (meters == null || meters === '') return '';
  const m = Number(meters);
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return Math.round(m) + 'm';
  return (m / 1000).toFixed(1) + 'km';
}

/**
 * 카카오 업종 묶음 → 앱의 기본 분류.
 *   FD6 음식점 · CE7 카페 → 그대로, 그 밖(관광명소·문화시설·개인 장소)은 '가볼곳'
 */
export function categoryForGroup(code) {
  const value = String(code || '').trim().toUpperCase();
  if (value === 'FD6') return '맛집';
  if (value === 'CE7') return '카페';
  return '가볼곳';
}

/** 주소 한 줄 (도로명 → 지번 순) */
export function addressLabelOf(address) {
  if (!address || typeof address !== 'object') return '';
  return String(address.label || address.road || address.jibun || '').trim();
}

/** 주소 아래 작은 줄 — 건물명 · 지번 (없으면 '') */
export function addressDetailOf(address) {
  if (!address || typeof address !== 'object') return '';
  const parts = [];
  const building = String(address.building || '').trim();
  if (building) parts.push(building);
  const jibun = String(address.jibun || '').trim();
  const road = String(address.road || '').trim();
  // 도로명이 없어 지번이 첫 줄(label)로 올라간 경우에는 아래 줄에 또 쓰지 않습니다.
  const label = String(address.label || road || jibun).trim();
  if (jibun && jibun !== road && jibun !== label) parts.push(jibun);
  return parts.join(' · ');
}

/** 조회 결과에서 보여 줄 장소 목록 (가까운 순 · 최대 NEARBY_PLACE_LIMIT곳) */
export function nearbyPlaceRows(result, limit = NEARBY_PLACE_LIMIT) {
  const places = result && Array.isArray(result.places) ? result.places : [];
  const max = Number(limit) > 0 ? Math.trunc(Number(limit)) : NEARBY_PLACE_LIMIT;
  return places
    .filter((place) => place && String(place.name || '').trim())
    .slice()
    .sort((a, b) => {
      const da = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Number.POSITIVE_INFINITY;
      const db = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Number.POSITIVE_INFINITY;
      return da - db;
    })
    .slice(0, max);
}

/** 가장 가까운 장소 (없으면 null) */
export function nearestPlaceOf(result) {
  const rows = nearbyPlaceRows(result, 1);
  return rows[0] || null;
}

/**
 * 처음 채워 둘 이름 — ① 가장 가까운 장소 이름 → ② 건물명 → ③ 도로명·지번 주소.
 * 아무것도 없으면 빈 문자열(직접 적게).
 */
export function suggestedNameOf(result) {
  const place = nearestPlaceOf(result);
  if (place) return String(place.name || '').trim();
  const address = result && result.address;
  const building = String((address && address.building) || '').trim();
  if (building) return building;
  return addressLabelOf(address);
}

/** 처음 골라 둘 분류 — 가장 가까운 장소의 업종, 없으면 '가볼곳' */
export function suggestedCategoryOf(result) {
  const place = nearestPlaceOf(result);
  return place ? categoryForGroup(place.categoryGroupCode) : '가볼곳';
}

/**
 * 꾹 누른 자리 + 고른 장소/직접 적은 이름 → 저장할 핀.
 *   · place 가 있으면 전화번호·카카오 placeUrl·출처(kakao)까지 함께 담습니다.
 *   · 없으면(개인 장소) 이름·좌표·주소만 담습니다 — 지도에 그대로 꽂힙니다.
 * @returns {object|null} utils/pins.buildPin 이 만든 핀 (이름이 비면 null)
 */
export function buildLongPressPin(input = {}) {
  const name = String(input.name == null ? '' : input.name).replace(/\s+/g, ' ').trim();
  if (!name) return null;
  const point = input.point || {};
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const place = input.place && typeof input.place === 'object' ? input.place : null;
  const address = input.address && typeof input.address === 'object' ? input.address : null;
  const category = String(input.category || '').trim() || (place ? categoryForGroup(place.categoryGroupCode) : '가볼곳');
  return buildPin(
    {
      name,
      area: String((address && address.area) || '').trim(),
      category,
      menuTags: [],
      address: addressLabelOf(address) || String((place && (place.roadAddress || place.address)) || ''),
      lat,
      lng,
      placeUrl: place ? String(place.placeUrl || '') : '',
      placeUrlLabel: place ? '카카오맵' : '',
      phone: place ? String(place.phone || '') : '',
      naverPlaceId: '',
      providers: place ? ['kakao'] : [],
      confidence: null,
      memo: normalizeMemo(input.memo),
    },
    {
      platform: 'map',
      note: '',
      memo: input.memo,
      now: input.now,
      id: input.id,
    }
  );
}
