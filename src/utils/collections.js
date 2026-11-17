/**
 * utils/collections.js — v2.19.0 '컬렉션' (테마·코스별로 묶은 핀 묶음)
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청: "컬렉션 메뉴는 너가 추천힌 1번 내용대로 구성"
 *   → 저장한 핀을 **테마·코스별로 묶어 보고, 그 묶음만 지도 보기 / 공유**하는 탭
 *
 * 이 파일은 **순수 자바스크립트**입니다(react-native·storage import 없음).
 *   · 화면(CollectionsScreen)과 저장(storage.js), 지도 필터(MapScreen)가 같은 규칙을 씁니다.
 *   · Node 테스트(test/collections-test.mjs)에서 그대로 불러 검사할 수 있습니다.
 *
 * 한 컬렉션의 모양
 *   {
 *     id: 'col-…',            // 앱 안에서만 쓰는 고유 키
 *     name: '검단 점심 코스',   // 28자까지
 *     desc: '회사 근처 12시~1시',// 한 줄 설명 · 40자까지 (없으면 '')
 *     emoji: '🍜',             // 테마 이모지 (없으면 📂)
 *     color: '#0D9488',        // 카드 포인트 색 (없으면 딥 틸)
 *     pinIds: ['pin-1', …],    // 담긴 핀 id — 담은 순서를 그대로 지킵니다
 *     createdAt: ISO, updatedAt: ISO,
 *   }
 */

export const COLLECTION_MAX_NAME = 28;
export const COLLECTION_MAX_DESC = 40;
export const COLLECTION_MAX_PINS = 200;

/** 컬렉션 카드에 고를 수 있는 테마 이모지 (첫 번째가 기본) */
export const COLLECTION_EMOJIS = ['📂', '🍜', '☕', '🍰', '🍱', '🏞️', '🛍️', '🎬', '🚗', '🧸'];
/** 카드 포인트 색 (첫 번째가 기본 딥 틸) */
export const COLLECTION_COLORS = ['#0D9488', '#F2A03D', '#0FA968', '#3B82F6', '#8B5CF6', '#EC4899'];
export const DEFAULT_COLLECTION_EMOJI = COLLECTION_EMOJIS[0];
export const DEFAULT_COLLECTION_COLOR = COLLECTION_COLORS[0];

/** 컬렉션 id — 앱 안에서만 쓰므로 시간 + 난수로 충분합니다. */
export function newCollectionId(now = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 7);
  return 'col-' + Number(now).toString(36) + '-' + rand;
}

function clampText(value, max) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeEmoji(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return DEFAULT_COLLECTION_EMOJI;
  // 이모지 두 글자(피부색·ZWJ 조합)까지 — 그보다 길면 잘라 냅니다.
  return Array.from(text).slice(0, 2).join('');
}

function normalizeColor(value) {
  const text = String(value == null ? '' : value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : DEFAULT_COLLECTION_COLOR;
}

function uniqueIds(list) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach((id) => {
    const key = String(id == null ? '' : id).trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out.slice(0, COLLECTION_MAX_PINS);
}

/**
 * 저장된 값 하나를 안전한 컬렉션으로 다듬습니다.
 *   이름이 비었거나 모양이 깨졌으면 null — 목록에서 조용히 빠집니다.
 */
export function normalizeCollection(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const name = clampText(raw.name, COLLECTION_MAX_NAME);
  if (!name) return null;
  const id = String(raw.id || '').trim() || 'col-legacy-' + index;
  return {
    id,
    name,
    desc: clampText(raw.desc, COLLECTION_MAX_DESC),
    emoji: normalizeEmoji(raw.emoji),
    color: normalizeColor(raw.color),
    pinIds: uniqueIds(raw.pinIds),
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || raw.createdAt || ''),
  };
}

export function normalizeCollections(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((raw, index) => {
    const item = normalizeCollection(raw, index);
    if (!item) return;
    let id = item.id;
    let n = 1;
    while (seen.has(id)) {
      id = item.id + '-' + n;
      n += 1;
    }
    seen.add(id);
    out.push({ ...item, id });
  });
  return out;
}

/** 이름 중복 검사 (대소문자·공백 무시). 같은 컬렉션을 수정할 때는 ignoreId 로 자기 자신을 뺍니다. */
export function findCollectionByName(list, name, ignoreId = null) {
  const target = clampText(name, COLLECTION_MAX_NAME).toLowerCase();
  if (!target) return null;
  return (
    (Array.isArray(list) ? list : []).find(
      (c) => c && c.id !== ignoreId && String(c.name || '').trim().toLowerCase() === target
    ) || null
  );
}

/**
 * 새 컬렉션 만들기 — 새 것이 목록 맨 앞에 옵니다.
 * @returns {{ok:boolean, collections:Array, item?:object, message?:string}}
 */
export function createCollection(list, draft = {}, now = new Date().toISOString()) {
  const name = clampText(draft.name, COLLECTION_MAX_NAME);
  if (!name) {
    return { ok: false, collections: normalizeCollections(list), message: '컬렉션 이름을 먼저 적어 주세요' };
  }
  const current = normalizeCollections(list);
  if (findCollectionByName(current, name)) {
    return { ok: false, collections: current, message: '같은 이름의 컬렉션이 있어요 · ' + name };
  }
  const item = normalizeCollection(
    {
      id: draft.id || newCollectionId(),
      name,
      desc: draft.desc,
      emoji: draft.emoji,
      color: draft.color,
      pinIds: draft.pinIds,
      createdAt: now,
      updatedAt: now,
    },
    0
  );
  return { ok: true, collections: [item].concat(current), item };
}

/**
 * 컬렉션 이름·설명·이모지·색 바꾸기.
 * 이름을 비우거나 다른 컬렉션과 같게 바꾸면 거절합니다(나머지 필드는 그대로).
 */
export function updateCollection(list, id, patch = {}, now = new Date().toISOString()) {
  const current = normalizeCollections(list);
  const target = current.find((c) => c.id === id);
  if (!target) return { ok: false, collections: current, message: '컬렉션을 찾지 못했어요' };
  const next = { ...target };
  if (patch.name !== undefined) {
    const name = clampText(patch.name, COLLECTION_MAX_NAME);
    if (!name) return { ok: false, collections: current, message: '컬렉션 이름을 먼저 적어 주세요' };
    if (findCollectionByName(current, name, id)) {
      return { ok: false, collections: current, message: '같은 이름의 컬렉션이 있어요 · ' + name };
    }
    next.name = name;
  }
  if (patch.desc !== undefined) next.desc = clampText(patch.desc, COLLECTION_MAX_DESC);
  if (patch.emoji !== undefined) next.emoji = normalizeEmoji(patch.emoji);
  if (patch.color !== undefined) next.color = normalizeColor(patch.color);
  next.updatedAt = now;
  return {
    ok: true,
    collections: current.map((c) => (c.id === id ? next : c)),
    item: next,
  };
}

export function removeCollection(list, id) {
  const current = normalizeCollections(list);
  const exists = current.some((c) => c.id === id);
  if (!exists) return { ok: false, collections: current, message: '컬렉션을 찾지 못했어요' };
  return { ok: true, collections: current.filter((c) => c.id !== id) };
}

/** 컬렉션에 핀을 담거나(없으면) 뺍니다. 담은 순서대로 뒤에 붙습니다. */
export function toggleCollectionPin(list, id, pinId, now = new Date().toISOString()) {
  const current = normalizeCollections(list);
  const target = current.find((c) => c.id === id);
  const key = String(pinId == null ? '' : pinId);
  if (!target || !key) return { ok: false, collections: current, added: false };
  const has = target.pinIds.indexOf(key) >= 0;
  const pinIds = has ? target.pinIds.filter((p) => p !== key) : target.pinIds.concat([key]).slice(0, COLLECTION_MAX_PINS);
  const next = { ...target, pinIds, updatedAt: now };
  return {
    ok: true,
    added: !has,
    collections: current.map((c) => (c.id === id ? next : c)),
    item: next,
  };
}

/** 핀 여러 개를 한 번에 담기 (이미 담긴 핀은 건너뜀) */
export function addPinsToCollection(list, id, pinIds, now = new Date().toISOString()) {
  const current = normalizeCollections(list);
  const target = current.find((c) => c.id === id);
  if (!target) return { ok: false, collections: current, added: 0 };
  const merged = uniqueIds(target.pinIds.concat(uniqueIds(pinIds)));
  const added = merged.length - target.pinIds.length;
  if (!added) return { ok: true, collections: current, added: 0, item: target };
  const next = { ...target, pinIds: merged, updatedAt: now };
  return { ok: true, collections: current.map((c) => (c.id === id ? next : c)), added, item: next };
}

/** 핀 여러 개를 한 번에 빼기 */
export function removePinsFromCollection(list, id, pinIds, now = new Date().toISOString()) {
  const current = normalizeCollections(list);
  const target = current.find((c) => c.id === id);
  if (!target) return { ok: false, collections: current, removed: 0 };
  const drop = new Set(uniqueIds(pinIds));
  const pinIdsNext = target.pinIds.filter((p) => !drop.has(p));
  const removed = target.pinIds.length - pinIdsNext.length;
  if (!removed) return { ok: true, collections: current, removed: 0, item: target };
  const next = { ...target, pinIds: pinIdsNext, updatedAt: now };
  return { ok: true, collections: current.map((c) => (c.id === id ? next : c)), removed, item: next };
}

/**
 * 핀이 지워졌을 때 컬렉션에서도 그 id 를 정리합니다.
 * (컬렉션 자체는 남깁니다 — 핀을 다시 담으면 됩니다)
 * @returns {{collections:Array, changed:boolean, removedCount:number}}
 */
export function pruneCollections(list, pins) {
  const current = normalizeCollections(list);
  const alive = new Set(
    (Array.isArray(pins) ? pins : []).filter((p) => p && p.id).map((p) => String(p.id))
  );
  let removedCount = 0;
  const next = current.map((c) => {
    const pinIds = c.pinIds.filter((id) => alive.has(id));
    if (pinIds.length === c.pinIds.length) return c;
    removedCount += c.pinIds.length - pinIds.length;
    return { ...c, pinIds };
  });
  // 바뀐 것이 없으면 **받은 그 배열을 그대로** 돌려줍니다(불필요한 재저장·재렌더 없음).
  if (!removedCount) {
    return { collections: Array.isArray(list) ? list : current, changed: false, removedCount: 0 };
  }
  return { collections: next, changed: true, removedCount };
}

/** 컬렉션에 담긴 핀 객체 — 담은 순서 그대로, 없는 핀은 건너뜀 */
export function pinsOfCollection(collection, pins) {
  if (!collection) return [];
  const byId = new Map(
    (Array.isArray(pins) ? pins : []).filter((p) => p && p.id).map((p) => [String(p.id), p])
  );
  return uniqueIds(collection.pinIds)
    .map((id) => byId.get(id))
    .filter(Boolean);
}

/** 카드 미리보기 — 담긴 핀 이름 앞 몇 개 (기본 3개) */
export function collectionPreviewNames(collection, pins, max = 3) {
  return pinsOfCollection(collection, pins)
    .slice(0, Math.max(0, max))
    .map((p) => String(p.name || '').trim())
    .filter(Boolean);
}

/** 컬렉션 카드의 한 줄 상태 문구 */
export function collectionSummary(collection, pins) {
  const list = pinsOfCollection(collection, pins);
  if (!list.length) return '아직 담은 핀이 없어요';
  const visited = list.filter((p) => p && p.visited === true).length;
  return list.length + '곳' + (visited ? ' · 가본 곳 ' + visited : '');
}

/**
 * 공유 문구 — 제목 + 장소 목록 (지도 링크는 화면이 buildShareUrl 로 따로 붙입니다)
 * 예)
 *   📂 검단 점심 코스 · 3곳
 *   1. 검단 이니야 (맛집 · 당하동)
 *   2. 당하 순대국 (맛집 · 당하동)
 */
export function collectionShareText(collection, pins, options = {}) {
  if (!collection) return '';
  const list = pinsOfCollection(collection, pins);
  const emoji = collection.emoji || DEFAULT_COLLECTION_EMOJI;
  const head = emoji + ' ' + (collection.name || '내 컬렉션') + ' · ' + list.length + '곳';
  if (!list.length) return head;
  const lines = list.map((pin, index) => {
    const meta = [pin.category, pin.area].filter(Boolean).join(' · ');
    return index + 1 + '. ' + String(pin.name || '').trim() + (meta ? ' (' + meta + ')' : '');
  });
  const body = [head].concat(lines).join('\n');
  return options.url ? body + '\n' + options.url : body;
}

/** 지도에 이 컬렉션만 보여 줄 때 쓰는 핀 목록 (id 기준) */
export function collectionPinIdSet(collection) {
  return new Set(uniqueIds(collection ? collection.pinIds : []));
}

/** 컬렉션 이름이 지도 상단 칩에 들어갈 짧은 문구 */
export function collectionFilterLabel(collection, pins) {
  if (!collection) return '';
  const count = pinsOfCollection(collection, pins).length;
  return collection.name + ' · ' + count + '곳';
}

/** 컬렉션 목록에서 'N개 컬렉션 · M곳 담김' 요약 */
export function collectionsOverview(list, pins) {
  const items = normalizeCollections(list);
  const total = items.reduce((sum, c) => sum + pinsOfCollection(c, pins).length, 0);
  return { collections: items.length, pins: total };
}
