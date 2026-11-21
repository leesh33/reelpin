/**
 * src/utils/fontAssets.js — 🔤 네이티브 빌드에 넣는 Gmarket Sans 파일 (v2.40.0)
 * ─────────────────────────────────────────────────────────────
 * `assets/fonts/GmarketSansMedium.otf` · `GmarketSansBold.otf` 는 웹이 쓰는 woff2 와
 * **같은 원본(Gmarket Sans)** 을 OTF 로 풀어 둔 것입니다 — 글자 모양·굵기가 웹과 같습니다.
 *
 *   · `app.json` 의 expo-font 플러그인(`plugins`)이 빌드할 때 이 파일들을 앱 안에 넣고,
 *   · 앱이 켜질 때 `src/services/fontLoader.js` 가 `Font.loadAsync(FONT_FILES)` 로 한 번 더
 *     확인합니다(Expo Go·개발 빌드처럼 플러그인이 아직 적용되지 않은 환경에서도 동작).
 *
 * `require()` 는 Metro 가 자산으로 묶어 주는 형태입니다 — 경로를 문자열로 만들지 마세요.
 */
export const FONT_FILES = {
  GmarketSansMedium: require('../../assets/fonts/GmarketSansMedium.otf'),
  GmarketSansBold: require('../../assets/fonts/GmarketSansBold.otf'),
};

/** 빌드·검사에서 쓰는 파일 목록 (app.json 의 plugins 와 같은 값) */
export const FONT_FILE_PATHS = [
  './assets/fonts/GmarketSansMedium.otf',
  './assets/fonts/GmarketSansBold.otf',
];
