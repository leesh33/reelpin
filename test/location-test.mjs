/**
 * test/location-test.mjs — v1.5 실제 위치 · 거리 · 반경 500m 테스트
 *
 *   npm test            … 전체
 *   node test/run-tests.mjs location
 */
import {
  NEARBY_RADIUS_M,
  LOCATION_MESSAGES,
  distanceMeters,
  distanceMap,
  errorCodeFor,
  findNearbyPins,
  formatDistance,
  isGeolocationSupported,
  locationErrorMessage,
  nearestPin,
  normalizeCoords,
  requestCurrentPosition,
  watchPosition,
} from '../src/services/location.js';
import {
  firstNewNearby,
  isNotificationSupported,
  nearbyNotificationBody,
  notificationPermission,
  requestNotificationPermission,
  showNearbyNotification,
} from '../src/services/notifications.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
};
const near = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;

// ── 1. distanceMeters (Haversine) ────────────────────────────
check('기본 반경 상수 500m', NEARBY_RADIUS_M === 500, String(NEARBY_RADIUS_M));

const seoulToSeongsu = distanceMeters(37.5665, 126.978, 37.5445, 127.0557);
check('서울시청→성수 약 7.27km', seoulToSeongsu !== null && near(seoulToSeongsu, 7273, 30), String(seoulToSeongsu));
check('같은 좌표는 0m', distanceMeters(37.5, 127.0, 37.5, 127.0) === 0);
check(
  '위도 0.009도 ≈ 1km',
  near(distanceMeters(37.5, 127.0, 37.509, 127.0), 1001, 2),
  String(distanceMeters(37.5, 127.0, 37.509, 127.0))
);
check(
  '거리는 방향과 무관(대칭)',
  near(distanceMeters(37.5445, 127.0557, 37.5665, 126.978), seoulToSeongsu, 0.001)
);
check(
  '숫자 문자열 좌표도 허용',
  Math.round(distanceMeters('37.5', '127.0', '37.509', '127.0')) === 1001
);

// 좌표 없음·유효하지 않음 → null (0 이 아님)
check('null 좌표 → null', distanceMeters(null, 127.0, 37.5, 127.0) === null);
check('undefined 좌표 → null', distanceMeters(undefined, undefined, 37.5, 127.0) === null);
check('빈 문자열 좌표 → null', distanceMeters('', '', 37.5, 127.0) === null);
check('NaN 좌표 → null', distanceMeters(NaN, 127.0, 37.5, 127.0) === null);
check('위도 91 → null', distanceMeters(91, 127.0, 37.5, 127.0) === null);
check('경도 181 → null', distanceMeters(37.5, 181, 37.5, 127.0) === null);
check('문자 좌표 → null', distanceMeters('abc', 'def', 37.5, 127.0) === null);
check('boolean 좌표 → null', distanceMeters(true, false, 37.5, 127.0) === null);

// ── 2. normalizeCoords ───────────────────────────────────────
check('lat/lng 정규화', JSON.stringify(normalizeCoords({ lat: 37.5, lng: 127 })) === '{"lat":37.5,"lng":127}');
check(
  'latitude/longitude 정규화',
  JSON.stringify(normalizeCoords({ latitude: '37.5', longitude: '127.1' })) === '{"lat":37.5,"lng":127.1}'
);
check('lat/lon 정규화', normalizeCoords({ lat: 37.5, lon: 127 }).lng === 127);
check('좌표 없으면 null', normalizeCoords({ name: 'x' }) === null);
check('null → null', normalizeCoords(null) === null);
check('핀을 그대로 넣어도 동작', normalizeCoords({ id: 'a', lat: 37.5445, lng: 127.0557 }).lat === 37.5445);

// ── 3. formatDistance ────────────────────────────────────────
check('320 → 320m', formatDistance(320) === '320m', formatDistance(320));
check('0 → 0m', formatDistance(0) === '0m');
check('319.4 → 319m', formatDistance(319.4) === '319m', formatDistance(319.4));
check('999 → 999m', formatDistance(999) === '999m');
check('999.6 → 1.0km', formatDistance(999.6) === '1.0km', formatDistance(999.6));
check('1000 → 1.0km', formatDistance(1000) === '1.0km', formatDistance(1000));
check('1400 → 1.4km', formatDistance(1400) === '1.4km', formatDistance(1400));
check('2400 → 2.4km', formatDistance(2400) === '2.4km', formatDistance(2400));
check('12345 → 12km', formatDistance(12345) === '12km', formatDistance(12345));
check('null → 빈 문자열', formatDistance(null) === '');
check('음수 → 빈 문자열', formatDistance(-5) === '');
check('문자 → 빈 문자열', formatDistance('멀어요') === '');

// ── 4. findNearbyPins ───────────────────────────────────────
// 내 위치: 검단 자택 근처 (37.5824, 126.7144)
const HOME = { lat: 37.5824, lng: 126.7144 };
const PINS = [
  { id: 'p-2km', name: '아라뱃길 카페', category: '카페', lat: 37.592, lng: 126.69 }, // 약 2.4km
  { id: 'p-120m', name: '집 앞 국밥', category: '맛집', lat: 37.5834, lng: 126.7144 }, // 약 111m
  { id: 'p-450m', name: '당하동 베이커리', category: '베이커리', lat: 37.5824, lng: 126.7197 }, // 약 470m
  { id: 'p-none', name: '좌표 없는 핀', category: '맛집' },
];
const nearby500 = findNearbyPins(PINS, HOME);
check('반경 500m: 2곳만', nearby500.length === 2, String(nearby500.length));
check('반경 500m: 가까운 순 정렬', nearby500[0].pin.id === 'p-120m' && nearby500[1].pin.id === 'p-450m', nearby500.map((x) => x.pin.id).join(','));
check('반경 500m: 거리 값이 실제 m', near(nearby500[0].distanceMeters, 111, 2), String(nearby500[0].distanceMeters));
check('좌표 없는 핀은 조용히 제외', nearby500.every((x) => x.pin.id !== 'p-none'));
check('거리 오름차순', nearby500[0].distanceMeters <= nearby500[1].distanceMeters);
check('반경 3km 로 넓히면 3곳', findNearbyPins(PINS, HOME, 3000).length === 3);
check('Infinity 는 좌표 있는 핀 전부', findNearbyPins(PINS, HOME, Infinity).length === 3);
check('내 좌표가 없으면 []', findNearbyPins(PINS, null).length === 0);
check('핀 목록이 배열이 아니면 []', findNearbyPins(null, HOME).length === 0);
check(
  '반경 경계 안쪽(498m)은 포함',
  findNearbyPins([{ id: 'b', name: '경계', lat: 37.5824, lng: 126.72005 }], HOME).length === 1
);
check(
  '반경 경계 바깥(502m)은 제외',
  findNearbyPins([{ id: 'b', name: '경계', lat: 37.5824, lng: 126.7201 }], HOME).length === 0
);
check('원본 배열을 건드리지 않음', PINS.length === 4 && PINS[0].id === 'p-2km');

// ── 5. nearestPin / distanceMap ─────────────────────────────
const closest = nearestPin(PINS, HOME);
check('nearestPin: 가장 가까운 핀', closest && closest.pin.id === 'p-120m', closest && closest.pin.id);
check('nearestPin: 핀이 없으면 null', nearestPin([], HOME) === null);
check('nearestPin: 좌표 있는 핀이 없으면 null', nearestPin([{ id: 'x', name: 'x' }], HOME) === null);

const map = distanceMap(PINS, HOME);
check('distanceMap: 좌표 있는 핀 3개', Object.keys(map).length === 3, JSON.stringify(Object.keys(map)));
check('distanceMap: 좌표 없는 핀은 빠짐', !('p-none' in map));
check('distanceMap: 내 위치 없으면 {}', Object.keys(distanceMap(PINS, null)).length === 0);

// ── 6. 위치 API — node(위치 미지원) 환경 ────────────────────
check('node 에서는 위치 미지원', isGeolocationSupported() === false);

let unsupportedMessage = '';
try {
  await requestCurrentPosition();
} catch (err) {
  unsupportedMessage = err.message;
}
check(
  '위치 미지원이면 한국어 안내로 거절',
  unsupportedMessage === LOCATION_MESSAGES.unsupported && unsupportedMessage.indexOf('위치') >= 0,
  unsupportedMessage
);

let watchError = null;
const stopWatch = watchPosition(
  () => {},
  (err) => {
    watchError = err;
  }
);
check('watchPosition 은 항상 해지 함수를 돌려줌', typeof stopWatch === 'function');
await new Promise((resolve) => setTimeout(resolve, 10));
check('watchPosition: 미지원 안내 콜백', watchError && watchError.message === LOCATION_MESSAGES.unsupported, watchError && watchError.message);
stopWatch();

// ── 7. 위치 API — 브라우저(navigator.geolocation) 흉내 ────────
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const setNavigator = (value) => {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
};

setNavigator({
  geolocation: {
    getCurrentPosition: (success) =>
      setTimeout(
        () =>
          success({
            coords: { latitude: 37.5824, longitude: 126.7144, accuracy: 12 },
            timestamp: 1700000000000,
          }),
        0
      ),
    watchPosition: () => 7,
    clearWatch: () => {},
  },
});
const position = await requestCurrentPosition();
check('성공 콜백 → {lat,lng}', position.lat === 37.5824 && position.lng === 126.7144, JSON.stringify(position));
check('정확도·시각도 함께 전달', position.accuracy === 12 && position.timestamp === 1700000000000);
check('브라우저 흉내에서는 지원됨', isGeolocationSupported() === true);

const failWith = (code) => {
  setNavigator({
    geolocation: {
      getCurrentPosition: (success, error) => setTimeout(() => error({ code }), 0),
      watchPosition: () => 1,
      clearWatch: () => {},
    },
  });
};

failWith(1);
let denied = '';
try {
  await requestCurrentPosition();
} catch (err) {
  denied = err.message;
}
check('권한 거부(code 1) → 한국어 안내', denied === LOCATION_MESSAGES.denied, denied);
check('권한 거부 문구에 "권한"', denied.indexOf('권한') >= 0);

failWith(2);
let unavailable = '';
try {
  await requestCurrentPosition();
} catch (err) {
  unavailable = err.message;
}
check('위치 확인 불가(code 2) 안내', unavailable === LOCATION_MESSAGES.unavailable, unavailable);

failWith(3);
let timedOut = '';
try {
  await requestCurrentPosition();
} catch (err) {
  timedOut = err.message;
}
check('타임아웃(code 3) 안내', timedOut === LOCATION_MESSAGES.timeout, timedOut);
check('타임아웃 문구에 "시간"', timedOut.indexOf('시간') >= 0);

check('errorCodeFor: 1/2/3 매핑', errorCodeFor({ code: 1 }) === 'denied' && errorCodeFor({ code: 2 }) === 'unavailable' && errorCodeFor({ code: 3 }) === 'timeout');
check('locationErrorMessage: 미지의 코드', locationErrorMessage({ code: 99 }) === LOCATION_MESSAGES.unknown);

// watchPosition: 위치가 바뀔 때 콜백 + 해지
let watchCount = 0;
let cleared = 0;
setNavigator({
  geolocation: {
    getCurrentPosition: () => {},
    watchPosition: (success) => {
      setTimeout(() => success({ coords: { latitude: 37.6, longitude: 126.7, accuracy: 5 } }), 0);
      return 42;
    },
    clearWatch: () => {
      cleared += 1;
    },
  },
});
const stop = watchPosition(() => {
  watchCount += 1;
});
await new Promise((resolve) => setTimeout(resolve, 10));
check('watchPosition 콜백 호출', watchCount === 1, String(watchCount));
stop();
check('해지 시 clearWatch 호출', cleared === 1, String(cleared));

// ── 8. 알림(Notification API) ───────────────────────────────
if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
else delete globalThis.navigator;

check('node 에서는 브라우저 알림 미지원', isNotificationSupported() === false);
check('권한 상태 unsupported', notificationPermission() === 'unsupported');
check('권한 요청도 unsupported', (await requestNotificationPermission()) === 'unsupported');
check('알림 띄우기 false', showNearbyNotification(PINS[1], 111, 500) === false);
check(
  '알림 본문 문구',
  nearbyNotificationBody({ name: '집 앞 국밥' }, '111m', 500) === '반경 500m 앞, 집 앞 국밥 · 111m',
  nearbyNotificationBody({ name: '집 앞 국밥' }, '111m', 500)
);

const firstNew = firstNewNearby(nearby500, new Set());
check('새로 들어온 핀 1곳', firstNew && firstNew.pin.id === 'p-120m', firstNew && firstNew.pin.id);
check('이미 알린 핀은 건너뜀', firstNewNearby(nearby500, new Set(['p-120m'])).pin.id === 'p-450m');
check('모두 알렸으면 null', firstNewNearby(nearby500, new Set(['p-120m', 'p-450m'])) === null);
check('빈 목록이면 null', firstNewNearby([], new Set()) === null);
check('배열로 넘겨도 동작', firstNewNearby(nearby500, ['p-120m']).pin.id === 'p-450m');

if (fails) {
  console.log('LOCATION_FAILED=' + fails);
  process.exit(1);
}
console.log('LOCATION_OK');
