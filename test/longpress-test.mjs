/**
 * test/longpress-test.mjs — v2.33.0
 * ─────────────────────────────────────────────────────────────
 * 지도 **꾹 눌러 장소 등록** 검사.
 *
 *   ① 순수 규칙 (src/utils/longPressPlace.js) — 꾹 누르기 판정·거리·이름/분류 제안·핀 만들기
 *   ② 서버 (/api/reverse-place) — 입력 검증·카카오 5요청 모양·합치기·실패 처리·키 노출 없음
 *   ③ 화면 서비스 (src/services/reversePlace.js) — 요청 경로·응답 해석
 *
 * 네트워크는 globalThis.fetch 스텁으로 대체합니다. (실제 카카오를 부르지 않음)
 */
import reversePlaceHandler, {
  CATEGORY_GROUPS,
  DEFAULT_RADIUS_M,
  MAX_RADIUS_M,
  mergePlaces,
  normalizeAddress,
  normalizePlace,
  parsePoint,
} from '../api/reverse-place.js';
import {
  buildReversePlacePath,
  fetchReversePlace,
  isValidPoint,
  REVERSE_PLACE_ENDPOINT,
} from '../src/services/reversePlace.js';
import { leafletAnchorCenter, naverAnchorCenter, naverCoordAtPress, normalizeAnchorY } from '../src/components/RealMapView.web.js';
import {
  LONG_PRESS_DEDUPE_METERS,
  LONG_PRESS_DEDUPE_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  NEARBY_PLACE_LIMIT,
  addressDetailOf,
  addressLabelOf,
  buildLongPressPin,
  categoryForGroup,
  isDuplicateLongPress,
  metersBetween,
  movedBeyondTolerance,
  nearbyPlaceRows,
  offsetPoint,
  placeDistanceLabel,
  pressOffsetPoint,
  suggestedCategoryOf,
  suggestedNameOf,
  visitedToggleText,
} from '../src/utils/longPressPlace.js';
import { pinToRow, rowToPin } from '../src/services/cloudSync.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

// ── 도우미 ───────────────────────────────────────────────────
function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    end(chunk) {
      if (chunk != null) this.body = String(chunk);
    },
    jsonBody() {
      try {
        return JSON.parse(this.body || 'null');
      } catch (e) {
        return null;
      }
    },
  };
}
async function callApi(query = {}, method = 'GET') {
  const res = makeRes();
  await reversePlaceHandler({ method, query }, res);
  return { status: res.statusCode, body: res.jsonBody(), raw: res.body, headers: res.headers };
}
const jsonRes = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const errRes = (status) => ({ ok: false, status, json: async () => ({}) });

let calls = [];
let handler = () => jsonRes({});
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return handler(String(url), init);
};

// ═════════════════════════════════════════════════════════════
// 1. 꾹 누르기 판정
// ═════════════════════════════════════════════════════════════
check(
  '꾹 누르기: 픽셀 → 지도 컨테이너 offset',
  JSON.stringify(offsetPoint({ left: 100, top: 50 }, 130, 90)) === JSON.stringify({ x: 30, y: 40 }),
  JSON.stringify(offsetPoint({ left: 100, top: 50 }, 130, 90))
);
check('꾹 누르기: 좌표가 숫자가 아니면 null', offsetPoint({ left: 0, top: 0 }, NaN, 10) === null);
check(
  '꾹 누르기: 12px 이내 움직임은 그대로(꾹 누르기)',
  movedBeyondTolerance({ x: 10, y: 10 }, { x: 15, y: 14 }) === false
);
check(
  '꾹 누르기: 12px 넘게 움직이면 취소(지도 끌기)',
  movedBeyondTolerance({ x: 10, y: 10 }, { x: 30, y: 10 }) === true
);
check(
  '꾹 누르기: 허용 거리 기본값 12px',
  LONG_PRESS_MOVE_TOLERANCE_PX === 12 &&
    movedBeyondTolerance({ x: 0, y: 0 }, { x: 12, y: 0 }) === false &&
    movedBeyondTolerance({ x: 0, y: 0 }, { x: 13, y: 0 }) === true,
  String(LONG_PRESS_MOVE_TOLERANCE_PX)
);
const meters = metersBetween({ lat: 37.5563, lng: 126.9236 }, { lat: 37.5573, lng: 126.9236 });
check('꾹 누르기: 위도 0.001도 ≈ 111m', meters > 105 && meters < 117, meters.toFixed(1));

const at = 1_700_000_000_000;
const near = { lat: 37.5563, lng: 126.9236, at };
check(
  '꾹 누르기: 같은 자리에서 곧바로 또 울리면 무시',
  isDuplicateLongPress(near, { lat: 37.55631, lng: 126.92361 }, at + 900) === true
);
check(
  '꾹 누르기: 30m 넘게 떨어진 자리는 새 꾹 누르기',
  isDuplicateLongPress(near, { lat: 37.5583, lng: 126.9236 }, at + 900) === false
);
check(
  '꾹 누르기: 1.2초가 지나면 새 꾹 누르기',
  isDuplicateLongPress(near, { lat: 37.5563, lng: 126.9236 }, at + LONG_PRESS_DEDUPE_MS + 1) === false
);
check('꾹 누르기: 중복 판정 반경 30m', LONG_PRESS_DEDUPE_METERS === 30, String(LONG_PRESS_DEDUPE_METERS));

// ═════════════════════════════════════════════════════════════
// 2. 답 → 화면에 보여 줄 이름·분류·거리
// ═════════════════════════════════════════════════════════════
check('거리: 12m', placeDistanceLabel(12) === '12m', placeDistanceLabel(12));
check('거리: 1.2km', placeDistanceLabel(1234) === '1.2km', placeDistanceLabel(1234));
check('거리: 값이 없으면 빈 문자열', placeDistanceLabel(null) === '' && placeDistanceLabel('abc') === '');

check('분류: FD6 음식점 → 맛집', categoryForGroup('FD6') === '맛집');
check('분류: CE7 카페 → 카페', categoryForGroup('CE7') === '카페');
check('분류: AT4 관광명소 → 가볼곳', categoryForGroup('AT4') === '가볼곳');
check('분류: 업종이 없으면 가볼곳(개인 장소)', categoryForGroup('') === '가볼곳');

const ADDRESS_FULL = {
  road: '서울특별시 마포구 양화로 156',
  jibun: '서울 마포구 동교동 165-8',
  building: 'LG팰리스빌딩',
  area: '동교동',
  label: '서울특별시 마포구 양화로 156',
};
check('주소: 도로명이 첫 줄', addressLabelOf(ADDRESS_FULL) === '서울특별시 마포구 양화로 156', addressLabelOf(ADDRESS_FULL));
check(
  '주소: 둘째 줄 = 건물명 · 지번',
  addressDetailOf(ADDRESS_FULL) === 'LG팰리스빌딩 · 서울 마포구 동교동 165-8',
  addressDetailOf(ADDRESS_FULL)
);
const ADDRESS_JIBUN_ONLY = { road: '', jibun: '서울 마포구 서교동 354-1', building: '', area: '서교동', label: '서울 마포구 서교동 354-1' };
check('주소: 도로명이 없으면 지번이 첫 줄', addressLabelOf(ADDRESS_JIBUN_ONLY) === '서울 마포구 서교동 354-1');
check('주소: 지번이 첫 줄이면 둘째 줄에 또 쓰지 않음', addressDetailOf(ADDRESS_JIBUN_ONLY) === '', addressDetailOf(ADDRESS_JIBUN_ONLY));

const RESULT = {
  address: ADDRESS_FULL,
  places: [
    { id: 'b', name: '먼집', categoryGroupCode: 'CE7', distance: 48 },
    { id: 'a', name: '가까운집', categoryGroupCode: 'FD6', distance: 12 },
    { id: 'c', name: '', distance: 3 },
    { id: 'd', name: '중간집', categoryGroupCode: 'AT4', distance: 30 },
    { id: 'e', name: '넷째집', categoryGroupCode: 'FD6', distance: 52 },
  ],
};
const rows = nearbyPlaceRows(RESULT);
check('목록: 거리순으로 정렬', rows.map((r) => r.name).join(',') === '가까운집,중간집,먼집', rows.map((r) => r.name).join(','));
check('목록: 이름 없는 항목은 빼고 최대 3곳', rows.length === NEARBY_PLACE_LIMIT && NEARBY_PLACE_LIMIT === 3, String(rows.length));
check('목록: 가장 가까운 장소 이름을 처음 채움', suggestedNameOf(RESULT) === '가까운집', suggestedNameOf(RESULT));
check('목록: 가장 가까운 장소 업종으로 분류를 채움', suggestedCategoryOf(RESULT) === '맛집', suggestedCategoryOf(RESULT));
check(
  '목록: 장소가 없으면 건물명 → 주소 순으로 이름 제안',
  suggestedNameOf({ address: ADDRESS_FULL, places: [] }) === 'LG팰리스빌딩' &&
    suggestedNameOf({ address: { road: '서울 마포구 양화로 156', label: '서울 마포구 양화로 156' }, places: [] }) === '서울 마포구 양화로 156'
);
check('목록: 아무것도 없으면 빈 이름(직접 입력)', suggestedNameOf(null) === '' && suggestedNameOf({}) === '');

// ── 핀 만들기 ────────────────────────────────────────────────
const POINT = { lat: 37.5563, lng: 126.9236 };
const place = RESULT.places[1];
const pin = buildLongPressPin({
  name: '  가까운집  ',
  category: '맛집',
  memo: '아기의자   있음\n웨이팅',
  point: POINT,
  place,
  address: ADDRESS_FULL,
  now: new Date('2026-11-18T12:00:00.000Z'),
});
check('핀: 이름 공백 정리', pin && pin.name === '가까운집', pin && pin.name);
check('핀: 출처 = 지도에서 저장(platform map)', pin && pin.platform === 'map', pin && pin.platform);
check('핀: 좌표·분류·분류 색이 앱 기본값', pin && pin.lat === POINT.lat && pin.lng === POINT.lng && pin.category === '맛집');
check('핀: 주소 = 도로명 · 동네 = 지번 3depth', pin && pin.address === ADDRESS_FULL.road && pin.area === '동교동', pin && pin.address + ' / ' + pin.area);
check('핀: 카카오 장소 정보(전화·링크·출처)', pin && pin.phone === '' && pin.placeUrl === '' && pin.providers.join(',') === 'kakao', JSON.stringify([pin && pin.phone, pin && pin.placeUrl, pin && pin.providers]));
check('핀: 한줄 메모는 한 줄로 정리', pin && pin.memo === '아기의자 있음 웨이팅', pin && pin.memo);
check('핀: 가봤어요는 기본 미방문', pin && pin.visited === false);

const personal = buildLongPressPin({
  name: '우리 가족 단골 자리',
  category: '가볼곳',
  point: POINT,
  place: null,
  address: ADDRESS_JIBUN_ONLY,
  now: new Date('2026-11-18T12:00:00.000Z'),
});
check('핀: 주변에 없어도 이름·좌표로 저장된다', personal && personal.name === '우리 가족 단골 자리' && personal.category === '가볼곳');
check('핀: 개인 장소는 출처(카카오) 없음', personal && personal.providers.length === 0 && personal.placeUrl === '', JSON.stringify(personal && personal.providers));
check('핀: 이름이 비면 만들지 않음', buildLongPressPin({ name: '   ', point: POINT }) === null);
check('핀: 좌표가 없으면 만들지 않음', buildLongPressPin({ name: '어딘가', point: { lat: 'x' } }) === null);

// ── v2.33.2 ✅ 가봤어요 토글 ──────────────────────────────
//   시트에서 체크해 저장하면 핀에 visited: true(+visitedAt 저장 시각) 로 담깁니다.
const VISIT_AT = new Date('2026-11-18T12:00:00.000Z');
const visitedPin = buildLongPressPin({
  name: '가까운집',
  category: '맛집',
  point: POINT,
  place,
  address: ADDRESS_FULL,
  visited: true,
  now: VISIT_AT,
});
check('가봤어요: 체크하고 저장하면 visited=true', visitedPin && visitedPin.visited === true, JSON.stringify(visitedPin && visitedPin.visited));
check(
  '가봤어요: 방문 시각(visitedAt)도 저장 시각으로 남는다',
  visitedPin && visitedPin.visitedAt === VISIT_AT.toISOString(),
  visitedPin && visitedPin.visitedAt
);
check('가봤어요: 체크하지 않으면 visited=false · visitedAt 빈 값', pin && pin.visited === false && pin.visitedAt === '', JSON.stringify([pin && pin.visited, pin && pin.visitedAt]));
check(
  '가봤어요: 문자열·undefined 같은 값은 체크로 보지 않음',
  buildLongPressPin({ name: '어딘가', point: POINT, visited: 'true' }).visited === false &&
    buildLongPressPin({ name: '어딘가', point: POINT }).visited === false
);
check(
  '가봤어요: 개인 장소(주변에 없음)에도 체크가 담긴다',
  buildLongPressPin({ name: '단골 주차장', point: POINT, address: ADDRESS_JIBUN_ONLY, visited: true, now: VISIT_AT }).visited === true
);
check(
  '가봤어요: 토글 글 — 미체크 `가봤어요` / 체크 `가봤어요 (방문 완료)`',
  visitedToggleText(false).label === '가봤어요' &&
    visitedToggleText(false).action === '체크' &&
    visitedToggleText(true).label === '가봤어요 (방문 완료)' &&
    visitedToggleText(true).action === '해제',
  JSON.stringify([visitedToggleText(false), visitedToggleText(true)])
);
// 클라우드(Supabase) 행으로 보낼 때도 visited 가 그대로 실립니다.
const cloudRow = pinToRow('user-1', visitedPin, { now: VISIT_AT });
check('가봤어요: 클라우드 행(pinToRow)에 visited=true 가 실린다', cloudRow && cloudRow.visited === true, JSON.stringify(cloudRow && cloudRow.visited));
check(
  '가봤어요: 클라우드에서 돌아온 행도 visited 를 지킨다',
  (() => {
    const back = rowToPin({ id: 'pin-1', name: '가까운집', visited: true, updated_at: VISIT_AT.toISOString() });
    return back && back.visited === true && back.visitedAt === VISIT_AT.toISOString();
  })()
);

// ── 시트가 열린 만큼 그 자리를 화면 위쪽에 두는 계산 ────────────
//   네이버: 지도 중심의 offset 은 (W/2, H/2) → 점을 (W/2, H×ratio) 에 두려면 그 차이만큼만 옮깁니다.
//   (처음엔 target offset 을 통째로 빼서 점이 화면 오른쪽 밖으로 밀렸습니다 — 실측으로 잡은 회귀)
const FakeLatLng = function (lat, lng) {
  this._lat = lat;
  this._lng = lng;
  this.lat = () => lat;
  this.lng = () => lng;
};
const fakeNv = { Point: function (x, y) { this.x = x; this.y = y; }, LatLng: FakeLatLng };
const linearProjection = {
  fromCoordToPoint: (coord) => ({ x: coord.lng() * 1000, y: -coord.lat() * 1000 }),
  fromPointToCoord: (point) => new FakeLatLng(-point.y / 1000, point.x / 1000),
};
const fakeNaverMap = (centerCoord) => ({ getProjection: () => linearProjection, getCenter: () => centerCoord });
/** 어떤 좌표가 지도에서 몇 px 에 보이는가 (offset = 중심offset + world차 × 2^zoom) */
const offsetOfNaver = (coord, centerCoord, zoom, size) => {
  const w = linearProjection.fromCoordToPoint(coord);
  const c = linearProjection.fromCoordToPoint(centerCoord);
  const scale = Math.pow(2, zoom);
  return { x: size.w / 2 + (w.x - c.x) * scale, y: size.h / 2 + (w.y - c.y) * scale };
};
const SHEET_SIZE = { w: 390, h: 786 };
const PRESS = new FakeLatLng(37.5563, 126.9236);
const anchored = naverAnchorCenter(fakeNv, fakeNaverMap(PRESS), PRESS, 16, SHEET_SIZE, 0.15);
const anchoredOffset = offsetOfNaver(PRESS, anchored, 16, SHEET_SIZE);
check(
  '지도 이동(네이버): 꾹 누른 자리가 화면 가로 가운데 · 세로 15% 에 온다',
  Math.abs(anchoredOffset.x - 195) < 0.001 && Math.abs(anchoredOffset.y - SHEET_SIZE.h * 0.15) < 0.001,
  JSON.stringify(anchoredOffset)
);
check(
  '지도 이동(네이버): anchorY 0.5 면 지도 중심 그대로',
  naverAnchorCenter(fakeNv, fakeNaverMap(PRESS), PRESS, 16, SHEET_SIZE, 0.5) === PRESS
);
check(
  '지도 이동(네이버): 지도·투영이 없으면 좌표를 그대로',
  naverAnchorCenter(null, null, PRESS, 16, SHEET_SIZE, 0.15) === PRESS
);

const linearLeaflet = {
  project: (latlng, zoom) => {
    const scale = Math.pow(2, zoom) * 256;
    const x = (latlng[1] * scale) / 360;
    const y = (-latlng[0] * scale) / 360;
    return { x, y, subtract: (p) => ({ x: x - p[0], y: y - p[1] }) };
  },
  unproject: (point, zoom) => {
    const scale = Math.pow(2, zoom) * 256;
    return { lat: (-point.y * 360) / scale, lng: (point.x * 360) / scale };
  },
};
const leafletCenter = leafletAnchorCenter(linearLeaflet, PRESS._lat, PRESS._lng, 16, SHEET_SIZE, 0.15);
const lc = linearLeaflet.project([leafletCenter[0], leafletCenter[1]], 16);
const lp = linearLeaflet.project([PRESS._lat, PRESS._lng], 16);
const leafletOffset = { x: SHEET_SIZE.w / 2 + (lp.x - lc.x), y: SHEET_SIZE.h / 2 + (lp.y - lc.y) };
check(
  '지도 이동(Leaflet): 같은 규칙(가운데 · 세로 15%)',
  Math.abs(leafletOffset.x - 195) < 0.001 && Math.abs(leafletOffset.y - SHEET_SIZE.h * 0.15) < 0.001,
  JSON.stringify(leafletOffset)
);
check(
  '지도 이동: anchorY 기본값은 가운데(0.5), 범위를 벗어나면 0.5',
  normalizeAnchorY(0.15) === 0.15 && normalizeAnchorY(0) === 0.5 && normalizeAnchorY(2) === 0.5 && normalizeAnchorY('x') === 0.5
);

// ═══════════════════════════════════════════════════════════
// 2-b) v2.33.1 — 지도를 **옮긴 뒤** 꾹 누른 픽셀 → 좌표 (회귀)
//   네이버 지도 v3 SDK 의 offset 좌표계를 그대로 흉내 냅니다:
//     · fromPointToOffset(p) = (p − projectionTopLeft) × 2^zoom − containerTopLeft
//     · fromOffsetToPoint(o) = (o + containerTopLeft) ÷ 2^zoom + projectionTopLeft
//     · panBy(d) … containerTopLeft −= d, 중심점 += d ÷ 2^zoom
//     · 컨테이너 픽셀 → 좌표 (SDK 포인터 이벤트) = fromOffsetToCoord(픽셀 − containerTopLeft)
//   즉 containerTopLeft 는 "지도를 끈 만큼 쌓이는 어긋남"입니다.
{
  const SIZE = { w: 390, h: 844 };
  const ZOOM = 16;
  const scale = Math.pow(2, ZOOM);
  const coordOfPoint = (p) => new FakeLatLng(-p.y / 1000, p.x / 1000);
  const pointOfCoord = (c) => ({ x: c.lng() * 1000, y: -c.lat() * 1000 });

  const makeMap = (centerCoord) => {
    const state = {
      centerPoint: pointOfCoord(centerCoord),
      zoom: ZOOM,
      ct: { x: 0, y: 0 },
    };
    const topLeft = () => ({
      x: state.centerPoint.x - SIZE.w / 2 / scale,
      y: state.centerPoint.y - SIZE.h / 2 / scale,
    });
    const projection = {
      fromCoordToPoint: (coord) => pointOfCoord(coord),
      fromPointToCoord: (point) => coordOfPoint(point),
      fromPointToOffset: (point) => {
        const tl = topLeft();
        return {
          x: (point.x - tl.x) * scale - state.ct.x,
          y: (point.y - tl.y) * scale - state.ct.y,
        };
      },
      fromOffsetToPoint: (offset) => {
        const tl = topLeft();
        return {
          x: (offset.x + state.ct.x) / scale + tl.x,
          y: (offset.y + state.ct.y) / scale + tl.y,
        };
      },
      fromCoordToOffset: (coord) => projection.fromPointToOffset(pointOfCoord(coord)),
      fromOffsetToCoord: (offset) => coordOfPoint(projection.fromOffsetToPoint(offset)),
    };
    const map = {
      getProjection: () => projection,
      getCenter: () => coordOfPoint(state.centerPoint),
      getSize: () => ({ width: SIZE.w, height: SIZE.h }),
      // 지도 끌기 — SDK 의 panBy 와 같은 누적
      panBy: (dx, dy) => {
        state.ct = { x: state.ct.x - dx, y: state.ct.y - dy };
        state.centerPoint = { x: state.centerPoint.x + dx / scale, y: state.centerPoint.y + dy / scale };
      },
      // 화면을 그대로 다시 그린 기준(크기 변화) — offset 어긋남이 0 으로 돌아감
      resetOffset: () => {
        state.ct = { x: 0, y: 0 };
      },
    };
    return { map, projection, state };
  };

  /** 지금 화면에서 그 픽셀에 실제로 보이는 좌표 (SDK 포인터 이벤트와 같은 계산) */
  const trueCoordAt = (projection, state, pixel) =>
    projection.fromOffsetToCoord({ x: pixel.x - state.ct.x, y: pixel.y - state.ct.y });
  const pixelOf = (coord, projection, state) => {
    const offset = projection.fromCoordToOffset(coord);
    return { x: offset.x + state.ct.x, y: offset.y + state.ct.y };
  };
  const near = (a, b) =>
    Boolean(a) && Boolean(b) && Math.abs(a.lat() - b.lat()) < 0.000001 && Math.abs(a.lng() - b.lng()) < 0.000001;

  const START = new FakeLatLng(37.5563, 126.9236);
  const PRESS_PX = { x: 195, y: 300 };

  // ① 옮기지 않은 지도 — 예전 방식도 맞습니다 (신고: "내 위치 주변은 맞음")
  {
    const { map, projection, state } = makeMap(START);
    const viaFix = naverCoordAtPress(fakeNv, map, PRESS_PX);
    const truth = trueCoordAt(projection, state, PRESS_PX);
    const viaOld = projection.fromOffsetToCoord(new fakeNv.Point(PRESS_PX.x, PRESS_PX.y));
    check('지도 이동: 옮기지 않았으면 누른 픽셀 그대로', near(viaFix, truth) && near(viaOld, truth));
  }

  // ② 옮긴 지도 — 예전 방식은 엉뚱한 자리, 고친 방식은 누른 그 자리
  {
    const { map, projection, state } = makeMap(START);
    map.panBy(600, 420); // 오른쪽·아래로 600·420px 끌기
    const viaFix = naverCoordAtPress(fakeNv, map, PRESS_PX);
    const truth = trueCoordAt(projection, state, PRESS_PX);
    const viaOld = projection.fromOffsetToCoord(new fakeNv.Point(PRESS_PX.x, PRESS_PX.y));
    const oldPixel = pixelOf(viaOld, projection, state);
    const oldDistance = Math.hypot(oldPixel.x - PRESS_PX.x, oldPixel.y - PRESS_PX.y);
    check(
      '[핵심] 옮긴 지도: 고친 방식 = 누른 자리 좌표',
      near(viaFix, truth),
      JSON.stringify({ got: [viaFix.lat(), viaFix.lng()], want: [truth.lat(), truth.lng()] })
    );
    check(
      '[핵심] 옮긴 지도: 예전 방식은 누른 자리에서 600·420px 밖(신고된 버그)',
      oldDistance > 700,
      'distance=' + oldDistance.toFixed(1) + 'px'
    );
  }

  // ③ 여러 번 옮기고 크기 기준이 다시 잡혀도 그대로
  {
    const { map, projection, state } = makeMap(START);
    map.panBy(-250, 100);
    map.panBy(180, -320);
    map.panBy(90, 45);
    const viaFix = naverCoordAtPress(fakeNv, map, { x: 40, y: 780 });
    const truth = trueCoordAt(projection, state, { x: 40, y: 780 });
    check('옮긴 지도: 여러 번 옮긴 뒤 화면 가장자리를 눌러도 그 자리', near(viaFix, truth));
    map.resetOffset();
    const again = naverCoordAtPress(fakeNv, map, { x: 40, y: 780 });
    const truthAgain = trueCoordAt(projection, state, { x: 40, y: 780 });
    check('옮긴 지도: offset 기준이 리셋된 뒤에도 그 자리', near(again, truthAgain));
  }

  // ④ 화면 한가운데를 누르면 지도 중심
  {
    const { map } = makeMap(START);
    map.panBy(300, 200);
    const viaFix = naverCoordAtPress(fakeNv, map, { x: SIZE.w / 2, y: SIZE.h / 2 });
    const center = map.getCenter();
    check(
      '옮긴 지도: 한가운데를 누르면 지도 중심 좌표',
      Math.abs(viaFix.lat() - center.lat()) < 0.000001 && Math.abs(viaFix.lng() - center.lng()) < 0.000001,
      JSON.stringify([viaFix.lat(), viaFix.lng(), center.lat(), center.lng()])
    );
  }

  // ⑤ 좌표 계산 단위 규칙
  check(
    '픽셀→offset: 중심 offset + (누른 픽셀 − 화면 한가운데)',
    JSON.stringify(pressOffsetPoint({ x: 100, y: 200 }, { w: 390, h: 844 }, { x: 195, y: 300 })) ===
      JSON.stringify({ x: 100, y: 200 + (300 - 422) }),
    JSON.stringify(pressOffsetPoint({ x: 100, y: 200 }, { w: 390, h: 844 }, { x: 195, y: 300 }))
  );
  check(
    '픽셀→offset: 크기를 {width,height} 로 줘도 같다',
    JSON.stringify(pressOffsetPoint({ x: 0, y: 0 }, { width: 390, height: 844 }, { x: 195, y: 422 })) ===
      JSON.stringify({ x: 0, y: 0 })
  );
  check(
    '픽셀→offset: 값이 없거나 0 크기면 null',
    pressOffsetPoint(null, { w: 390, h: 844 }, PRESS_PX) === null &&
      pressOffsetPoint({ x: 0, y: 0 }, { w: 0, h: 0 }, PRESS_PX) === null &&
      pressOffsetPoint({ x: 0, y: 0 }, { w: 390, h: 844 }, { x: NaN, y: 1 }) === null
  );
  check(
    '픽셀→offset: 지도·투영이 없으면 좌표를 만들지 않는다(던지지 않음)',
    naverCoordAtPress(null, null, PRESS_PX) === null &&
      naverCoordAtPress(fakeNv, { getProjection: () => null }, PRESS_PX) === null &&
      naverCoordAtPress(fakeNv, { getProjection: () => ({}) }, PRESS_PX) === null
  );
  // SDK 가 중심·크기를 못 알려 줘도 예전 방식으로라도 좌표를 낸다
  {
    const { map, projection, state } = makeMap(START);
    const blind = { getProjection: () => projection };
    const coord = naverCoordAtPress(fakeNv, blind, PRESS_PX);
    const truth = trueCoordAt(projection, state, PRESS_PX);
    check(
      '옛 SDK(중심·크기 없음): 예전 방식으로 좌표를 낸다 · 옮기지 않았을 때는 정확',
      Boolean(coord) &&
        Math.abs(coord.lat() - truth.lat()) < 0.000001 &&
        Math.abs(coord.lng() - truth.lng()) < 0.000001
    );
  }
}

// ═════════════════════════════════════════════════════════════
// 3. /api/reverse-place
// ═════════════════════════════════════════════════════════════
const SECRET = 'KAKAO_SECRET_KEY_REVERSE';
delete process.env.KAKAO_REST_API_KEY;
delete process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

let r = await callApi({});
check('api: 좌표가 없으면 400 bad-coords', r.status === 400 && r.body.error === 'bad-coords', JSON.stringify(r.body));
r = await callApi({ lat: '', lng: '126.9' });
check('api: 빈 위도는 0 이 아니라 "없음"으로 처리', r.status === 400, String(r.status));
r = await callApi({ lat: '37.5', lng: '' });
check('api: 빈 경도도 400', r.status === 400, String(r.status));
r = await callApi({ lat: '999', lng: '126.9' });
check('api: 범위 밖 위도 → 400', r.status === 400);
r = await callApi({ lat: '0', lng: '0' });
check('api: 0,0 은 조회하지 않음 → 400', r.status === 400);
r = await callApi({ lat: '37.5', lng: '126.9' }, 'POST');
check('api: POST → 405', r.status === 405);
r = await callApi({ lat: '37.5', lng: '126.9' });
check('api: 키가 없으면 503 kakao-key-missing', r.status === 503 && r.body.error === 'kakao-key-missing', JSON.stringify(r.body));

process.env.KAKAO_REST_API_KEY = SECRET;
calls = [];
handler = (url) => {
  if (url.indexOf('/geo/coord2address') > 0) {
    return jsonRes({
      documents: [
        {
          road_address: {
            address_name: '서울특별시 마포구 양화로 156',
            building_name: 'LG팰리스빌딩',
            zone_no: '04050',
          },
          address: { address_name: '서울 마포구 동교동 165-8', region_3depth_name: '동교동' },
        },
      ],
    });
  }
  if (url.indexOf('category_group_code=FD6') > 0) {
    return jsonRes({
      documents: [
        { id: '1', place_name: '면사랑', category_group_code: 'FD6', category_group_name: '음식점', distance: '24', x: '126.9234', y: '37.5561', phone: '', place_url: 'http://place.map.kakao.com/1', address_name: '서울 마포구 동교동 165-8', road_address_name: '서울특별시 마포구 양화로 156' },
        { id: '2', place_name: '먼곳', category_group_code: 'FD6', category_group_name: '음식점', distance: '90', x: '126.9240', y: '37.5570' },
      ],
    });
  }
  if (url.indexOf('category_group_code=CE7') > 0) {
    return jsonRes({
      documents: [
        { id: '3', place_name: '공미학', category_group_code: 'CE7', category_group_name: '카페', distance: '27', x: '126.9238', y: '37.5564' },
        // 같은 장소가 두 묶음에 또 나오는 경우 — 한 번만
        { id: '1', place_name: '면사랑', category_group_code: 'FD6', category_group_name: '음식점', distance: '24', x: '126.9234', y: '37.5561' },
      ],
    });
  }
  return jsonRes({ documents: [] });
};
r = await callApi({ lat: '37.5563', lng: '126.9236' });
const urls = calls.map((c) => c.url);
check('api: 업스트림 5회 (주소 1 + 업종 4)', calls.length === 5, String(calls.length));
check(
  'api: 업종 묶음 FD6·CE7·AT4·CT1',
  CATEGORY_GROUPS.join(',') === 'FD6,CE7,AT4,CT1' && CATEGORY_GROUPS.every((code) => urls.some((u) => u.indexOf('category_group_code=' + code) > 0)),
  CATEGORY_GROUPS.join(',')
);
check(
  'api: 좌표·반경·거리순·개수(카카오 규격)',
  urls.some(
    (u) =>
      u.indexOf('https://dapi.kakao.com/v2/local/search/category.json?') === 0 &&
      u.indexOf('&x=126.9236') > 0 &&
      u.indexOf('&y=37.5563') > 0 &&
      u.indexOf('&radius=' + DEFAULT_RADIUS_M) > 0 &&
      u.indexOf('&sort=distance') > 0 &&
      u.indexOf('&size=5') > 0
  ),
  urls[1]
);
check(
  'api: 주소 조회는 coord2address + WGS84',
  urls.some((u) => u.indexOf('https://dapi.kakao.com/v2/local/geo/coord2address.json?x=126.9236&y=37.5563&input_coord=WGS84') === 0),
  urls[0]
);
check('api: KakaoAK 헤더', calls[0].init.headers.Authorization === 'KakaoAK ' + SECRET);
check('api: 성공 200', r.status === 200 && r.body.ok === true, String(r.status));
check('api: 주소 정리(도로명·건물명·지번·동네)', r.body.address.road === '서울특별시 마포구 양화로 156' && r.body.address.building === 'LG팰리스빌딩' && r.body.address.jibun === '서울 마포구 동교동 165-8' && r.body.address.area === '동교동', JSON.stringify(r.body.address));
check(
  'api: 장소는 거리순 + 중복(id) 제거',
  r.body.places.map((p) => p.name).join(',') === '면사랑,공미학',
  r.body.places.map((p) => p.name).join(',')
);
check('api: 반경 밖(90m)은 빼고 거리 숫자로', r.body.places.length === 2 && r.body.places[0].distance === 24, JSON.stringify(r.body.places.map((p) => p.distance)));
check('api: 장소 좌표는 숫자(y=위도, x=경도)', r.body.places[0].lat === 37.5561 && r.body.places[0].lng === 126.9234, JSON.stringify([r.body.places[0].lat, r.body.places[0].lng]));
check('api: 같은 출처용 짧은 캐시(60초)', String(r.headers['cache-control'] || '').indexOf('s-maxage=60') >= 0, r.headers['cache-control']);
check('api: 키가 응답 본문에 없음', r.raw.indexOf(SECRET) < 0, r.raw.slice(0, 80));

// 반경 상한·하한
calls = [];
handler = () => jsonRes({ documents: [] });
r = await callApi({ lat: '37.5563', lng: '126.9236', radius: '9999' });
check(
  'api: 반경 상한 200m',
  (r.status === 200 || r.status === 502) && calls.some((c) => c.url.indexOf('&radius=' + MAX_RADIUS_M) > 0),
  String(MAX_RADIUS_M)
);
calls = [];
r = await callApi({ lat: '37.5563', lng: '126.9236', radius: '3' });
check(
  'api: 반경 하한 10m',
  (r.status === 200 || r.status === 502) && calls.some((c) => c.url.indexOf('&radius=10') > 0)
);

// 주소만 실패 → 장소로 답
calls = [];
handler = (url) => (url.indexOf('/geo/coord2address') > 0 ? errRes(500) : jsonRes({ documents: [{ id: '9', place_name: '카페온도', category_group_code: 'CE7', distance: '11', x: '126.9239', y: '37.5562' }] }));
r = await callApi({ lat: '37.5563', lng: '126.9236' });
check('api: 주소 조회가 실패해도 장소가 있으면 200', r.status === 200 && r.body.address === null && r.body.places.length === 1, JSON.stringify({ status: r.status, address: r.body.address }));

// 업종 검색이 실패해도 주소가 있으면 200
handler = (url) =>
  url.indexOf('/geo/coord2address') > 0
    ? jsonRes({ documents: [{ road_address: { address_name: '서울 마포구 양화로 156' }, address: { address_name: '서울 마포구 동교동 165-8', region_3depth_name: '동교동' } }] })
    : errRes(429);
r = await callApi({ lat: '37.5563', lng: '126.9236' });
check('api: 업종 검색이 429 여도 주소로 200', r.status === 200 && r.body.places.length === 0 && r.body.address.road === '서울 마포구 양화로 156', JSON.stringify({ status: r.status, places: r.body.places.length }));

// 둘 다 실패 → 502
handler = () => errRes(500);
r = await callApi({ lat: '37.5563', lng: '126.9236' });
check('api: 주소·장소 모두 실패 → 502', r.status === 502 && r.body.error === 'reverse-place-failed', JSON.stringify(r.body));
check('api(실패): 키 노출 없음', r.raw.indexOf(SECRET) < 0, r.raw);

// req.query 없이 URL 만 오는 런타임
calls = [];
handler = () => jsonRes({ documents: [] });
const urlOnly = makeRes();
await reversePlaceHandler({ method: 'GET', url: '/api/reverse-place?lat=37.5563&lng=126.9236&radius=80' }, urlOnly);
check(
  'api: req.query 없어도 URL 쿼리로 동작',
  (urlOnly.statusCode === 200 || urlOnly.statusCode === 502) && calls.some((c) => c.url.indexOf('&radius=80') > 0),
  calls[0] && calls[0].url
);

// 파서 단위
check('api parsePoint: 기본 반경 60m', parsePoint({ query: { lat: '37.5', lng: '127.0' } }).radius === 60);
check('api parsePoint: 잘못된 좌표는 null', parsePoint({ query: { lat: 'abc', lng: '127.0' } }) === null);
check('api normalizeAddress: 주소가 비면 null', normalizeAddress({}) === null && normalizeAddress(null) === null);
check('api normalizePlace: 이름이 없으면 null', normalizePlace({ place_name: '', x: '1', y: '1' }) === null);
check('api normalizePlace: 좌표가 숫자가 아니면 null', normalizePlace({ place_name: 'x', x: 'a', y: 'b' }) === null);
check(
  'api mergePlaces: id 중복 제거 + 거리순',
  mergePlaces([[{ id: '1', name: 'A', distance: 30 }], [{ id: '1', name: 'A', distance: 30 }, { id: '2', name: 'B', distance: 5 }]])
    .map((p) => p.id)
    .join(',') === '2,1'
);

// ═════════════════════════════════════════════════════════════
// 4. 화면 서비스 (services/reversePlace.js)
// ═════════════════════════════════════════════════════════════
check('service: 좌표 판정', isValidPoint({ lat: 37.5, lng: 127 }) === true && isValidPoint({ lat: 0, lng: 0 }) === false && isValidPoint(null) === false);
check(
  'service: 요청 경로',
  buildReversePlacePath({ lat: 37.5563, lng: 126.9236 }) === REVERSE_PLACE_ENDPOINT + '?lat=37.5563&lng=126.9236&radius=60',
  buildReversePlacePath({ lat: 37.5563, lng: 126.9236 })
);
check('service: 반경을 넘기면 그대로', buildReversePlacePath({ lat: 37.5, lng: 127 }, { radius: 80 }).indexOf('&radius=80') > 0);
check('service: 좌표가 없으면 빈 경로', buildReversePlacePath({ lat: 'x' }) === '');

calls = [];
handler = () => jsonRes({ ok: true, address: { road: '서울특별시 마포구 양화로 156' }, places: [{ id: '1', name: '면사랑', distance: 24 }] });
let fetched = await fetchReversePlace({ lat: 37.5563, lng: 126.9236 });
check('service: 성공 → 주소·장소', fetched.ok === true && fetched.address.road === '서울특별시 마포구 양화로 156' && fetched.places.length === 1, JSON.stringify(fetched));
check('service: 같은 출처 상대 경로로 부른다(키는 브라우저에 없음)', calls[0].url.indexOf('/api/reverse-place?') === 0, calls[0].url);

handler = () => errRes(503);
fetched = await fetchReversePlace({ lat: 37.5563, lng: 126.9236 });
check('service: 503 → ok:false reason', fetched.ok === false && fetched.reason === 'network', JSON.stringify(fetched));

handler = () => jsonRes({ ok: false, error: 'reverse-place-failed' });
fetched = await fetchReversePlace({ lat: 37.5563, lng: 126.9236 });
check('service: 서버 실패 → ok:false', fetched.ok === false && fetched.reason === 'reverse-place-failed', JSON.stringify(fetched));

const savedFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error('network-down');
};
fetched = await fetchReversePlace({ lat: 37.5563, lng: 126.9236 });
check('service: 네트워크 예외도 던지지 않는다', fetched.ok === false, JSON.stringify(fetched));
globalThis.fetch = savedFetch;

if (fails) {
  console.log('\nLONGPRESS_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nLONGPRESS_TESTS_OK');
