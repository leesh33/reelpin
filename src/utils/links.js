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

/** [매장 정보 보기] — 카카오맵 매장 페이지·네이버 링크·구글 지도·가게 홈페이지를 엽니다. */
export async function openPlace(rawUrl) {
  const url = normalizePlaceUrl(rawUrl);
  if (!url) return { opened: false, url: '' };
  try {
    await Linking.openURL(url);
    return { opened: true, url };
  } catch (e) {
    return { opened: false, url };
  }
}

/** 내 릴스 지도 공유용 텍스트/링크 */
export function buildShareLink(handle, pins, area) {
  const list = pins.slice(0, 3).map((p) => '· ' + p.name + ' (' + p.category + ')').join('\n');
  const title = area ? `내 ${area} 릴스 지도` : '내 릴스 지도';
  return `${title} — 릴스핀\n${list}\n\nhttps://reelpin.app/m/${handle}`;
}
