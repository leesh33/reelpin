/**
 * scripts/patch-web-html.mjs — 배포 빌드의 마지막 한 단계 (PWA 메타 + Gmarket Sans)
 * ─────────────────────────────────────────────────────────────
 * Expo SDK 51 의 웹 정적 빌드(`npx expo export --platform web`)는 index.html 의 <head> 를
 * `@expo/cli` 기본 템플릿으로 만듭니다. 그 템플릿에는 `apple-touch-icon` · `manifest` ·
 * `theme-color` 가 없어서, 아이폰 '홈 화면에 추가'에서 앱 아이콘·이름이 제대로 나오지 않습니다.
 * (Expo 는 `public/index.html` 템플릿을 지원하지 않고, `public/` 폴더는 **그대로 복사**만 합니다.)
 *
 * 그래서 빌드 결과의 index.html 을 읽어 필요한 메타만 **한 번** 끼워 넣습니다.
 *   · 이미 있으면 다시 넣지 않습니다. (여러 번 실행해도 결과가 같음 = idempotent)
 *   · `public/` 의 아이콘·manifest·폰트가 dist 에 빠져 있으면 함께 복사합니다.
 *
 * v2.38.0 — **앱 전체 폰트를 Gmarket Sans 로** (상훈 님 선택, 2026-11-21)
 *   · `public/fonts/GmarketSans-{Medium,Bold}.{woff2,woff}` 를 self-host (CDN 의존 없음 → 오프라인·아이폰 홈화면 앱에서도 동일)
 *   · CSS 로 넣는 이유: 이 앱은 react-native-web 이라 모든 Text 가 `.css-146c3p1`
 *     (`font: 14px -apple-system, …`) 클래스를 달고 나옵니다. 스타일 파일 30여 개를 고치는 대신
 *     **그 기본 글꼴만** `#root [dir="auto"]`(Text 루트가 늘 갖는 속성) 로 덮습니다.
 *     · 아이콘(@expo/vector-icons)은 `style="font-family: ionicons"` **인라인**이라
 *       클래스 선택자(우리 규칙)보다 우선합니다 → 여기서 `!important` 를 쓰지 않는 한 네모(□)로 깨지지 않습니다.
 *     · 본문 500 → Medium 파일, 600·700·800·900 → Bold 파일 (앱이 쓰는 굵기는 500·600·700·800·900 뿐)
 *
 * 실행
 *   node scripts/patch-web-html.mjs [dist경로]
 *   (= `npm run export:web`, Vercel buildCommand 가 자동으로 부릅니다)
 *
 * 이 파일은 순수 Node 스크립트입니다. 테스트(`test/ssr-smoke.jsx`)가 `injectPwaHead` 를
 * 직접 불러 규칙을 확인합니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 배포 기본 origin — 미리보기 도메인이어도 링크는 https 로 열립니다. */
export const PWA_THEME_COLOR = '#0D9488';
export const PWA_APP_TITLE = '릴스핀';

/**
 * 2026-11-21 — VibeAiClub 사이트 소유 인증 (상훈 님 요청, 버전 번호는 그대로)
 *   · 방법 1: 첫 화면(index.html) <head> 의 meta 태그
 *   · 방법 2: 정적 파일 /.well-known/vibeaiclub-verify.txt (public/ → dist/)
 *   둘 중 하나만 통과해도 되지만, 어느 쪽을 보는지 알 수 없어 둘 다 넣습니다.
 */
export const VIBEAICLUB_VERIFY_CODE = 'vac-4ODYOLDHpDauAQOUPmdQgXej';
export const VIBEAICLUB_VERIFY_PATH = '.well-known/vibeaiclub-verify.txt';

/** `public/` 에서 dist 로 반드시 있어야 하는 파일 */
export const PWA_PUBLIC_FILES = [
  'manifest.json',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
];

/* ─────────────────────────────────────────────────────────────
 * v2.38.0 — Gmarket Sans (본문 Medium 500 · 제목/버튼 Bold 700)
 * ───────────────────────────────────────────────────────────── */

/** CSS font-family 이름 (공백 포함 — 따옴표까지 포함한 문자열로 씁니다) */
export const FONT_FAMILY = "'Gmarket Sans'";

/**
 * 뒤에 붙는 대체 글꼴 — Gmarket Sans 에 없는 글자(이모지 등)만 여기로 떨어집니다.
 * (한글 11,172자 · 라틴 · 숫자 · 문장부호는 Gmarket Sans 가 모두 가지고 있습니다)
 */
export const FONT_FALLBACK =
  '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

/**
 * self-host 하는 폰트 파일 — `public/fonts/` → `/fonts/`
 *   앱이 실제로 쓰는 굵기(500·600·700·800·900)마다 @font-face 를 따로 선언합니다.
 *   (굵기 범위(font-weight: 400 600)는 표준이지만 아이폰 구형 Safari 에서 무시될 수 있어,
 *    한 굵기씩 찍어 두면 브라우저가 '합성 볼드'로 흉내내지 않고 항상 실제 파일을 씁니다)
 *     500·600 → Medium,  700·800·900 → Bold
 */
export const FONT_FACES = [
  { file: 'GmarketSans-Medium', weights: ['400', '500', '600'] },
  { file: 'GmarketSans-Bold', weights: ['700', '800', '900'] },
];

/** dist 로 함께 복사해야 하는 폰트 파일 이름들 */
export const FONT_FILES = FONT_FACES.flatMap((face) => [face.file + '.woff2', face.file + '.woff']);

/** react-native-web 이 Text 에 붙이는 기본 글꼴 클래스 (0.19.10 기준) — `[dir="auto"]` 와 함께 이중으로 잡습니다. */
export const RNW_TEXT_CLASSES = ['.css-146c3p1', '.css-11aywtz'];

/** 폰트 파일 하나의 @font-face 선언 (woff2 우선, woff 는 예비) */
export function fontFaceCss(face, weight) {
  return (
    '@font-face{font-family:' +
    FONT_FAMILY +
    ';font-style:normal;font-weight:' +
    weight +
    ';font-display:swap;src:url(\'/fonts/' +
    face.file +
    ".woff2') format('woff2'),url('/fonts/" +
    face.file +
    ".woff') format('woff')}"
  );
}

/** index.html 에 들어갈 @font-face + 전역 글꼴 규칙 */
export const FONT_CSS = [
  ...FONT_FACES.flatMap((face) => face.weights.map((weight) => fontFaceCss(face, weight))),
  // 아이콘은 인라인 font-family: ionicons 가 이깁니다(!important 를 쓰지 않는 이유)
  'html,body{font-family:' + FONT_FAMILY + ',' + FONT_FALLBACK + '}',
  '#root [dir="auto"],' + RNW_TEXT_CLASSES.map((cls) => '#root ' + cls).join(',') + '{font-family:' + FONT_FAMILY + ',' + FONT_FALLBACK + '}',
].join('\n');

/** index.html 의 </head> 앞에 들어갈 태그들 — 이미 있으면 건너뜁니다. */
export const PWA_HEAD_TAGS = [
  { key: 'theme-color', marker: 'name="theme-color"', html: '<meta name="theme-color" content="' + PWA_THEME_COLOR + '" />' },
  {
    key: 'apple-mobile-web-app-capable',
    marker: 'name="apple-mobile-web-app-capable"',
    html: '<meta name="apple-mobile-web-app-capable" content="yes" />',
  },
  {
    key: 'mobile-web-app-capable',
    marker: 'name="mobile-web-app-capable"',
    html: '<meta name="mobile-web-app-capable" content="yes" />',
  },
  {
    key: 'apple-mobile-web-app-status-bar-style',
    marker: 'name="apple-mobile-web-app-status-bar-style"',
    html: '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  },
  {
    key: 'apple-mobile-web-app-title',
    marker: 'name="apple-mobile-web-app-title"',
    html: '<meta name="apple-mobile-web-app-title" content="' + PWA_APP_TITLE + '" />',
  },
  {
    key: 'application-name',
    marker: 'name="application-name"',
    html: '<meta name="application-name" content="' + PWA_APP_TITLE + '" />',
  },
  {
    key: 'description',
    marker: 'name="description"',
    html:
      '<meta name="description" content="릴스·쇼츠에서 본 맛집을 내 지도에 핀으로 저장하고, ' +
      '그 동네에 도착하면 알려 주는 앱" />',
  },
  {
    key: 'apple-touch-icon',
    marker: 'rel="apple-touch-icon"',
    html: '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
  },
  { key: 'icon-192', marker: 'sizes="192x192"', html: '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />' },
  { key: 'icon-512', marker: 'sizes="512x512"', html: '<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />' },
  { key: 'manifest', marker: 'rel="manifest"', html: '<link rel="manifest" href="/manifest.json" />' },

  // v2.38.0 — Gmarket Sans: 첫 화면부터 Medium·Bold 를 받아 두고(swap), 없으면 3G 에서도 시스템 글꼴로 먼저 그립니다.
  {
    key: 'font-preload-medium',
    marker: 'href="/fonts/GmarketSans-Medium.woff2"',
    html: '<link rel="preload" href="/fonts/GmarketSans-Medium.woff2" as="font" type="font/woff2" crossorigin />',
  },
  {
    key: 'font-preload-bold',
    marker: 'href="/fonts/GmarketSans-Bold.woff2"',
    html: '<link rel="preload" href="/fonts/GmarketSans-Bold.woff2" as="font" type="font/woff2" crossorigin />',
  },
  { key: 'reelpin-font', marker: 'id="reelpin-font"', html: '<style id="reelpin-font">\n' + FONT_CSS + '\n</style>' },

  // 2026-11-21 — VibeAiClub 소유 인증(방법 1: <head> meta)
  {
    key: 'vibeaiclub-verify',
    marker: 'name="vibeaiclub-verify"',
    html: '<meta name="vibeaiclub-verify" content="' + VIBEAICLUB_VERIFY_CODE + '" />',
  },
];

/**
 * index.html 문자열에 PWA 메타 + 폰트를 끼워 넣습니다. (idempotent)
 * @param {string} html
 * @returns {{html: string, added: string[]}}
 */
export function injectPwaHead(html) {
  const source = String(html == null ? '' : html);
  if (!source) return { html: source, added: [] };
  const added = [];
  let out = source;

  // 언어: 템플릿이 lang="en" 으로 나옵니다.
  if (/<html[^>]*lang=["']en["']/i.test(out)) {
    out = out.replace(/<html([^>]*)lang=["']en["']/i, '<html$1lang="ko"');
  }

  // 노치 화면에서 상태바까지 채우기 (아이폰 홈 화면 앱)
  out = out.replace(
    /<meta name="viewport" content="([^"]*)"/i,
    (m, content) => (content.indexOf('viewport-fit') >= 0 ? m : '<meta name="viewport" content="' + content + ', viewport-fit=cover"')
  );

  const tags = PWA_HEAD_TAGS.filter((tag) => out.indexOf(tag.marker) < 0);

  if (tags.length && out.indexOf('</head>') >= 0) {
    out = out.replace('</head>', tags.map((t) => '    ' + t.html).join('\n') + '\n  </head>');
    tags.forEach((t) => added.push(t.key));
  }
  return { html: out, added };
}

/** 배포 결과에 반드시 있어야 하는 표식들 — CLI 가 마지막으로 확인합니다. */
export const PWA_REQUIRED_MARKERS = [
  'name="theme-color"',
  'name="apple-mobile-web-app-capable"',
  'name="apple-mobile-web-app-title"',
  'rel="apple-touch-icon"',
  'rel="manifest"',
  '/icon-192.png',
  '/icon-512.png',
  'lang="ko"',
  'name="vibeaiclub-verify"',
];

/** v2.38.0 — Gmarket Sans 가 실제로 들어갔는지 확인하는 표식 */
export const FONT_REQUIRED_MARKERS = [
  'id="reelpin-font"',
  "font-family:'Gmarket Sans'",
  'font-display:swap',
  "url('/fonts/GmarketSans-Medium.woff2')",
  "url('/fonts/GmarketSans-Bold.woff2')",
  'href="/fonts/GmarketSans-Medium.woff2"',
  'href="/fonts/GmarketSans-Bold.woff2"',
  '#root [dir="auto"]',
];

/** `public/` 의 PWA 파일을 dist 로 복사 (Expo 가 복사한 경우 덮어쓰지 않음) */
export function ensurePublicFiles(projectRoot, distDir) {
  const copied = [];
  PWA_PUBLIC_FILES.forEach((name) => {
    const from = path.join(projectRoot, 'public', name);
    const to = path.join(distDir, name);
    if (!fs.existsSync(from)) return;
    if (fs.existsSync(to)) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.push(name);
  });
  return copied;
}

/** `public/fonts/` 의 Gmarket Sans 를 dist/fonts 로 복사 (없을 때만) */
export function ensureFontFiles(projectRoot, distDir) {
  const copied = [];
  FONT_FILES.forEach((name) => {
    const from = path.join(projectRoot, 'public', 'fonts', name);
    const to = path.join(distDir, 'fonts', name);
    if (!fs.existsSync(from)) return;
    if (fs.existsSync(to)) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.push(name);
  });
  return copied;
}

/**
 * 2026-11-21 — `public/.well-known/` 의 소유 인증 파일을 dist 로 복사합니다.
 *   · Expo 의 `public/` 복사는 숨김 폴더(`.well-known`)를 건너뛸 수 있어 직접 확인해 복사합니다.
 *   · 본문이 다르면 덮어씁니다(인증 코드는 한 글자라도 틀리면 실패).
 * @returns {string[]} 복사한 파일 경로
 */
export function ensureWellKnownFiles(projectRoot, distDir) {
  const copied = [];
  const from = path.join(projectRoot, 'public', VIBEAICLUB_VERIFY_PATH);
  const to = path.join(distDir, VIBEAICLUB_VERIFY_PATH);
  if (!fs.existsSync(from)) return copied;
  const want = fs.readFileSync(from, 'utf8').trim();
  const have = fs.existsSync(to) ? fs.readFileSync(to, 'utf8').trim() : null;
  if (have === want) return copied;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied.push(VIBEAICLUB_VERIFY_PATH);
  return copied;
}

/** CLI 진입점 — dist/index.html 을 고치고 결과를 한 줄로 알려 줍니다. */
function main() {
  const projectRoot = process.cwd();
  const distDir = path.resolve(projectRoot, process.argv[2] || 'dist');
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('[web-html] dist/index.html 이 없습니다. 먼저 `npx expo export --platform web` 을 실행하세요.');
    process.exit(1);
  }
  const copied = ensurePublicFiles(projectRoot, distDir);
  const copiedFonts = ensureFontFiles(projectRoot, distDir);
  const wellKnown = ensureWellKnownFiles(projectRoot, distDir);
  const before = fs.readFileSync(indexPath, 'utf8');
  const { html, added } = injectPwaHead(before);
  if (html !== before) fs.writeFileSync(indexPath, html, 'utf8');
  console.log(
    '[web-html] ' +
      (added.length ? '주입: ' + added.join(', ') : 'already-ok') +
      (copied.length ? ' · 복사: ' + copied.join(', ') : '') +
      (copiedFonts.length ? ' · 폰트 복사: ' + copiedFonts.join(', ') : '') +
      (wellKnown.length ? ' · 인증 파일: ' + wellKnown.join(', ') : '')
  );
  const missingTags = PWA_REQUIRED_MARKERS.filter((marker) => html.indexOf(marker) < 0);
  if (missingTags.length) {
    console.error('[web-html] 태그 확인 실패: ' + missingTags.join(', '));
    process.exit(1);
  }
  const missingFonts = FONT_REQUIRED_MARKERS.filter((marker) => html.indexOf(marker) < 0);
  if (missingFonts.length) {
    console.error('[web-html] 폰트 확인 실패: ' + missingFonts.join(', '));
    process.exit(1);
  }
  const missingFiles = FONT_FILES.filter((name) => !fs.existsSync(path.join(distDir, 'fonts', name)));
  if (missingFiles.length) {
    console.error('[web-html] 폰트 파일 없음: ' + missingFiles.join(', '));
    process.exit(1);
  }
  // 2026-11-21 — 소유 인증 파일이 dist 에 정확한 본문으로 있는지 (Vercel 이 그대로 서빙)
  const verifyFile = path.join(distDir, VIBEAICLUB_VERIFY_PATH);
  const verifyBody = fs.existsSync(verifyFile) ? fs.readFileSync(verifyFile, 'utf8').trim() : '';
  if (verifyBody !== VIBEAICLUB_VERIFY_CODE) {
    console.error('[web-html] 소유 인증 파일 확인 실패: ' + VIBEAICLUB_VERIFY_PATH + ' (본문 ' + JSON.stringify(verifyBody) + ')');
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) main();
