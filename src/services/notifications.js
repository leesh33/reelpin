/**
 * src/services/notifications.js
 * ─────────────────────────────────────────────────────────────
 * v1.5 — 브라우저 알림(Notification API)으로 "반경 500m 진입" 알림
 *
 * iOS 사파리는 16.4+ 에서 **홈 화면에 추가한 웹 앱**이면 Notification 을 지원합니다.
 * 지원하지 않는 환경(Expo Go 네이티브, 구형 브라우저)에서는 조용히 false 를 돌려주고,
 * 화면 안 배너(토스트)만으로 알려줍니다.
 */
import { formatDistance } from './location';

/** 거리 표기 없이 제목만 — 본문은 호출하는 쪽에서 만듭니다 */
export function nearbyNotificationBody(pin, distanceLabel, radiusMeters = 500) {
  const name = (pin && pin.name) || '저장한 장소';
  const radius = radiusMeters >= 1000 ? '1km' : radiusMeters + 'm';
  return '반경 ' + radius + ' 앞, ' + name + (distanceLabel ? ' · ' + distanceLabel : '');
}

/** 이 브라우저가 알림을 지원하는가 (SSR 안전) */
export function isNotificationSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Notification === 'function' &&
    typeof window.Notification.requestPermission === 'function'
  );
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function notificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  return window.Notification.permission || 'default';
}

/**
 * 알림 권한을 요청합니다. 사용자가 눌렀을 때(제스처 안에서)만 부르세요.
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const result = await window.Notification.requestPermission();
    return result || 'default';
  } catch (e) {
    return notificationPermission();
  }
}

/**
 * 500m 진입 알림 1건. 권한이 없으면 아무것도 하지 않습니다.
 * @returns {boolean} 실제로 알림창을 띄웠는지
 */
export function showNearbyNotification(pin, distanceMeters, radiusMeters = 500) {
  if (notificationPermission() !== 'granted') return false;
  const distanceLabel = formatDistance(distanceMeters);
  try {
    const notification = new window.Notification('📍 릴스핀', {
      body: nearbyNotificationBody(pin, distanceLabel, radiusMeters),
      tag: 'reelpin-nearby-' + ((pin && pin.id) || 'pin'),
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    });
    if (notification && typeof notification.close === 'function') {
      setTimeout(() => {
        try {
          notification.close();
        } catch (e) {}
      }, 15000);
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 아직 알리지 않은 '새로 들어온' 핀 하나를 고릅니다.
 * nearby 는 findNearbyPins() 결과(가까운 순)이고, notifiedIds 는 Set 또는 배열입니다.
 * @returns {{ pin: object, distanceMeters: number } | null}
 */
export function firstNewNearby(nearby, notifiedIds) {
  if (!Array.isArray(nearby) || nearby.length === 0) return null;
  const notified = notifiedIds || [];
  const has = (id) =>
    typeof notified.has === 'function' ? notified.has(id) : notified.indexOf(id) >= 0;
  for (let i = 0; i < nearby.length; i += 1) {
    const item = nearby[i];
    const id = item && item.pin && item.pin.id;
    if (!id) continue;
    if (!has(id)) return item;
  }
  return null;
}
