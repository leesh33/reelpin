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
    providers,
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : null,
    sourceUrl: options.sourceUrl || '',
    platform: options.platform || 'instagram',
    note: options.note || '',
    createdAt: now.toISOString(),
  };
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
    providers: Array.isArray(pin.providers) ? pin.providers : pin.provider ? [pin.provider] : [],
    confidence: typeof pin.confidence === 'number' ? pin.confidence : null,
    sourceUrl: pin.sourceUrl || '',
    platform: pin.platform || 'instagram',
    note: pin.note || '',
  };
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
  const name = String(candidate.name || '').trim();
  if (!name) return null;
  return (
    pins.find(
      (p) => p && String(p.name || '').trim() === name && String(p.area || '') === String(candidate.area || '')
    ) || null
  );
}
