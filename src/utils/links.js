import { Linking, Platform } from 'react-native';

export const APP_SCHEME = 'reelpin';
const APP_NAME = 'com.odol.reelpin';

/** 네이버지도 앱 딥링크 (없으면 웹 지도로 폴백) */
export function naverMapAppUrl(pin) {
  const q = encodeURIComponent(pin.name);
  return `nmap://search?query=${q}&appname=${APP_NAME}`;
}

export function naverMapWebUrl(pin) {
  const q = encodeURIComponent([pin.area, pin.name].filter(Boolean).join(' '));
  return `https://map.naver.com/p/search/${q}`;
}

/** 카카오맵 앱 딥링크 (좌표 중심 검색) */
export function kakaoMapAppUrl(pin) {
  const q = encodeURIComponent(pin.name);
  return `kakaomap://search?q=${q}&c=${pin.lat},${pin.lng}`;
}

export function kakaoMapWebUrl(pin) {
  const q = encodeURIComponent(pin.name);
  return `https://map.kakao.com/link/search/${q}`;
}

/**
 * 앱 딥링크를 열고, 스킴이 없으면 웹으로 넘어갑니다.
 * 웹 브라우저(PC·`w` 실행)에서는 항상 웹 지도로 엽니다.
 */
export async function openMap(pin, provider) {
  const appUrl = provider === 'naver' ? naverMapAppUrl(pin) : kakaoMapAppUrl(pin);
  const webUrl = provider === 'naver' ? naverMapWebUrl(pin) : kakaoMapWebUrl(pin);

  if (Platform.OS === 'web') {
    try {
      await Linking.openURL(webUrl);
      return { opened: 'web', url: webUrl };
    } catch (e) {
      return { opened: 'failed', url: webUrl };
    }
  }

  try {
    const supported = await Linking.canOpenURL(appUrl);
    if (supported) {
      await Linking.openURL(appUrl);
      return { opened: 'app', url: appUrl };
    }
  } catch (e) {
    // canOpenURL 자체가 막힌 경우도 웹으로 폴백
  }

  try {
    await Linking.openURL(webUrl);
    return { opened: 'web', url: webUrl };
  } catch (e) {
    return { opened: 'failed', url: webUrl };
  }
}

/** 원본 릴스·쇼츠로 이동 */
export async function openSource(sourceUrl) {
  try {
    await Linking.openURL(sourceUrl);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 저장된 매장 정보 주소(placeUrl)를 정리합니다.
 * - 이미 http(s) 면 그대로 (가게 홈페이지가 http 전용인 경우가 있어 스킴을 바꾸지 않음)
 * - 스킴이 없으면 https 로 붙입니다. (예: 'place.map.kakao.com/123')
 * - http(s) 가 아닌 값(빈 문자열·딥링크 등)은 버립니다.
 */
export function normalizePlaceUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return 'https://' + s;
  return '';
}

/**
 * v1.7 — 앱 안 모달(InAppPlaceModal)이 여는 네이버 모바일 플레이스 검색 주소.
 * m.place.naver.com 은 X-Frame-Options / CSP frame-ancestors 를 보내지 않아
 * 웹에서 iframe 안에 그대로 띄울 수 있습니다.
 *   예) https://m.place.naver.com/place/list?query=%EC%84%B1%EC%88%98%EB%8F%99%20%EB%B2%A0%ED%86%B5
 *
 * v2.0 — 핀에 `naverPlaceId` 가 있으면 **검색 목록이 아니라 상세 페이지로 직행**합니다.
 *   예) https://m.place.naver.com/place/1736095566/home
 */
export function naverPlaceSearchUrl(pin) {
  const id = String((pin && pin.naverPlaceId) || '').trim();
  if (/^\d{5,}$/.test(id)) return naverPlaceDetailUrl(id);
  const fromUrl = extractNaverPlaceId(pin && pin.placeUrl);
  if (fromUrl) return naverPlaceDetailUrl(fromUrl);
  const query = [pin && pin.area, pin && pin.name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return `https://m.place.naver.com/place/list?query=${encodeURIComponent(query)}`;
}

// ─────────────────────────────────────────────────────────────
// v2.0 · 네이버 지도 링크 → placeId 추출 · 상세 페이지 직행
//   사용자가 공유한 네이버 지도 링크는 모양이 여러 가지입니다.
//     · https://map.naver.com/p/entry/place/1736095566
//     · https://map.naver.com/p/place/1736095566?c=…
//     · https://m.place.naver.com/restaurant/1736095566/home
//     · https://m.place.naver.com/place/1736095566
//   어느 모양이든 **placeId 하나**로 줄여서, 매장 정보 모달이 상세 페이지를 바로 엽니다.
// ─────────────────────────────────────────────────────────────
/** 네이버 플레이스 ID 모양 — 지도 링크의 숫자 ID(5자리 이상)만 인정합니다. */
export const NAVER_PLACE_PATTERNS = [
  /map\.naver\.com\/p\/entry\/place\/(\d{5,})/i,
  /map\.naver\.com\/p\/place\/(\d{5,})/i,
  /map\.naver\.com\/v5\/entry\/place\/(\d{5,})/i,
  /(?:m\.)?place\.naver\.com\/(?:place|restaurant|hairshop|hospital|accommodation|cafe|store|school|attraction)\/(\d{5,})/i,
  /(?:m\.)?place\.naver\.com\/[a-z]+\/(\d{5,})/i,
];

/** 네이버 지도·플레이스 링크에서 placeId 를 꺼냅니다. (없으면 '') */
export function extractNaverPlaceId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{5,}$/.test(s)) return s;
  for (const re of NAVER_PLACE_PATTERNS) {
    const m = s.match(re);
    if (m && m[1]) return m[1];
  }
  return '';
}

/** 네이버 플레이스 상세(홈) 주소 — 앱 안 모달과 [새 창으로 열기]가 함께 씁니다. */
export function naverPlaceDetailUrl(placeId) {
  const id = String(placeId || '').trim();
  if (!/^\d{5,}$/.test(id)) return '';
  return `https://m.place.naver.com/place/${id}/home`;
}

/** 네이버 지도 링크인지 (placeId 가 들어 있는 링크) */
export function isNaverPlaceUrl(raw) {
  return Boolean(extractNaverPlaceId(raw));
}

/** 리다이렉트를 따라가야 목적지를 알 수 있는 단축 링크 */
export const SHORT_LINK_HOSTS = ['naver.me', 'youtu.be'];

/** `naver.me/…` · `youtu.be/…` 처럼 한 번 튕기는 링크인지 */
export function isShortLinkUrl(raw) {
  const host = hostOf(raw);
  if (!host) return false;
  return SHORT_LINK_HOSTS.indexOf(host) >= 0;
}

/** URL → 소문자 호스트 (www. 제거). 실패하면 '' */
export function hostOf(raw) {
  const s = String(raw || '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    return new URL(s).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

/**
 * 전화번호 → `tel:` 주소. 숫자·+ 만 남기고, 너무 짧으면 빈 문자열.
 *   '0507-1375-1660' → 'tel:050713751660'
 */
export function telUrlOf(phone) {
  const digits = String(phone || '').replace(/[^0-9+]/g, '');
  if (digits.replace(/\D/g, '').length < 7) return '';
  return 'tel:' + digits;
}

/** [전화 걸기] — 기기 기본 전화앱으로 연결합니다. 웹 PC 에서는 실패할 수 있어 결과를 돌려줍니다. */
export async function openPhone(phone) {
  const url = telUrlOf(phone);
  if (!url) return { opened: false, url: '' };
  try {
    await Linking.openURL(url);
    return { opened: true, url };
  } catch (e) {
    return { opened: false, url };
  }
}

/** http(s) 주소를 기기 기본 브라우저(또는 그 앱)로 엽니다. */
export async function openExternalUrl(rawUrl) {
  const url = normalizePlaceUrl(rawUrl);
  if (!url) return { opened: false, url: '' };
  try {
    await Linking.openURL(url);
    return { opened: true, url };
  } catch (e) {
    return { opened: false, url };
  }
}

/** [매장 정보 보기] — 카카오맵 매장 페이지·네이버 링크·구글 지도·가게 홈페이지를 엽니다. */
export async function openPlace(rawUrl) {
  return openExternalUrl(rawUrl);
}

/** 내 릴스 지도 공유용 텍스트/링크 */
export function buildShareLink(handle, pins, area) {
  const list = pins.slice(0, 3).map((p) => '· ' + p.name + ' (' + p.category + ')').join('\n');
  const title = area ? `내 ${area} 릴스 지도` : '내 릴스 지도';
  return `${title} — 릴스핀\n${list}\n\nhttps://reelpin.app/m/${handle}`;
}
