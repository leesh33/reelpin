/**
 * scripts/patch-web-html.mjs — v2.0 PWA 메타 주입 (배포 빌드의 마지막 한 단계)
 * ─────────────────────────────────────────────────────────────
 * Expo SDK 51 의 웹 정적 빌드(`npx expo export --platform web`)는 index.html 의 <head> 를
 * `@expo/cli` 기본 템플릿으로 만듭니다. 그 템플릿에는 `apple-touch-icon` · `manifest` ·
 * `theme-color` 가 없어서, 아이폰 '홈 화면에 추가'에서 앱 아이콘·이름이 제대로 나오지 않습니다.
 * (Expo 는 `public/index.html` 템플릿을 지원하지 않고, `public/` 폴더는 **그대로 복사**만 합니다.)
 *
 * 그래서 빌드 결과의 index.html 을 읽어 필요한 메타만 **한 번** 끼워 넣습니다.
 *   · 이미 있으면 다시 넣지 않습니다. (여러 번 실행해도 결과가 같음 = idempotent)
 *   · `public/` 의 아이콘·manifest 가 dist 에 빠져 있으면 함께 복사합니다.
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

/** `public/` 에서 dist 로 반드시 있어야 하는 파일 */
export const PWA_PUBLIC_FILES = [
  'manifest.json',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
];

/** index.html 의 </head> 앞에 들어갈 태그들 — 이미 있으면 건너뜁니다. */
export const PWA_HEAD_TAGS = [
  { key: 'theme-color', html: '<meta name="theme-color" content="' + PWA_THEME_COLOR + '" />' },
  { key: 'apple-mobile-web-app-capable', html: '<meta name="apple-mobile-web-app-capable" content="yes" />' },
  { key: 'mobile-web-app-capable', html: '<meta name="mobile-web-app-capable" content="yes" />' },
  {
    key: 'apple-mobile-web-app-status-bar-style',
    html: '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  },
  { key: 'apple-mobile-web-app-title', html: '<meta name="apple-mobile-web-app-title" content="' + PWA_APP_TITLE + '" />' },
  { key: 'application-name', html: '<meta name="application-name" content="' + PWA_APP_TITLE + '" />' },
  {
    key: 'description',
    html:
      '<meta name="description" content="릴스·쇼츠에서 본 맛집을 내 지도에 핀으로 저장하고, ' +
      '그 동네에 도착하면 알려 주는 앱" />',
  },
  { key: 'apple-touch-icon', html: '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />' },
  { key: 'icon-192', html: '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />' },
  { key: 'icon-512', html: '<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />' },
  { key: 'manifest', html: '<link rel="manifest" href="/manifest.json" />' },
];

/**
 * index.html 문자열에 PWA 메타를 끼워 넣습니다. (idempotent)
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

  const tags = PWA_HEAD_TAGS.filter((tag) => {
    // 태그를 식별하는 표식(meta name · link rel/href)이 이미 있으면 건너뜁니다.
    if (out.indexOf('name="' + tag.key + '"') >= 0) return false;
    if (tag.key === 'manifest' && /rel=["']manifest["']/i.test(out)) return false;
    if (tag.key === 'apple-touch-icon' && /rel=["']apple-touch-icon["']/i.test(out)) return false;
    if (tag.key === 'icon-192' && /sizes=["']192x192["']/i.test(out)) return false;
    if (tag.key === 'icon-512' && /sizes=["']512x512["']/i.test(out)) return false;
    return true;
  });

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
  const before = fs.readFileSync(indexPath, 'utf8');
  const { html, added } = injectPwaHead(before);
  if (html !== before) fs.writeFileSync(indexPath, html, 'utf8');
  console.log(
    '[web-html] ' +
      (added.length ? '주입: ' + added.join(', ') : 'already-ok') +
      (copied.length ? ' · 복사: ' + copied.join(', ') : '')
  );
  const missingTags = PWA_REQUIRED_MARKERS.filter((marker) => html.indexOf(marker) < 0);
  if (missingTags.length) {
    console.error('[web-html] 태그 확인 실패: ' + missingTags.join(', '));
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) main();
