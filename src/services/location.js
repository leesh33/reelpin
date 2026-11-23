/**
 * src/services/location.js
 * ─────────────────────────────────────────────────────────────
 * v1.5 — 실제 거리 계산 + 내 위치(GPS) + 반경 500m 주변 계산
 *
 * 이 파일은 **DOM 을 건드리지 않습니다.** (window/navigator 접근은 함수 호출 시점에만)
 * node 에서 react-dom/server 로 렌더할 때도 import 만으로는 아무 일도 일어나지 않습니다.
 */

/** 지구 반지름(m) — Haversine */
const EARTH_RADIUS_M = 6371008.8;

/** 주변 알림 기본 반경 — 기획서 고정값 500m */
export const NEARBY_RADIUS_M = 500;

/** 위경도 유효 범위 */
const MAX_LAT = 90;
const MAX_LNG = 180;

/**
 * 숫자로 바꿀 수 있는 값만 숫자로. null / undefined / '' / boolean 은 NaN.
 * (Number(null) === 0 이라 그냥 Number() 를 쓰면 '좌표 없음'이 적도로 둔갑합니다.)
 */
function toNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return NaN;
  }
  return Number(value);
}

function isLat(value) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_LAT;
}

function isLng(value) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_LNG;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * 여러 모양의 좌표를 { lat, lng } 로 정규화합니다.
 * - { lat, lng } / { latitude, longitude } / { lat, lon } 모두 허용
 * - 유효하지 않으면 null
 */
export function normalizeCoords(input) {
  if (!input || typeof input !== 'object') return null;
  const lat = toNumber(input.lat !== undefined ? input.lat : input.latitude);
  const lng = toNumber(
    input.lng !== undefined ? input.lng : input.lon !== undefined ? input.lon : input.longitude
  );
  if (!isLat(lat) || !isLng(lng)) return null;
  return { lat, lng };
}

/**
 * 두 좌표 사이 직선거리(m). Haversine 공식.
 * 좌표가 없거나 유효하지 않으면 null 을 돌려줍니다(0 이 아닙니다).
 *
 * distanceMeters(37.5665, 126.978, 37.5445, 127.0557) → 약 7,400m
 */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const aLat = toNumber(lat1);
  const aLng = toNumber(lon1);
  const bLat = toNumber(lat2);
  const bLng = toNumber(lon2);
  if (!isLat(aLat) || !isLng(aLng) || !isLat(bLat) || !isLng(bLng)) return null;

  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return EARTH_RADIUS_M * c;
}

/**
 * 거리 표시용 문자열.
 *   320      → '320m'
 *   999.4    → '999m'
 *   1400     → '1.4km'
 *   1000     → '1.0km'
 *   12345    → '12km'
 * 유효하지 않으면 '' (화면에서 그냥 빠집니다).
 */
export function formatDistance(meters) {
  const value = toNumber(meters);
  if (!Number.isFinite(value) || value < 0) return '';
  const rounded = Math.round(value);
  if (rounded < 1000) return rounded + 'm';
  const km = rounded / 1000;
  return (km >= 10 ? km.toFixed(0) : km.toFixed(1)) + 'km';
}

/**
 * 반경 안에 있는 핀들을 가까운 순으로 돌려줍니다.
 * @returns {{ pin: object, distanceMeters: number }[]}
 *
 * - pins 가 배열이 아니거나 내 좌표가 없으면 []
 * - 좌표(위경도)가 없는 핀은 조용히 건너뜁니다.
 * - radiusMeters 생략 시 500m. Infinity 를 주면 '가장 가까운 곳' 하나를 뽑는 데 씁니다.
 */
export function findNearbyPins(pins, coords, radiusMeters = NEARBY_RADIUS_M) {
  if (!Array.isArray(pins)) return [];
  const origin = normalizeCoords(coords);
  if (!origin) return [];

  const rawLimit = toNumber(radiusMeters);
  const limit = Number.isNaN(rawLimit) ? NEARBY_RADIUS_M : rawLimit;

  const out = [];
  for (let i = 0; i < pins.length; i += 1) {
    const pin = pins[i];
    if (!pin || typeof pin !== 'object') continue;
    const d = distanceMeters(origin.lat, origin.lng, pin.lat, pin.lng);
    if (d === null) continue;
    if (d > limit) continue;
    out.push({ pin, distanceMeters: d });
  }
  out.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return out;
}

/**
 * 반경과 상관없이 '가장 가까운 저장 장소' 하나.
 * @returns {{ pin: object, distanceMeters: number } | null}
 */
export function nearestPin(pins, coords) {
  const all = findNearbyPins(pins, coords, Infinity);
  return all.length ? all[0] : null;
}

/** 핀 id → 내 위치로부터의 거리(m). 좌표가 없는 핀은 빠집니다. */
export function distanceMap(pins, coords) {
  const out = {};
  if (!Array.isArray(pins)) return out;
  const origin = normalizeCoords(coords);
  if (!origin) return out;
  pins.forEach((pin) => {
    if (!pin || !pin.id) return;
    const d = distanceMeters(origin.lat, origin.lng, pin.lat, pin.lng);
    if (d !== null) out[pin.id] = d;
  });
  return out;
}

// ── 권한·오류 안내 문구 (한국어) ─────────────────────────────
export const LOCATION_MESSAGES = {
  unsupported:
    '이 브라우저에서는 위치 기능을 쓸 수 없어요. 아이폰은 사파리에서, 안드로이드는 크롬에서 열어 주세요.',
  insecure: '위치는 보안 연결(https)에서만 쓸 수 있어요. 주소가 https 로 시작하는지 확인해 주세요.',
  denied:
    '위치 권한이 꺼져 있어요. 주소창 왼쪽 ⓐ(또는 설정 › Safari › 위치)에서 "허용"으로 바꿔 주세요.',
  unavailable: '지금은 위치를 확인할 수 없어요. 실내라면 창가에서 다시 시도해 주세요.',
  timeout: '위치를 확인하는 데 시간이 오래 걸렸어요. 잠시 후 다시 시도해 주세요.',
  unknown: '위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

/**
 * 네이티브(iOS·Android)인가? — react-native 를 import 하지 않고 판별합니다.
 * (이 파일은 node 테스트에서도 그대로 import 되므로 무거운 의존을 들이지 않습니다)
 */
export function isNativeRuntime() {
  try {
    return typeof navigator !== 'undefined' && !!navigator && navigator.product === 'ReactNative';
  } catch (e) {
    return false;
  }
}

/**
 * v2.41 — 📍 **네이티브 위치**(`expo-location`)를 브라우저 `navigator.geolocation` 모양으로 감쌉니다.
 *
 *   RN 에는 `navigator.geolocation` 이 없어서, 그대로 두면 아이폰·안드로이드에서
 *   [내 위치]·주변 500m 알림이 **아예 동작하지 않았습니다**(웹에서만 되던 이유).
 *   여기서는 웹 코드가 기대하는 그대로 — `getCurrentPosition` · `watchPosition` · `clearWatch` —
 *   를 돌려주고, 오류도 브라우저와 같은 code(1 거절 / 2 사용 불가 / 3 시간 초과)로 맞춥니다.
 *   `expo-location` 은 **호출 시점에만** require 해서 웹 번들·테스트에 영향을 주지 않습니다.
 */
function nativeGeoApi() {
  if (!isNativeRuntime()) return null;
  let Location = null;
  try {
    // eslint-disable-next-line global-require
    Location = require('expo-location');
  } catch (e) {
    return null;
  }
  if (!Location || typeof Location.getCurrentPositionAsync !== 'function') return null;

  const browserError = (code, message) => ({ code, message: message || '' });
  const errorCodeOf = (e) => {
    const text = String((e && (e.code || e.message)) || '').toLowerCase();
    if (text.indexOf('permission') >= 0 || text.indexOf('denied') >= 0) return 1;
    if (text.indexOf('timeout') >= 0) return 3;
    return 2;
  };
  const toBrowserPosition = (position) => ({
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    },
    timestamp: position.timestamp || Date.now(),
  });

  const ensurePermission = async () => {
    const current = await Location.getForegroundPermissionsAsync();
    if (current && current.status === 'granted') return true;
    const asked = await Location.requestForegroundPermissionsAsync();
    return Boolean(asked && asked.status === 'granted');
  };

  return {
    getCurrentPosition(onSuccess, onError, options = {}) {
      (async () => {
        try {
          const granted = await ensurePermission();
          if (!granted) {
            onError(browserError(1));
            return;
          }
          const position = await Location.getCurrentPositionAsync({
            accuracy: options.enableHighAccuracy === false ? Location.Accuracy.Balanced : Location.Accuracy.High,
            mayShowUserSettingsDialog: true,
          });
          onSuccess(toBrowserPosition(position));
        } catch (e) {
          onError(browserError(errorCodeOf(e), e && e.message));
        }
      })();
    },
    watchPosition(onSuccess, onError) {
      let subscription = null;
      let cancelled = false;
      const handle = {
        remove() {
          cancelled = true;
          try {
            if (subscription && typeof subscription.remove === 'function') subscription.remove();
          } catch (e) {
            /* 해지 실패는 무시 */
          }
        },
      };
      (async () => {
        try {
          const granted = await ensurePermission();
          if (!granted) {
            if (!cancelled) onError(browserError(1));
            return;
          }
          if (cancelled) return;
          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              distanceInterval: 20,
              timeInterval: 10000,
            },
            (position) => {
              if (!cancelled) onSuccess(toBrowserPosition(position));
            }
          );
        } catch (e) {
          if (!cancelled) onError(browserError(errorCodeOf(e), e && e.message));
        }
      })();
      return handle;
    },
    clearWatch(handle) {
      try {
        if (handle && typeof handle.remove === 'function') handle.remove();
      } catch (e) {
        /* 해지 실패는 무시 */
      }
    },
  };
}

function geoApi() {
  const native = nativeGeoApi();
  if (native) return native;
  if (typeof navigator === 'undefined' || !navigator) return null;
  const geo = navigator.geolocation;
  if (!geo || typeof geo.getCurrentPosition !== 'function') return null;
  return geo;
}

/** 이 환경에서 위치 기능을 쓸 수 있는지 (SSR·구형 브라우저 대비) */
export function isGeolocationSupported() {
  return geoApi() !== null;
}

/**
 * v2.41 — 네이티브에서 **이미 허용된 경우에만** 위치를 쓸 수 있는지 확인합니다.
 *   · 첫 실행에 권한 팝업을 띄우지 않고, 예전에 허용한 사람은 앱을 열자마자 내 위치로 갈 수 있게.
 *   · 웹·권한 API 가 없으면 false (기존 동작 그대로).
 */
export async function hasNativeLocationPermission() {
  if (!isNativeRuntime()) return false;
  try {
    // eslint-disable-next-line global-require
    const Location = require('expo-location');
    const current = await Location.getForegroundPermissionsAsync();
    return Boolean(current && current.status === 'granted');
  } catch (e) {
    return false;
  }
}

function locationError(code) {
  const err = new Error(LOCATION_MESSAGES[code] || LOCATION_MESSAGES.unknown);
  err.code = code;
  return err;
}

/** 브라우저 GeolocationPositionError.code → 우리 코드 */
export function errorCodeFor(geoError) {
  const raw = geoError && typeof geoError.code !== 'undefined' ? Number(geoError.code) : NaN;
  if (raw === 1) return 'denied';
  if (raw === 2) return 'unavailable';
  if (raw === 3) return 'timeout';
  return 'unknown';
}

export function locationErrorMessage(geoError) {
  return LOCATION_MESSAGES[errorCodeFor(geoError)] || LOCATION_MESSAGES.unknown;
}

function toPosition(geoPosition) {  const coords = (geoPosition && geoPosition.coords) || {};
  const lat = toNumber(coords.latitude);
  const lng = toNumber(coords.longitude);
  if (!isLat(lat) || !isLng(lng)) return null;
  return {
    lat,
    lng,
    accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : null,
    timestamp: geoPosition && geoPosition.timestamp ? geoPosition.timestamp : Date.now(),
  };
}

const DEFAULT_OPTIONS = { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 };

// ── v2.1.3 자동 위치 복구 (웹 재방문 · 새로고침) ─────────────
//
// 아이폰 사파리는 navigator.permissions.query({name:'geolocation'}) 를 지원하지 않는
// 버전이 있어, 허용 이력을 localStorage 에 남겨 두고 다음 방문에서 보조로 씁니다.
// (좌표·주소는 저장하지 않고 '허용한 적 있음' 한 글자만 남깁니다.)

/** 허용 이력 저장 키 */
export const LOCATION_GRANTED_KEY = 'reelpin:location_granted';

function localStorageRef() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch (e) {
    // 사파리 프라이빗 모드 등에서 접근 자체가 throw 할 수 있습니다.
    return null;
  }
}

/** '이 브라우저에서 위치를 허용한 적 있음' 기록 */
export function readLocationGrantedFlag() {
  const store = localStorageRef();
  if (!store) return false;
  try {
    return store.getItem(LOCATION_GRANTED_KEY) === '1';
  } catch (e) {
    return false;
  }
}

/** 허용 이력 저장(true) / 삭제(false) */
export function writeLocationGrantedFlag(granted = true) {
  const store = localStorageRef();
  if (!store) return false;
  try {
    if (granted) store.setItem(LOCATION_GRANTED_KEY, '1');
    else store.removeItem(LOCATION_GRANTED_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 브라우저의 위치 권한 상태.
 * @returns {Promise<'granted'|'prompt'|'denied'|'unknown'>} — 미지원(iOS 사파리 구버전·SSR)은 'unknown'
 */
export async function geolocationPermissionState() {
  try {
    if (typeof navigator === 'undefined' || !navigator) return 'unknown';
    const permissions = navigator.permissions;
    if (!permissions || typeof permissions.query !== 'function') return 'unknown';
    const status = await permissions.query({ name: 'geolocation' });
    const state = status && status.state;
    if (state === 'granted' || state === 'prompt' || state === 'denied') return state;
    return 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

/**
 * 화면을 열자마자 위치를 잡아도 되는지.
 * · 'granted' → 바로 (버튼 없이)
 * · 'denied'  → 절대 시도하지 않음
 * · 'prompt' / 'unknown' → 이전에 허용한 적이 있을 때만 (실패는 조용히 처리)
 */
export function shouldAutoLocate({ permission, grantedFlag } = {}) {
  if (permission === 'granted') return true;
  if (permission === 'denied') return false;
  return grantedFlag === true;
}

/**
 * 현재 위치를 한 번 받아옵니다.
 * @returns {Promise<{ lat:number, lng:number, accuracy:number|null, timestamp:number }>}
 * 실패하면 한국어 메시지를 가진 Error 로 reject (err.code: denied / unavailable / timeout / unsupported / insecure / unknown)
 */
export function requestCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    const geo = geoApi();
    if (!geo) {
      reject(locationError('unsupported'));
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject(locationError('insecure'));
      return;
    }

    let settled = false;
    try {
      geo.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          const converted = toPosition(position);
          if (converted) resolve(converted);
          else reject(locationError('unknown'));
        },
        (geoError) => {
          if (settled) return;
          settled = true;
          reject(locationError(errorCodeFor(geoError)));
        },
        { ...DEFAULT_OPTIONS, ...options }
      );
    } catch (e) {
      if (!settled) {
        settled = true;
        reject(locationError('unknown'));
      }
    }
  });
}

/**
 * 위치가 바뀔 때마다 onUpdate({ lat, lng, accuracy, timestamp }) 를 부릅니다.
 * @returns {() => void} 구독 해지 함수 (지원하지 않는 환경에서도 항상 함수를 돌려줍니다)
 */
export function watchPosition(onUpdate, onError, options = {}) {  const geo = geoApi();
  if (!geo) {
    if (typeof onError === 'function') {
      Promise.resolve().then(() => onError(locationError('unsupported')));
    }
    return () => {};
  }

  let watchId = null;
  let active = true;

  try {
    watchId = geo.watchPosition(
      (position) => {
        if (!active) return;
        const converted = toPosition(position);
        if (converted && typeof onUpdate === 'function') onUpdate(converted);
      },
      (geoError) => {
        if (!active) return;
        if (typeof onError === 'function') onError(locationError(errorCodeFor(geoError)));
      },
      { ...DEFAULT_OPTIONS, ...options }
    );
  } catch (e) {
    if (typeof onError === 'function') {
      Promise.resolve().then(() => onError(locationError('unknown')));
    }
    return () => {};
  }

  return () => {
    active = false;
    if (watchId === null) return;
    try {
      geo.clearWatch(watchId);
    } catch (e) {
      /* 이미 해지됨 */
    }
  };
}
