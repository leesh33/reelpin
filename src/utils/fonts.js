/**
 * src/utils/fonts.js — 🔤 Gmarket Sans (v2.40.0)
 * ─────────────────────────────────────────────────────────────
 * 상훈 님이 고른 앱 글꼴(**Gmarket Sans**)을 **웹(PWA)** 과 **iOS·Android 네이티브**가
 * 같은 모양으로 쓰게 하는 규칙을 한 곳에 모읍니다.
 *
 *   · 웹     : `public/fonts/GmarketSans-{Medium,Bold}.woff2` 를 `index.html` 의 @font-face 로
 *              이미 받고 있고, 글자 굵기(font-weight)는 브라우저가 골라 줍니다.
 *              → 여기서는 **fontFamily 를 주지 않습니다**(CSS 가 맡습니다).
 *   · 네이티브: RN(iOS·Android)은 `fontWeight` 로 다른 파일을 고르지 못합니다.
 *              그래서 굵기마다 **글꼴 이름을 따로** 지정합니다 —
 *              400·500·600 = `GmarketSansMedium` · 700·800·900 = `GmarketSansBold`.
 *              (파일: `assets/fonts/GmarketSansMedium.otf` · `GmarketSansBold.otf`)
 *
 * 이 파일은 **순수 함수만** 둡니다(react-native·expo-font 를 import 하지 않음) —
 * Node 테스트(test/fonts-test.mjs)에서 그대로 불러 규칙을 검사합니다.
 * 실제 로딩은 `src/services/fontLoader.js`, Text 에 붙이는 일은 `src/components/AppText.js`.
 */

/** 네이티브 글꼴 이름 (OTF 안의 family/PostScript 이름과 같아야 합니다) */
export const FONT_MEDIUM = 'GmarketSansMedium';
export const FONT_BOLD = 'GmarketSansBold';

/** 웹에서 쓰는 CSS 글꼴 이름 (`scripts/patch-web-html.mjs` 의 @font-face 와 같은 값) */
export const FONT_FAMILY_WEB = "'Gmarket Sans'";

/** 웹 @font-face 가 받는 굵기 (참고·검사용) */
export const FONT_WEB_WEIGHTS = ['400', '500', '600', '700', '800', '900'];

/** 이 굵기는 Bold 파일을 쓰는가? (700 이상) */
export function isBoldWeight(weight) {
  const n = Number(weight);
  if (!Number.isFinite(n)) return false;
  return n >= 700;
}

/**
 * 굵기 → 네이티브 글꼴 이름. 웹이면 `undefined` (index.html 의 @font-face 가 처리).
 * @param {string|number} weight  RN 의 fontWeight ('400' · 700 …)
 * @param {string} platform       'web' | 'ios' | 'android'
 */
export function fontFamilyForWeight(weight, platform) {
  if (String(platform || '').toLowerCase() === 'web') return undefined;
  return isBoldWeight(weight) ? FONT_BOLD : FONT_MEDIUM;
}

/**
 * 네이티브에 글꼴이 **실제로 있는지** 기억하는 표시.
 *   · `null`  : 아직 모름 — app.json(expo-font 플러그인)으로 빌드에 들어간 경우가 대부분이라
 *               바로 글꼴을 씁니다.
 *   · `true`  : 로딩 성공 (expo-font `loadAsync`)
 *   · `false` : 로딩 실패 — 이때는 시스템 글꼴로 그립니다(없는 글꼴 이름으로 경고가 쌓이지 않게).
 */
let nativeFontsAvailable = null;

export function setNativeFontsAvailable(value) {
  nativeFontsAvailable = value === true ? true : value === false ? false : null;
  return nativeFontsAvailable;
}

export function isNativeFontsAvailable() {
  return nativeFontsAvailable;
}

/** 테스트용 — 기억을 지웁니다. */
export function __resetNativeFontsFlag() {
  nativeFontsAvailable = null;
}

/**
 * Text 한 개에 적용할 글꼴 스타일.
 *   · 웹 → `null` (아무 것도 더하지 않음 · DOM 이 지금과 똑같습니다)
 *   · 네이티브 → `{ fontFamily }` (로딩이 실패한 것으로 확인되면 null)
 */
export function nativeTextFontStyle(weight, platform, available = nativeFontsAvailable) {
  if (String(platform || '').toLowerCase() === 'web') return null;
  if (available === false) return null;
  const fontFamily = fontFamilyForWeight(weight, platform);
  return fontFamily ? { fontFamily } : null;
}
