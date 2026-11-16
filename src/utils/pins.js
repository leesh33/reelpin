/**
 * utils/pins.js
 * ─────────────────────────────────────────────────────────────
 * 후보(candidate) → 저장 핀(pin) 변환과, 예전에 저장된 핀의 모양 맞추기를 한곳에 모읍니다.
 *
 * v1.1 에서 핀에 새로 붙는 필드
 *   · placeUrl / placeUrlLabel … [매장 정보 보기] 버튼이 여는 주소와 그 출처 이름
 *   · providers               … 어느 지도에서 확인된 장소인지(['kakao','naver'])
 *   · confidence              … 후보 신뢰도(0.3~0.99)
 *   · platform 'search'       … 릴스 링크 없이 '가게명으로 찾기'로 저장한 핀
 *
 * v2.0 에서 핀에 새로 붙는 필드
 *   · phone                   … 지도 API 가 준 전화번호(상세 시트에서 tel: 원탭 연결)
 *   · naverPlaceId            … 네이버 플레이스 ID — 있으면 매장 정보가 상세 페이지로 직행
 *   · 여러 곳을 한 번에 저장할 때의 중복 판정(`splitNewPins`)도 이 파일에 모읍니다.
 *
 * v2.20 에서 핀에 새로 붙는 필드 (기기 로컬 전용 — 클라우드 스키마는 그대로)
 *   · hours           … 매장 영업시간(요일·브레이크·라스트오더·휴무) — 배지 계산용 스냅샷
 *   · hoursCheckedAt  … 영업시간을 확인한 시각(ISO). 6시간 지나면 다시 확인합니다
 *   · hoursName       … 서버가 확인해 준 매장 이름 (이름이 다르면 화면에서 무시)
 *
 * v2.10 에서 핀에 새로 붙는 필드
 *   · visited                 … ✅ '가봤어요' 방문 완료 (기본 false)
 *   · visitedAt               … 방문 체크를 한 시각(ISO). 체크를 풀면 빈 문자열
 *   · memo                    … 📝 한줄 메모 ("아기의자 있음 · 웨이팅 20분" 등)
 *   예전에 저장된 핀에는 이 필드가 없으므로 `normalizePin` 이 기본값을 채웁니다.
 */

/** 후보 → 핀. 저장에 필요한 값만 추리고, 나머지는 안전한 기본값으로 채웁니다. */
export function buildPin(candidate, options = {}) {
  if (!candidate || !candidate.name) return null;
  const now = options.now ? new Date(options.now) : new Date();
  const providers =
    Array.isArray(candidate.providers) && candidate.providers.length
      ? candidate.providers.slice()
      : candidate.provider
      ? [candidate.provider]
      : [];
  return {
    id: options.id || 'pin-' + now.getTime(),
    name: candidate.name,
    area: candidate.area || '',
    category: candidate.category || '맛집',
    menuTags: Array.isArray(candidate.menuTags) ? candidate.menuTags : [],
    address: candidate.address || '주소 미확인',
    lat: candidate.lat,
    lng: candidate.lng,
    placeUrl: candidate.placeUrl || '',
    placeUrlLabel: candidate.placeUrlLabel || '',
    phone: candidate.phone || '',
    naverPlaceId: String(candidate.naverPlaceId || ''),
    providers,
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : null,
    sourceUrl: options.sourceUrl || '',
    platform: options.platform || 'instagram',
    note: options.note || '',
    // v2.10 — 방문 체크 · 한줄 메모. 저장 화면에서 메모를 미리 적어 둘 수 있습니다.
    visited: options.visited === true,
    visitedAt: options.visited === true ? now.toISOString() : '',
    memo: normalizeMemo(options.memo != null ? options.memo : candidate.memo),
    // v2.20 — 영업시간 스냅샷 (추출 단계에서는 없습니다 — 상세를 열 때 채워집니다)
    hours: candidate.hours && typeof candidate.hours === 'object' ? candidate.hours : null,
    hoursCheckedAt: '',
    hoursName: '',
    createdAt: now.toISOString(),
  };
}

/** 한줄 메모 다듬기 — 줄바꿈은 공백으로, 앞뒤 공백 제거. (화면·DB·공유가 같은 값을 씁니다) */
export function normalizeMemo(value) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** ✅ 방문 완료 여부 (값이 없던 예전 핀은 미방문) */
export function isVisited(pin) {
  return Boolean(pin) && pin.visited === true;
}

/**
 * 예전 버전에서 저장된 핀(v1.0)을 현재 모양으로 맞춥니다.
 * 새 필드가 없어도 화면(배지·매장 정보 버튼)이 깨지지 않게 기본값을 채우고,
 * 이름 없는 깨진 항목은 목록에서 걸러 냅니다.
 */
export function normalizePin(pin) {
  if (!pin || !pin.name) return null;
  return {
    ...pin,
    area: pin.area || '',
    category: pin.category || '맛집',
    menuTags: Array.isArray(pin.menuTags) ? pin.menuTags : [],
    address: pin.address || '주소 미확인',
    placeUrl: pin.placeUrl || '',
    placeUrlLabel: pin.placeUrlLabel || '',
    phone: pin.phone || '',
    naverPlaceId: String(pin.naverPlaceId || ''),
    providers: Array.isArray(pin.providers) ? pin.providers : pin.provider ? [pin.provider] : [],
    confidence: typeof pin.confidence === 'number' ? pin.confidence : null,
    sourceUrl: pin.sourceUrl || '',
    platform: pin.platform || 'instagram',
    note: pin.note || '',
    // v2.10 — v2.9 이하에서 저장된 핀에는 없습니다. 화면이 기대하는 기본값을 채웁니다.
    visited: pin.visited === true,
    visitedAt: pin.visited === true ? String(pin.visitedAt || '') : '',
    memo: normalizeMemo(pin.memo),
    // v2.20 — v2.19 이하에서 저장된 핀에는 없습니다. (없으면 null → '영업시간 미확인')
    hours: pin.hours && typeof pin.hours === 'object' ? pin.hours : null,
    hoursCheckedAt: String(pin.hoursCheckedAt || ''),
    hoursName: String(pin.hoursName || ''),
  };
}

/**
 * v2.20 — 매장 상세에서 확인한 영업시간을 핀에 얹습니다. (기기 로컬에만 보관)
 *   · updatedAt 은 건드리지 않습니다 — 클라우드 동기화 대상(핀 내용)이 바뀐 게 아닙니다.
 */
export function withPlaceHours(pin, patch, options = {}) {
  if (!pin) return null;
  const now = options.now ? new Date(options.now) : new Date();
  const next = patch && typeof patch === 'object' ? patch : {};
  return normalizePin({
    ...pin,
    hours: next.hours && typeof next.hours === 'object' ? next.hours : null,
    hoursCheckedAt: String(next.hoursCheckedAt || now.toISOString()),
    hoursName: String(next.hoursName || ''),
  });
}

/**
 * ✅ 방문 체크 토글 — 원본을 바꾸지 않고 새 핀을 돌려줍니다.
 *   · 체크 … visited=true + visitedAt(지금)   · 해제 … visited=false + visitedAt=''
 *   · 화면·클라우드가 "최근에 바뀐 핀"을 알 수 있게 updatedAt 도 함께 갱신합니다.
 */
export function toggleVisited(pin, options = {}) {
  if (!pin) return null;
  const now = options.now ? new Date(options.now) : new Date();
  const next = pin.visited !== true;
  return normalizePin({
    ...pin,
    visited: next,
    visitedAt: next ? now.toISOString() : '',
    updatedAt: now.toISOString(),
  });
}

/** 📝 한줄 메모 저장 — 원본을 바꾸지 않고 새 핀을 돌려줍니다. */
export function withMemo(pin, memo, options = {}) {
  if (!pin) return null;
  const now = options.now ? new Date(options.now) : new Date();
  return normalizePin({ ...pin, memo: normalizeMemo(memo), updatedAt: now.toISOString() });
}

export function normalizePins(pins) {
  if (!Array.isArray(pins)) return [];
  return pins.map(normalizePin).filter(Boolean);
}

/** 같은 장소인지 (이름+동네 또는 매장 정보 URL) — 지도에 같은 핀이 두 번 꽂히는 걸 막습니다. */
export function findExistingPin(pins, candidate) {
  if (!Array.isArray(pins) || !candidate) return null;
  const placeUrl = String(candidate.placeUrl || '');
  if (placeUrl) {
    const byUrl = pins.find((p) => p && p.placeUrl && p.placeUrl === placeUrl);
    if (byUrl) return byUrl;
  }
  const naverPlaceId = String(candidate.naverPlaceId || '');
  if (naverPlaceId) {
    const byPlaceId = pins.find((p) => p && String(p.naverPlaceId || '') === naverPlaceId);
    if (byPlaceId) return byPlaceId;
  }
  const name = String(candidate.name || '').trim();
  if (!name) return null;
  return (
    pins.find(
      (p) => p && String(p.name || '').trim() === name && String(p.area || '') === String(candidate.area || '')
    ) || null
  );
}

// ─────────────────────────────────────────────────────────────
// v2.0 · 여러 곳 한 번에 저장 — 중복 판정
//   쇼츠 설명글의 '맛집 5곳'을 한꺼번에 저장할 때, 이미 꽂은 핀이나
//   같은 목록 안에서 두 번 나온 가게를 또 저장하지 않도록 걸러 냅니다.
//   판정 순서: 같은 네이버 placeId → 같은 매장 URL → 이름이 같고 좌표가 200m 안
// ─────────────────────────────────────────────────────────────
export const SAME_PLACE_RADIUS_M = 200;

/** 이름 비교용 — 공백·괄호·문장부호를 걷어냅니다. ('베통 성수' = '베통성수') */
export function normalizePlaceName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s\u00a0()[\]{}<>·,.'"“”‘’\-_/|]/g, '');
}

/** 두 좌표 사이 거리(m). 값이 없으면 Infinity */
export function pinDistanceMeters(a, b) {
  const lat1 = Number(a && a.lat);
  const lng1 = Number(a && a.lng);
  const lat2 = Number(b && b.lat);
  const lng2 = Number(b && b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 같은 가게인지 — 이름 + 좌표 근접(200m) 또는 같은 네이버 placeId/매장 URL */
export function isSamePin(a, b, options = {}) {
  if (!a || !b) return false;
  const radius = Number(options.radiusMeters) > 0 ? Number(options.radiusMeters) : SAME_PLACE_RADIUS_M;
  const idA = String(a.naverPlaceId || '');
  const idB = String(b.naverPlaceId || '');
  if (idA && idA === idB) return true;
  const urlA = String(a.placeUrl || '');
  const urlB = String(b.placeUrl || '');
  if (urlA && urlA === urlB) return true;
  const nameA = normalizePlaceName(a.name);
  const nameB = normalizePlaceName(b.name);
  if (!nameA || !nameB) return false;
  if (nameA !== nameB) return false;
  const d = pinDistanceMeters(a, b);
  return d <= radius || d === Infinity;
}

/**
 * 저장 목록 + 새 후보들 → { fresh, duplicates, skipped }
 *   · fresh      : 지금 저장해야 할 새 핀
 *   · duplicates : 이미 있는 핀(또는 새 목록 안에서 앞에 나온 핀)과 겹쳐 건너뛴 후보
 * @param {Array<object>} existing 저장된 핀
 * @param {Array<object>} incoming 새로 저장할 핀/후보
 */
export function splitNewPins(existing, incoming) {
  const saved = Array.isArray(existing) ? existing.filter(Boolean) : [];
  const list = Array.isArray(incoming) ? incoming.filter(Boolean) : [];
  const fresh = [];
  const duplicates = [];
  list.forEach((pin) => {
    const hit = saved.concat(fresh).find((p) => isSamePin(p, pin));
    if (hit) duplicates.push({ pin, existing: hit });
    else fresh.push(pin);
  });
  return { fresh, duplicates };
}

/**
 * v2.10 — 저장 요청 → 실제로 꽂을 핀.
 *   중복만 걸러 내고 **개수 한도는 없습니다** (v2.9까지의 무료 10개 제한을 없앴습니다).
 *   · fresh      : 지금 저장할 핀 (몇 개든 전부)
 *   · duplicates : 이미 있어서 건너뛴 핀
 */
export function planPinAddition(existing, incoming) {
  const { fresh, duplicates } = splitNewPins(existing, incoming);
  return { fresh, duplicates, added: fresh.length };
}
