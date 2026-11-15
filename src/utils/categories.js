/**
 * utils/categories.js
 * ─────────────────────────────────────────────────────────────
 * 분류(카테고리)는 두 종류입니다.
 *   · 기본 분류 … ['맛집', '카페', '가볼곳'] — 지울 수도, 이름을 바꿀 수도 없습니다 (앱의 기본 뼈대)
 *   · 커스텀 분류 … 사용자가 [분류 추가] 로 만든 이름 (예: 아이랑, 데이트, 술집)
 *
 * 이 파일은 지도 필터·저장·핀 상세·내 정보가 **함께 쓰는 규칙**만 모읍니다.
 *   · 이름 다듬기 · 검증 (빈 이름 / 길이 / 중복 / 기본 분류 보호)
 *   · 추가 · 이름 바꾸기 · 삭제 → 저장할 커스텀 이름 목록을 돌려줍니다
 *   · 이름을 바꾸거나 지울 때 **기존 핀의 category 를 한꺼번에** 옮기는 함수
 *   · 지도 필터 매칭 · 개수 세기 · 커스텀 분류 핀 색
 * 저장(AsyncStorage)은 src/storage.js 가 맡습니다. (웹=localStorage, 앱=AsyncStorage)
 */

export const DEFAULT_CATEGORIES = ['맛집', '카페', '가볼곳'];
export const CATEGORY_ALL = '전체';
export const CATEGORY_MAX_LENGTH = 10;
/** 커스텀 분류를 지울 때 핀이 옮겨 갈 기본 분류 */
export const CATEGORY_FALLBACK = '맛집';
/** v1.0 핀의 세부 업종 — 지도에서는 '맛집'으로 함께 보여 줍니다. */
export const LEGACY_CATEGORY_LABELS = { 베이커리: '맛집', 디저트: '맛집' };
/** 커스텀 분류 핀 색 — 이름에서 고정된 색을 골라 씁니다(퍼플·블루·코랄·앰버·틸) */
export const CUSTOM_PIN_COLORS = ['#7C6CF0', '#3B82F6', '#FF7A9C', '#F59E0B', '#0FA3A3'];

/** 앞뒤 공백·연속 공백·맨 앞 '#' 을 정리합니다. ('  # 아이랑  데이트 ' → '아이랑 데이트') */
export function normalizeCategoryName(value) {
  return String(value == null ? '' : value)
    .replace(/^[\s#]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 같은 분류인지 (공백·대소문자 무시) */
export function sameCategory(a, b) {
  const x = normalizeCategoryName(a).toLowerCase();
  const y = normalizeCategoryName(b).toLowerCase();
  return !!x && x === y;
}

/** 기본 3개(맛집·카페·가볼곳)인지 — 삭제·이름 변경 금지 대상 */
export function isDefaultCategory(name) {
  return DEFAULT_CATEGORIES.some((c) => sameCategory(c, name));
}

/** 예전 업종 이름(베이커리·디저트)인지 */
export function isLegacyCategory(name) {
  const key = normalizeCategoryName(name);
  return Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_LABELS, key);
}

/** 베이커리·디저트 → 맛집 (그 밖에는 그대로) */
export function mapLegacyCategory(name) {
  const key = normalizeCategoryName(name);
  return LEGACY_CATEGORY_LABELS[key] || key;
}

/** 저장된 커스텀 목록에서 기본·레거시·중복·빈 이름을 걸러 냅니다. */
export function normalizeCustomCategories(custom) {
  const out = [];
  (Array.isArray(custom) ? custom : []).forEach((raw) => {
    const name = normalizeCategoryName(raw);
    if (!name) return;
    if (isDefaultCategory(name) || isLegacyCategory(name)) return;
    if (out.some((c) => sameCategory(c, name))) return;
    out.push(name);
  });
  return out;
}

/** 화면에 그릴 전체 분류 = 기본 3개 + 커스텀 (기본이 항상 앞) */
export function allCategories(custom) {
  return DEFAULT_CATEGORIES.concat(normalizeCustomCategories(custom));
}

/** 필터 칩 순서 = 전체 + 기본 + 커스텀 */
export function filterOptions(categories) {
  return [CATEGORY_ALL].concat(allCategories(categories));
}

/**
 * 저장 목록에 아직 없는 분류 이름(다른 기기·클라우드·공유 지도에서 온 핀)을 뒤에 붙입니다.
 * → 커스텀 분류를 만들었는데 그 이름이 저장 목록에 없어 칩이 사라지는 일을 막습니다.
 */
export function mergeCategoryNames(custom, extraNames) {
  const base = normalizeCustomCategories(custom);
  const extra = (Array.isArray(extraNames) ? extraNames : []).map((n) => mapLegacyCategory(n));
  return normalizeCustomCategories(base.concat(extra));
}

/**
 * 새 이름 검사.
 * @returns {{ok:true,name:string}|{ok:false,reason:string,message:string}}
 */
export function validateCategoryName(raw, options = {}) {
  const name = normalizeCategoryName(raw);
  if (!name) {
    return { ok: false, reason: 'empty', message: '분류 이름을 먼저 적어 주세요' };
  }
  if (name.length > CATEGORY_MAX_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      message: '분류 이름은 ' + CATEGORY_MAX_LENGTH + '자까지 쓸 수 있어요',
    };
  }
  if (isLegacyCategory(name)) {
    return { ok: false, reason: 'legacy', message: '베이커리·디저트는 이미 맛집에 함께 보여요' };
  }
  const taken = Array.isArray(options.taken) ? options.taken : DEFAULT_CATEGORIES;
  if (taken.some((c) => sameCategory(c, name))) {
    return { ok: false, reason: 'duplicate', message: '이미 있는 분류예요' };
  }
  return { ok: true, name };
}

/** 커스텀 분류 추가 */
export function addCategory(custom, raw) {
  const list = normalizeCustomCategories(custom);
  const check = validateCategoryName(raw, { taken: allCategories(list) });
  if (!check.ok) return { ...check, custom: list, categories: allCategories(list) };
  const next = list.concat(check.name);
  return { ok: true, name: check.name, custom: next, categories: allCategories(next) };
}

/**
 * 커스텀 분류 이름 바꾸기 — 기본 3개는 보호합니다.
 * @returns {{ok:boolean, name?:string, previous?:string, changed?:boolean, custom:Array<string>, reason?:string, message?:string}}
 */
export function renameCategory(custom, oldRaw, newRaw) {
  const list = normalizeCustomCategories(custom);
  const oldName = mapLegacyCategory(oldRaw);
  if (isDefaultCategory(oldName)) {
    return {
      ok: false,
      reason: 'default',
      message: '기본 분류(맛집·카페·가볼곳)는 이름을 바꿀 수 없어요',
      custom: list,
      categories: allCategories(list),
    };
  }
  const source = list.find((c) => sameCategory(c, oldName));
  if (!source) {
    return {
      ok: false,
      reason: 'missing',
      message: '없는 분류예요',
      custom: list,
      categories: allCategories(list),
    };
  }
  const taken = allCategories(list.filter((c) => !sameCategory(c, source)));
  const check = validateCategoryName(newRaw, { taken });
  if (!check.ok) return { ...check, custom: list, categories: allCategories(list) };
  if (sameCategory(check.name, source)) {
    return { ok: true, name: source, previous: source, changed: false, custom: list, categories: allCategories(list) };
  }
  const next = list.map((c) => (sameCategory(c, source) ? check.name : c));
  return {
    ok: true,
    name: check.name,
    previous: source,
    changed: true,
    custom: next,
    categories: allCategories(next),
  };
}

/** 커스텀 분류 삭제 — 기본 3개는 보호합니다. (핀 이동은 applyCategoryRemoval 이 맡습니다) */
export function removeCategory(custom, raw) {
  const list = normalizeCustomCategories(custom);
  const name = mapLegacyCategory(raw);
  if (isDefaultCategory(name)) {
    return {
      ok: false,
      reason: 'default',
      message: '기본 분류(맛집·카페·가볼곳)는 지울 수 없어요',
      custom: list,
      categories: allCategories(list),
    };
  }
  const target = list.find((c) => sameCategory(c, name));
  if (!target) {
    return {
      ok: false,
      reason: 'missing',
      message: '없는 분류예요',
      custom: list,
      categories: allCategories(list),
    };
  }
  const next = list.filter((c) => !sameCategory(c, target));
  return { ok: true, name: target, custom: next, categories: allCategories(next) };
}

/** 이 분류를 쓰는 핀 (베이커리·디저트는 맛집으로 봅니다) */
export function pinsInCategory(pins, raw) {
  const name = mapLegacyCategory(raw);
  if (!name) return [];
  return (Array.isArray(pins) ? pins : []).filter(
    (pin) => pin && sameCategory(mapLegacyCategory(pin.category), name)
  );
}

/**
 * 이름을 바꾼 분류를 쓰던 핀의 category 를 **한꺼번에** 새 이름으로 옮깁니다.
 * · updatedAt 을 남겨, 로그인 상태에서 다음 동기화 때 클라우드에도 새 이름이 올라가게 합니다.
 *   (핀의 createdAt 만 보면 '바뀐 적 없음'으로 판정돼 예전 이름이 되살아납니다)
 */
export function applyCategoryRename(pins, oldRaw, newRaw, options = {}) {
  const from = normalizeCategoryName(oldRaw);
  const to = normalizeCategoryName(newRaw);
  const list = Array.isArray(pins) ? pins : [];
  if (!from || !to || sameCategory(from, to)) return { pins: list.slice(), changed: [] };
  const updatedAt = options.now || new Date().toISOString();
  const changed = [];
  const next = list.map((pin) => {
    if (!pin || !sameCategory(mapLegacyCategory(pin.category), from)) return pin;
    const moved = { ...pin, category: to, updatedAt };
    changed.push(moved);
    return moved;
  });
  return { pins: next, changed };
}

/**
 * 분류를 지울 때 그 분류를 쓰던 핀을 **기본 분류(맛집)** 로 안전하게 옮깁니다.
 * 핀 자체는 절대 사라지지 않습니다.
 */
export function applyCategoryRemoval(pins, raw, options = {}) {
  const name = normalizeCategoryName(raw);
  const fallback = options.fallback || CATEGORY_FALLBACK;
  const list = Array.isArray(pins) ? pins : [];
  if (!name) return { pins: list.slice(), changed: [], fallback };
  const updatedAt = options.now || new Date().toISOString();
  const changed = [];
  const next = list.map((pin) => {
    if (!pin || !sameCategory(mapLegacyCategory(pin.category), name)) return pin;
    const moved = { ...pin, category: fallback, updatedAt };
    changed.push(moved);
    return moved;
  });
  return { pins: next, changed, fallback };
}

/** 지도 필터 — '전체'는 모두, '맛집'은 베이커리·디저트까지, 커스텀은 이름이 정확히 같을 때만 */
export function matchesFilter(pin, filter) {
  if (!filter || filter === CATEGORY_ALL) return true;
  if (!pin) return false;
  return sameCategory(mapLegacyCategory(pin.category) || CATEGORY_FALLBACK, filter);
}

/** 필터 칩마다 보여 줄 핀 개수 */
export function countByCategory(pins, categories) {
  const options = filterOptions(categories);
  const out = {};
  options.forEach((f) => {
    out[f] = 0;
  });
  (Array.isArray(pins) ? pins : []).forEach((pin) => {
    if (!pin) return;
    options.forEach((f) => {
      if (matchesFilter(pin, f)) out[f] += 1;
    });
  });
  return out;
}

/** 이름을 바꾼 뒤 지도 필터가 깨지지 않게 — 그 분류를 보고 있었다면 새 이름을 계속 봅니다 */
export function nextFilterAfterRename(filter, oldRaw, newRaw) {
  if (!filter || filter === CATEGORY_ALL) return CATEGORY_ALL;
  if (!sameCategory(filter, oldRaw)) return filter;
  const next = normalizeCategoryName(newRaw);
  return next || CATEGORY_ALL;
}

/** 분류를 지운 뒤 — 그 분류를 보고 있었다면 '전체'로 돌아갑니다 */
export function nextFilterAfterRemoval(filter, raw) {
  if (!filter || filter === CATEGORY_ALL) return CATEGORY_ALL;
  return sameCategory(filter, raw) ? CATEGORY_ALL : filter;
}

/** 커스텀 분류 핀 색 — 같은 이름은 언제나 같은 색 (이름 해시) */
export function customCategoryColor(name, palette = CUSTOM_PIN_COLORS) {
  const colors = Array.isArray(palette) && palette.length ? palette : CUSTOM_PIN_COLORS;
  const key = mapLegacyCategory(name) || '';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1000003;
  }
  return colors[hash % colors.length];
}
