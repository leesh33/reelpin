/**
 * utils/curation.js — v2.31 🗂️ 컬렉션 기획전 · 공유 링크
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청(2026-11-18):
 *   "컬렉션 탭에서 다른 사람에게 내 컬렉션을 자랑(공유)할 수 있게,
 *    운영자는 기획전·스폰서 배너를 올리고 /admin 에서 관리"
 *
 * 이 파일은 **순수 자바스크립트**입니다(react-native·storage·supabase import 없음).
 *   · 화면(CollectionsScreen · SharedCollectionModal · AdminScreen)과 서비스(curation.js),
 *     테스트(curation-test.mjs)가 같은 규칙을 씁니다.
 *   · 장소 하나의 모양은 **지도에 꽂는 데 필요한 최소 정보**만 담습니다.
 *     (이름 · 분류 · 동네 · 주소 · 좌표 — 메모·전화번호 같은 개인 기록은 공유하지 않습니다)
 *
 * 공유 링크
 *   https://reelpin.vercel.app/?col=<shareId>
 *   → `?col=` 하나로 받는 사람이 미리보기를 열고 [내 지도에 담기] 를 누를 수 있습니다.
 *   (기존 `?share=<압축 코드>` 링크와 함께 동작합니다)
 */
import { buildPin, planPinAddition } from './pins';

/** 배너·기획전 글자 수 상한 (DB check 제약과 같은 값) */
export const BANNER_LIMITS = { title: 40, subtitle: 80, badge: 10, linkUrl: 300 };
export const CURATED_LIMITS = {
  title: 40,
  description: 100,
  sponsor: 20,
  badge: 10,
  places: 50,
};
/** 공유 스냅샷에 담는 장소 수 상한 (DB check 와 같은 값) */
export const SHARE_MAX_PLACES = 100;
/** 장소 하나의 필드 상한 */
export const PLACE_LIMITS = { name: 80, category: 20, area: 40, address: 160 };

/** 기획전·배너 배지 기본값 — 화면에서 자주 쓰는 두 가지 */
export const CURATION_BADGES = ['기획전', '스폰서', '추천'];
/** 기획전 카드에서 고를 수 있는 이모지 (컬렉션과 같은 결) */
export const CURATED_EMOJIS = ['📂', '🍜', '☕', '🍰', '🍱', '🏞️', '🛍️', '🎬', '🚗', '🧸'];
/** 기획전 카드 포인트 색 */
export const CURATED_COLORS = ['#0D9488', '#F2A03D', '#0FA968', '#3B82F6', '#8B5CF6', '#EC4899'];
export const DEFAULT_CURATED_EMOJI = '📂';
export const DEFAULT_CURATED_COLOR = '#0D9488';

/** 공유 링크 파라미터 이름 */
export const COLLECTION_PARAM = 'col';

function clampText(value, max) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeEmoji(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return DEFAULT_CURATED_EMOJI;
  return Array.from(text).slice(0, 2).join('');
}

function normalizeColor(value) {
  const text = String(value == null ? '' : value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : DEFAULT_CURATED_COLOR;
}

/** 좌표 — 숫자로 읽히고 범위 안일 때만 값, 아니면 null (지도에 못 꽂는 장소) */
export function normalizeCoord(value, kind) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (kind === 'lat' && (n < -90 || n > 90)) return null;
  if (kind === 'lng' && (n < -180 || n > 180)) return null;
  return n;
}

/**
 * 장소 하나 다듬기 — 이름이 없으면 null.
 * 공유·기획전에는 **이름·분류·동네·주소·좌표**만 담습니다(개인 메모·전화번호 제외).
 */
export function normalizePlace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = clampText(raw.name, PLACE_LIMITS.name);
  if (!name) return null;
  const lat = normalizeCoord(raw.lat, 'lat');
  const lng = normalizeCoord(raw.lng, 'lng');
  return {
    name,
    category: clampText(raw.category, PLACE_LIMITS.category),
    area: clampText(raw.area, PLACE_LIMITS.area),
    address: clampText(raw.address, PLACE_LIMITS.address),
    lat,
    lng,
  };
}

/** 장소 목록 다듬기 — 이름 없는 항목은 버리고, 같은 이름+좌표는 한 번만 */
export function normalizePlaces(list, max = SHARE_MAX_PLACES) {
  const cap = Number(max) > 0 ? Math.min(Number(max), 200) : SHARE_MAX_PLACES;
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((raw) => {
    const place = normalizePlace(raw);
    if (!place) return;
    const key =
      place.name.toLowerCase() +
      '|' +
      (place.lat == null ? '' : place.lat.toFixed(5)) +
      '|' +
      (place.lng == null ? '' : place.lng.toFixed(5));
    if (seen.has(key)) return;
    seen.add(key);
    out.push(place);
  });
  return out.slice(0, cap);
}

/** 내 핀 → 공유 스냅샷 (필요한 필드만, 최대 100곳) */
export function placesFromPins(pins, max = SHARE_MAX_PLACES) {
  return normalizePlaces(
    (Array.isArray(pins) ? pins : []).map((pin) => ({
      name: pin && pin.name,
      category: pin && pin.category,
      area: pin && pin.area,
      address: pin && pin.address,
      lat: pin && pin.lat,
      lng: pin && pin.lng,
    })),
    max
  );
}

/** 배너 한 줄 → 화면·저장이 쓰는 모양 */
export function normalizeBanner(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clampText(raw.title, BANNER_LIMITS.title);
  if (!title) return null;
  const linkUrl = clampText(raw.linkUrl || raw.link_url, BANNER_LIMITS.linkUrl);
  return {
    id: String(raw.id || '').trim() || 'banner-' + title,
    title,
    subtitle: clampText(raw.subtitle, BANNER_LIMITS.subtitle),
    badge: clampText(raw.badge, BANNER_LIMITS.badge) || '기획전',
    linkUrl: /^https?:\/\//i.test(linkUrl) ? linkUrl : '',
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0,
    active: raw.active !== false,
    createdAt: String(raw.createdAt || ''),
  };
}

export function normalizeBanners(list) {
  return (Array.isArray(list) ? list : []).map(normalizeBanner).filter(Boolean);
}

/** 기획전(운영자 추천 컬렉션) 하나 → 화면·저장이 쓰는 모양 */
export function normalizeCurated(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clampText(raw.title, CURATED_LIMITS.title);
  if (!title) return null;
  const places = normalizePlaces(raw.places, CURATED_LIMITS.places);
  return {
    id: String(raw.id || '').trim() || 'curated-' + title,
    title,
    description: clampText(raw.description, CURATED_LIMITS.description),
    sponsor: clampText(raw.sponsor, CURATED_LIMITS.sponsor),
    badge: clampText(raw.badge, CURATED_LIMITS.badge) || '기획전',
    emoji: normalizeEmoji(raw.emoji),
    color: normalizeColor(raw.color),
    places,
    placeCount: places.length,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0,
    active: raw.active !== false,
    createdAt: String(raw.createdAt || ''),
  };
}

export function normalizeCuratedList(list) {
  return (Array.isArray(list) ? list : []).map(normalizeCurated).filter(Boolean);
}

/**
 * 기획전·공유 컬렉션의 장소를 내 지도에 담을 계획을 세웁니다.
 *   · 이미 있는 장소(이름 + 200m / 같은 placeId·매장 URL)는 **새로 만들지 않고**
 *     그 핀 id 를 컬렉션에 넣습니다 → 중복 핀이 생기지 않습니다.
 *   · 좌표가 없는 장소도 이름은 살리되, 지도에는 찍히지 않는다고 화면이 알려 줍니다.
 *
 * @returns {{
 *   places: Array, candidates: Array, fresh: Array, duplicates: Array,
 *   pinIds: Array, added: number, existing: number, collection: {name,desc,emoji,color,pinIds}
 * }}
 */
export function planCuratedImport(curated, existingPins, options = {}) {
  const source = curated || {};
  const places = normalizePlaces(source.places, CURATED_LIMITS.places);
  const now = options.now || new Date();
  const stamp = new Date(now).getTime();
  const candidates = places
    .map((place, index) =>
      buildPin(
        {
          name: place.name,
          category: place.category || '맛집',
          area: place.area,
          address: place.address || '주소 미확인',
          lat: place.lat == null ? undefined : place.lat,
          lng: place.lng == null ? undefined : place.lng,
        },
        { id: 'pin-cur-' + stamp + '-' + index + '-' + Math.random().toString(36).slice(2, 6), now }
      )
    )
    .filter(Boolean);

  const { fresh, duplicates } = planPinAddition(existingPins, candidates);
  const pinIds = [];
  const seen = new Set();
  const push = (id) => {
    const key = String(id == null ? '' : id);
    if (!key || seen.has(key)) return;
    seen.add(key);
    pinIds.push(key);
  };
  fresh.forEach((pin) => push(pin.id));
  duplicates.forEach((row) => row && row.existing && push(row.existing.id));

  const title = clampText(source.title, CURATED_LIMITS.title) || '기획전';
  return {
    places,
    candidates,
    fresh,
    duplicates,
    pinIds,
    added: fresh.length,
    existing: duplicates.length,
    collection: {
      name: clampText(source.title, CURATED_LIMITS.title) || title,
      desc: clampText(source.description, CURATED_LIMITS.description),
      emoji: normalizeEmoji(source.emoji),
      color: normalizeColor(source.color),
      pinIds,
    },
  };
}

/** 담기 결과를 사용자에게 한 줄로 — 사실만 말합니다. */
export function importSummary(result) {
  if (!result || (!result.added && !result.existing)) return '담을 장소가 없어요';
  const parts = [];
  if (result.added) parts.push(result.added + '곳을 내 지도에 담았어요');
  if (result.existing) parts.push(result.existing + '곳은 이미 있어요');
  return parts.join(' · ');
}

/** 공유 문구 — `🍜 이름 · N곳` + 설명 + 장소 목록 (링크는 화면이 따로 붙입니다) */
export function collectionShareBody(collection, places) {
  const c = collection || {};
  const list = normalizePlaces(places);
  const head = normalizeEmoji(c.emoji) + ' ' + (clampText(c.title || c.name, CURATED_LIMITS.title) || '내 컬렉션');
  const sub = clampText(c.description || c.desc, CURATED_LIMITS.description);
  const lines = [head + (sub ? ' · ' + sub : '') + ' · ' + list.length + '곳'];
  list.forEach((place, index) => {
    const meta = [place.category, place.area].filter(Boolean).join(' · ');
    lines.push(index + 1 + '. ' + place.name + (meta ? ' (' + meta + ')' : ''));
  });
  return lines.join('\n');
}

/** 배포 주소 — 브라우저가 아니면(테스트·SSR) 기본 주소 */
export const DEFAULT_SITE_ORIGIN = 'https://reelpin.vercel.app';

export function siteOrigin() {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return String(window.location.origin);
    }
  } catch (e) {
    /* SSR */
  }
  return DEFAULT_SITE_ORIGIN;
}

/** 공유 링크 만들기 — `?col=<shareId>` */
export function buildCollectionShareUrl(shareId, origin) {
  const id = String(shareId == null ? '' : shareId).trim();
  if (!id) return '';
  return (origin || siteOrigin()) + '/?' + COLLECTION_PARAM + '=' + encodeURIComponent(id);
}

/** 주소(검색어+해시)에서 `?col=` 값만 뽑습니다. 없으면 '' */
export function parseCollectionShareParam(search) {
  const text = String(search == null ? '' : search);
  if (!text) return '';
  const match = new RegExp('[?&]' + COLLECTION_PARAM + '=([^&#]+)').exec(text);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch (e) {
    return String(match[1] || '').trim();
  }
}

/** 지금 주소창의 `?col=` (웹 전용 · SSR 안전) */
export function readCollectionShareFromLocation() {
  try {
    if (typeof window === 'undefined' || !window.location) return '';
    return parseCollectionShareParam(String(window.location.search || '') + String(window.location.hash || ''));
  } catch (e) {
    return '';
  }
}

/** 공유 링크로 들어왔다는 표시를 주소창에서 지웁니다(담은 뒤 새로고침해도 다시 뜨지 않게) */
export function clearCollectionShareFromLocation() {
  try {
    if (typeof window === 'undefined' || !window.history || !window.location) return false;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(COLLECTION_PARAM)) return false;
    url.searchParams.delete(COLLECTION_PARAM);
    const next = url.pathname + (url.search ? url.search : '') + (url.hash || '');
    window.history.replaceState({}, '', next);
    return true;
  } catch (e) {
    return false;
  }
}
