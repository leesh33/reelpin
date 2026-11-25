/**
 * v2.44 — 첫 실행 **화면 예시** 핀 4곳 (성수동 · 연남동 · 망원동 · 검단).
 *
 *   · 예전에는 이 값을 기기 저장소(`reelpin.pins.v1`)에 **진짜 핀처럼 저장**해서
 *     로그인하면 클라우드까지 올라갔습니다. (가짜 주소가 내 지도·공유 링크·통계에 섞임)
 *   · 지금은 **저장하지 않습니다.** 핀이 하나도 없을 때 화면을 이해시키는 용도로만 쓰고,
 *     `isSeedPin()` 이 업로드·공유·목록 개수에서 걸러 냅니다.
 */
export const SEED_PINS = [
  {
    id: 'seed-seongsu-saltbread',
    isSeed: true,
    name: '성수동 소금빵집',
    area: '성수동',
    category: '베이커리',
    menuTags: ['소금빵', '크루아상'],
    address: '서울 성동구 연무장길 00',
    lat: 37.5445,
    lng: 127.0557,
    sourceUrl: 'https://www.instagram.com/reel/C8xSg2BpQ1K/',
    platform: 'instagram',
    note: '오픈 30분 만에 소금빵이 나가는 집. 평일 오전이 여유로움.',
    createdAt: '2026-11-09T09:12:00+09:00',
  },
  {
    id: 'seed-yeonnam-cake',
    isSeed: true,
    name: '연남동 딸기 케이크 맛집',
    area: '연남동',
    category: '디저트',
    menuTags: ['딸기 케이크', '라떼'],
    address: '서울 마포구 성미산로 00',
    lat: 37.56,
    lng: 126.925,
    sourceUrl: 'https://www.youtube.com/shorts/9Xk2mQpLz7A',
    platform: 'youtube',
    note: '주말 웨이팅 40분. 2층 창가 자리가 사진 맛집.',
    createdAt: '2026-11-10T18:40:00+09:00',
  },
  {
    id: 'seed-mangwon-udon',
    isSeed: true,
    name: '망원동 우동 맛집',
    area: '망원동',
    category: '맛집',
    menuTags: ['붓카케 우동', '튀김'],
    address: '서울 마포구 월드컵로 00',
    lat: 37.556,
    lng: 126.902,
    sourceUrl: 'https://www.instagram.com/reel/C7mWqUdon11/',
    platform: 'instagram',
    note: '현금만 가능, 11:30 오픈런 추천.',
    createdAt: '2026-11-11T12:05:00+09:00',
  },
  {
    id: 'seed-geomdan-aracafe',
    isSeed: true,
    name: '검단 아라뱃길 뷰 카페',
    area: '검단',
    category: '카페',
    menuTags: ['핸드드립', '아라뱃길 뷰'],
    address: '인천 서구 아라뱃길 00',
    lat: 37.592,
    lng: 126.69,
    sourceUrl: 'https://www.instagram.com/reel/C6aRaCafe9/',
    platform: 'instagram',
    note: '아이랑 가기 좋음. 주차 무료, 유아 의자 있음.',
    createdAt: '2026-11-12T15:30:00+09:00',
  },
];

/** 이 핀이 첫 실행 예시(샘플)인가 — id 가 `seed-` 이거나 `isSeed: true` */
export function isSeedPin(pin) {
  if (!pin || typeof pin !== 'object') return false;
  if (pin.isSeed === true) return true;
  return String(pin.id || '').indexOf('seed-') === 0;
}

/** 예시 핀을 걷어낸 목록 (업로드·공유·개수 계산은 항상 이 목록으로) */
export function stripSeedPins(list) {
  return (Array.isArray(list) ? list : []).filter((pin) => pin && !isSeedPin(pin));
}

/**
 * v2.10 — 무료 플랜 핀 10개 한도를 없앴습니다.
 *   예전 코드·문서와 헷갈리지 않게 이름만 남겨 두고, 값은 '무제한'(Infinity)입니다.
 *   화면은 이 값을 쓰지 않습니다 — 저장은 누구나 개수 제한 없이 됩니다.
 */
export const FREE_PIN_LIMIT = Infinity;
