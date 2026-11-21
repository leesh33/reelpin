/**
 * src/utils/fontAssets.web.js — 🔤 웹에서는 네이티브 글꼴 파일을 싣지 않습니다 (v2.40.0)
 * ─────────────────────────────────────────────────────────────
 * 웹은 `index.html` 의 @font-face 가 `public/fonts/*.woff2` 를 받아 쓰므로,
 * `assets/fonts/*.otf`(약 2.4MB)를 **웹 번들에 넣을 이유가 없습니다**.
 * Metro 는 웹 빌드에서 `fontAssets.js` 대신 이 파일(`.web.js`)을 먼저 고르므로
 * 웹 배포물에는 OTF 가 실리지 않고, iOS·Android 빌드는 원래 파일을 씁니다.
 *
 * (그래서 `scripts/patch-web-html.mjs` 의 woff2 주입과 역할이 겹치지 않습니다)
 */
export const FONT_FILES = {};
export const FONT_FILE_PATHS = [];
