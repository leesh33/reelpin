/**
 * api/reverse-place.js — Vercel Serverless Function
 * ─────────────────────────────────────────────────────────────
 * GET /api/reverse-place?lat=<위도>&lng=<경도>[&radius=<m 10~200>]
 *
 * 지도에서 **꾹 누른 자리**(좌표)를 카카오 로컬로 조회해
 *   ① 그 자리의 **도로명·지번 주소 (+건물명)**
 *   ② 반경 `radius`(기본 60m) 안의 **가까운 장소 이름들**(거리순)
 * 을 한 번에 돌려줍니다. (v2.33.0 — 지도 꾹 눌러 장소 등록)
 *
 *   · 주소  … coord2address.json  (x=경도, y=위도)
 *   · 장소  … search/category.json × 4 묶음
 *             FD6 음식점 · CE7 카페 · AT4 관광명소 · CT1 문화시설
 *             (키워드 검색은 검색어가 있어야 해서 "주변 전체"를 못 찾습니다 →
 *              업종 묶음 검색을 반경 안에서 돌리고 거리순으로 합칩니다)
 *   · 다섯 요청은 **동시에** 보냅니다(4초 안에 끊김). 하나가 실패해도 나머지로 답합니다.
 *   · 브라우저는 카카오 도메인(CORS)을 직접 못 부르고 키도 숨겨야 해서 이 프록시를 씁니다.
 *
 * 키: 서버 환경변수 `KAKAO_REST_API_KEY` (또는 `EXPO_PUBLIC_KAKAO_REST_API_KEY`)
 * 실패 응답에는 키·업스트림 본문을 담지 않습니다.
 */
const { rawParam, fetchWithTimeout, sendJson, isGet, readJson, warn } = require('../server/http.js');

const KAKAO_COORD2ADDRESS = 'https://dapi.kakao.com/v2/local/geo/coord2address.json';
const KAKAO_CATEGORY = 'https://dapi.kakao.com/v2/local/search/category.json';

/**
 * 꾹 누른 자리에서 찾아볼 업종 묶음 — 앞에 있는 묶음이 같은 장소를 먼저 차지합니다.
 * (카카오 category_group_code 규격)
 */
const CATEGORY_GROUPS = ['FD6', 'CE7', 'AT4', 'CT1'];

/** 반경 기본값·상한(m) — 꾹 누른 손가락 아래 "바로 그 자리"만 보도록 좁게 */
const DEFAULT_RADIUS_M = 60;
const MAX_RADIUS_M = 200;
const MIN_RADIUS_M = 10;
/** 한 묶음에서 받아 올 장소 수 */
const GROUP_SIZE = 5;
/** 좌표가 없거나 0,0 이면 조회하지 않습니다. */
function parsePoint(req) {
  const latText = String(rawParam(req, 'lat') == null ? '' : rawParam(req, 'lat')).trim();
  const lngText = String(rawParam(req, 'lng') == null ? '' : rawParam(req, 'lng')).trim();
  // 빈 값은 Number('') = 0 이 되므로 **문자열이 비어 있으면** 먼저 거릅니다.
  if (!latText || !lngText) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  const rawRadius = Number(String(rawParam(req, 'radius') || '').trim());
  const radius = Number.isFinite(rawRadius) && rawRadius > 0
    ? Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.trunc(rawRadius)))
    : DEFAULT_RADIUS_M;
  return { lat, lng, radius };
}

/** 카카오 coord2address 문서 → 앱이 쓰는 주소 모양 */
function normalizeAddress(document) {
  if (!document || typeof document !== 'object') return null;
  const road = document.road_address && typeof document.road_address === 'object' ? document.road_address : null;
  const jibun = document.address && typeof document.address === 'object' ? document.address : null;
  const roadName = String((road && road.address_name) || '').trim();
  const jibunName = String((jibun && jibun.address_name) || '').trim();
  if (!roadName && !jibunName) return null;
  const building = String((road && road.building_name) || '').trim();
  // 동네 이름 — 지번 주소의 3depth(동교동·성수동2가)를 먼저, 없으면 구 이름
  const area = String((jibun && jibun.region_3depth_name) || (road && road.region_3depth_name) || (jibun && jibun.region_2depth_name) || '').trim();
  return {
    road: roadName,
    jibun: jibunName,
    building,
    area,
    zoneNo: String((road && road.zone_no) || '').trim(),
    label: roadName || jibunName,
  };
}

/** 카카오 category 검색 문서 → 앱이 쓰는 장소 모양 */
function normalizePlace(document) {
  if (!document || typeof document !== 'object') return null;
  const name = String(document.place_name || '').trim();
  if (!name) return null;
  const lat = Number(document.y);
  const lng = Number(document.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const distance = Number(document.distance);
  return {
    id: String(document.id || ''),
    name,
    categoryGroupCode: String(document.category_group_code || ''),
    categoryGroupName: String(document.category_group_name || ''),
    categoryName: String(document.category_name || ''),
    address: String(document.address_name || ''),
    roadAddress: String(document.road_address_name || ''),
    phone: String(document.phone || ''),
    placeUrl: String(document.place_url || ''),
    lat,
    lng,
    distance: Number.isFinite(distance) ? Math.round(distance) : null,
  };
}

/**
 * 여러 업종 묶음 결과 → 하나의 목록 (거리순).
 *   · 같은 장소(id)가 두 묶음에 나오면 앞선 묶음의 것만 남깁니다.
 *   · 이름은 같은데 id 가 없는 경우까지 생각해 이름+좌표(5m)도 겹침으로 봅니다.
 */
function mergePlaces(groups) {
  const seenIds = new Set();
  const seenNames = [];
  const merged = [];
  (Array.isArray(groups) ? groups : []).forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((place) => {
      if (!place) return;
      if (place.id && seenIds.has(place.id)) return;
      const near = seenNames.some(
        (other) =>
          other.name === place.name &&
          Math.abs(other.lat - place.lat) < 0.00005 &&
          Math.abs(other.lng - place.lng) < 0.00005
      );
      if (near) return;
      if (place.id) seenIds.add(place.id);
      seenNames.push(place);
      merged.push(place);
    });
  });
  merged.sort((a, b) => {
    const da = Number.isFinite(a.distance) ? a.distance : Number.POSITIVE_INFINITY;
    const db = Number.isFinite(b.distance) ? b.distance : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return String(a.name).localeCompare(String(b.name), 'ko');
  });
  return merged;
}

function categoryUrl(key, point, code) {
  return (
    KAKAO_CATEGORY +
    '?category_group_code=' +
    code +
    '&x=' +
    point.lng +
    '&y=' +
    point.lat +
    '&radius=' +
    point.radius +
    '&sort=distance&size=' +
    GROUP_SIZE
  );
}

module.exports = async function handler(req, res) {
  if (!isGet(req)) return sendJson(res, 405, { error: 'method-not-allowed' });

  const point = parsePoint(req);
  if (!point) {
    return sendJson(res, 400, {
      error: 'bad-coords',
      message: 'lat(위도)·lng(경도)가 필요합니다.',
    });
  }

  const key = process.env.KAKAO_REST_API_KEY || process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';
  if (!key) return sendJson(res, 503, { error: 'kakao-key-missing' });

  const headers = { Authorization: 'KakaoAK ' + key };
  const addressUrl =
    KAKAO_COORD2ADDRESS + '?x=' + point.lng + '&y=' + point.lat + '&input_coord=WGS84';

  // 다섯 요청을 동시에 — 하나가 늦거나 실패해도 나머지로 답합니다.
  const [addressResponse, ...groupResponses] = await Promise.all(
    [addressUrl]
      .concat(CATEGORY_GROUPS.map((code) => categoryUrl(key, point, code)))
      .map((url) => fetchWithTimeout(url, { method: 'GET', headers }))
  );

  const addressJson = await readJson(addressResponse);
  const address = normalizeAddress(addressJson && Array.isArray(addressJson.documents) ? addressJson.documents[0] : null);

  const groups = [];
  for (let i = 0; i < groupResponses.length; i += 1) {
    const json = await readJson(groupResponses[i]);
    const documents = json && Array.isArray(json.documents) ? json.documents : [];
    groups.push(documents.map(normalizePlace).filter(Boolean));
  }
  const places = mergePlaces(groups).filter((place) => place.distance == null || place.distance <= point.radius);

  if (!address && !places.length) {
    const status = addressResponse && addressResponse.status;
    warn('reverse-place: empty result (' + (status || 'no-response') + ')');
    return sendJson(res, 502, { error: 'reverse-place-failed' });
  }

  return sendJson(
    res,
    200,
    {
      ok: true,
      lat: point.lat,
      lng: point.lng,
      radius: point.radius,
      source: 'kakao',
      address,
      places,
    },
    60
  );
};

module.exports.parsePoint = parsePoint;
module.exports.normalizeAddress = normalizeAddress;
module.exports.normalizePlace = normalizePlace;
module.exports.mergePlaces = mergePlaces;
module.exports.CATEGORY_GROUPS = CATEGORY_GROUPS;
module.exports.DEFAULT_RADIUS_M = DEFAULT_RADIUS_M;
module.exports.MAX_RADIUS_M = MAX_RADIUS_M;
