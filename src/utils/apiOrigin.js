/**
 * utils/apiOrigin.js — v2.40.1
 * ─────────────────────────────────────────────────────────────
 * 서버(Vercel) 함수 `/api/*` 를 **절대 주소**로 불러야 하는 곳을 위한 한 곳.
 *
 *   · 웹      … 같은 출처(`/api/auth-config`)를 그대로 씁니다. (도메인이 바뀌어도 그대로)
 *   · 네이티브 … 같은 출처가 없습니다. 상대 경로 `fetch('/api/...')` 는 iOS 에서 곧바로 실패하므로
 *               배포 주소(`https://reelpin.vercel.app`)를 붙여 절대 주소로 부릅니다.
 *   · 그 밖(SSR·테스트) … 아무 곳도 부르지 않습니다. (fetch 는 호출부에서 거릅니다)
 *
 * 돌려주는 값은 **공개 설정·공개 조회 결과뿐**입니다. 서버 키(service_role·카카오·Gemini)는
 * Vercel 함수 안에만 있고 앱 번들로는 오지 않습니다.
 */

/** 배포 서버 주소 — `components/RealMapView.js`·`utils/legal.js` 와 같은 값 */
export const API_ORIGIN = 'https://reelpin.vercel.app';

/**
 * 지금이 네이티브 앱(iOS·Android) 런타임인가?
 *   React Native 는 전역 `navigator.product` 를 `'ReactNative'` 로 둡니다.
 *   (Node·브라우저에는 이 값이 없어서 SSR·테스트에서는 항상 false)
 */
export function isNativeRuntime() {
  try {
    return typeof navigator !== 'undefined' && !!navigator && navigator.product === 'ReactNative';
  } catch (e) {
    return false;
  }
}

/**
 * `/api/x` → 네이티브에서 쓸 절대 주소(`https://reelpin.vercel.app/api/x`).
 * 이미 절대 주소면 그대로, 빈 값이면 ''.
 */
export function apiUrl(path) {
  const value = String(path == null ? '' : path).trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return API_ORIGIN + (value.charAt(0) === '/' ? value : '/' + value);
}

/**
 * 호출부가 쓸 베이스 URL.
 *   · options.baseUrl 을 넘겼으면 그 값(테스트·프록시 대체용, '' 도 그대로 존중)
 *   · 아니면 웹은 '' (같은 출처 상대 경로), 네이티브는 API_ORIGIN
 */
export function apiBaseUrl(options = {}, web = false) {
  if (options && options.baseUrl != null) return String(options.baseUrl);
  return web ? '' : API_ORIGIN;
}
