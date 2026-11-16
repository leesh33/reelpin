import { NEARBY_RADIUS_M, findNearbyPins } from '../services/location';

/**
 * 🔔 알림 모음 (v2.15) — 지금 내 위치 기준으로 '가까운 저장 장소'를 모아 주는 규칙.
 *
 * 화면 없이 규칙만 검사할 수 있게 순수 함수로 둡니다(`test/ssr-smoke.jsx`).
 *
 *   · 반경 500m **안**의 저장 장소를 가까운 순으로 먼저 (전부 `inRadius`)
 *   · 남는 자리는 반경 밖에서 **가장 가까운 순**으로 채움 → 합쳐서 최대 5곳(`items`)
 *   · 헤더 🔔 아이콘의 숫자 뱃지 = 반경 500m **안**의 개수 (`badgeCount`) — 없으면 0(뱃지 없음)
 *
 * 위치를 아직 모르면 `hasLocation: false` 로 돌려주고, 화면은 [내 위치 켜기]를 보여 줍니다.
 */
export const ALERT_FEED_LIMIT = 5;

export function buildAlertFeed(pins, myCoords, options = {}) {
  const list = (Array.isArray(pins) ? pins : []).filter(Boolean);
  const rawRadius = Number(options.radiusMeters);
  const radiusMeters = Number.isFinite(rawRadius) && rawRadius > 0 ? rawRadius : NEARBY_RADIUS_M;
  const rawLimit = Number(options.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : ALERT_FEED_LIMIT;

  const feed = {
    radiusMeters,
    limit,
    hasLocation: false,
    empty: list.length === 0,
    inRadius: [],
    items: [],
    inRadiusCount: 0,
    outRadiusCount: 0,
    badgeCount: 0,
    closest: null,
  };

  if (!myCoords) return feed;

  // 가까운 순 정렬 — 좌표(위경도)가 없는 핀은 조용히 빠집니다.
  const all = findNearbyPins(list, myCoords, Infinity);
  const inRadius = all.filter((item) => item.distanceMeters <= radiusMeters);
  const outside = all.filter((item) => item.distanceMeters > radiusMeters);

  feed.hasLocation = true;
  feed.inRadius = inRadius;
  feed.inRadiusCount = inRadius.length;
  feed.outRadiusCount = outside.length;
  feed.badgeCount = inRadius.length;
  feed.closest = all.length ? all[0] : null;
  feed.items = inRadius.slice(0, limit);
  if (feed.items.length < limit) {
    feed.items = feed.items.concat(outside.slice(0, limit - feed.items.length));
  }
  return feed;
}
