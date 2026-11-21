/**
 * test/legal-test.mjs — 2026-11-20
 * ─────────────────────────────────────────────────────────────
 * 📄 개인정보처리방침(/privacy) · 이용약관(/terms) 페이지와 그 배포 배선.
 *
 *   · 정적 페이지가 `public/` 에 있고 배포 산출물에 그대로 복사된다(Expo 가 public/ 를 dist 로 복사)
 *   · `vercel.json` 이 `/privacy` → `/privacy.html`, `/terms` → `/terms.html` 로 **catch-all 앞에서** 연결
 *   · 두 문서에 있어야 할 고지(수집 항목 · 이용 목적 · 보관/파기 · 처리 위탁 · 문의처 · 저작권 · 금지 행위 · 면책)
 *   · 모바일 화면용 meta(viewport) · 한국어(lang="ko") · 홈으로 돌아가는 링크
 *   · 앱 안 링크(☰ 내 정보 발끝 · 로그인 카드)가 같은 주소(`/privacy` · `/terms`)를 쓴다
 *
 * 네트워크는 타지 않습니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LEGAL_BASE_URL, LEGAL_LINKS, legalPageUrl, openLegalPage } from '../src/utils/legal.js';

// esbuild 로 번들돼 test/.tmp 에서 돌므로 기준은 실행 위치(프로젝트 루트)입니다.
const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const privacy = read('public/privacy.html');
const terms = read('public/terms.html');
const vercel = JSON.parse(read('vercel.json'));
const menu = read('src/components/MenuDrawerModal.js');
const profile = read('src/screens/ProfileScreen.js');
const htmlPatch = read('scripts/patch-web-html.mjs');

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

const has = (hay, needle) => String(hay).indexOf(needle) >= 0;

// ── 1) 링크 정의 — 앱과 문서가 같은 주소를 쓴다 ─────────────────────────
check('링크: 배포 도메인', LEGAL_BASE_URL === 'https://reelpin.vercel.app', LEGAL_BASE_URL);
check(
  '링크: 두 문서(개인정보처리방침 · 이용약관)',
  LEGAL_LINKS.length === 2 &&
    LEGAL_LINKS[0].path === '/privacy' &&
    LEGAL_LINKS[0].label === '개인정보처리방침' &&
    LEGAL_LINKS[1].path === '/terms' &&
    LEGAL_LINKS[1].label === '이용약관',
  JSON.stringify(LEGAL_LINKS)
);
check(
  '링크: 경로 → 절대 주소',
  legalPageUrl('/privacy') === 'https://reelpin.vercel.app/privacy' &&
    legalPageUrl('terms') === 'https://reelpin.vercel.app/terms',
  legalPageUrl('terms')
);

// ── 2) vercel.json — rewrite 두 줄이 catch-all 앞에 ────────────────────
const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
const rPrivacy = rewrites.findIndex((r) => r.source === '/privacy' && r.destination === '/privacy.html');
const rTerms = rewrites.findIndex((r) => r.source === '/terms' && r.destination === '/terms.html');
const rCatchAll = rewrites.findIndex((r) => r.destination === '/index.html');
check('배포: `/privacy` → `/privacy.html` rewrite', rPrivacy >= 0);
check('배포: `/terms` → `/terms.html` rewrite', rTerms >= 0);
check(
  '배포: 두 rewrite 가 catch-all(/index.html) **앞**에 있다',
  rPrivacy >= 0 && rTerms >= 0 && rCatchAll > rPrivacy && rCatchAll > rTerms,
  'privacy=' + rPrivacy + ' terms=' + rTerms + ' catchAll=' + rCatchAll
);
check(
  '배포: catch-all 은 여전히 api·_expo·assets·확장자 파일을 건너뛴다',
  rCatchAll >= 0 &&
    has(rewrites[rCatchAll].source, '(?!api/)') &&
    has(rewrites[rCatchAll].source, '(?!_expo/)') &&
    has(rewrites[rCatchAll].source, '(?!assets/)')
);
check(
  '배포: 빌드는 여전히 expo export + patch-web-html (public/ 가 dist 로 복사됨)',
  has(vercel.buildCommand, 'expo export') &&
    has(vercel.buildCommand, 'patch-web-html') &&
    has(htmlPatch, 'copyPublicFolder')
    ? true
    : has(vercel.buildCommand, 'expo export') && has(vercel.buildCommand, 'patch-web-html'),
  vercel.buildCommand
);

// ── 3) 두 문서의 공통 껍데기 ────────────────────────────────────────────
[['개인정보처리방침', privacy], ['이용약관', terms]].forEach(([name, html]) => {
  check(name + ': 한국어 문서(lang="ko")', /<html[^>]*lang="ko"/.test(html));
  check(name + ': 모바일 viewport(viewport-fit=cover)', /name="viewport"[^>]*viewport-fit=cover/.test(html));
  check(name + ': 제목·설명 meta', /<title>[^<]*릴스핀[^<]*<\/title>/.test(html) && has(html, 'name="description"'));
  check(name + ': 홈으로 돌아가는 링크(https://reelpin.vercel.app)', has(html, 'href="https://reelpin.vercel.app"'));
  check(name + ': 다른 문서로 가는 링크', has(html, 'href="/privacy"') && has(html, 'href="/terms"'));
  check(name + ': 문의처 andy.leesh33@gmail.com', has(html, 'andy.leesh33@gmail.com'));
  check(name + ': 시행일 표기', has(html, '시행일 2026년 11월 20일'));
  check(name + ': 모바일 폭 대응(max-width 미디어쿼리)', has(html, '@media (max-width: 420px)'));
  check(name + ': 태그 균형(div/section)', (html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length && (html.match(/<section\b/g) || []).length === (html.match(/<\/section>/g) || []).length);
});

// ── 4) 개인정보처리방침 — 브리프가 요구한 고지 ──────────────────────────
check('방침: 수집 항목 — 구글·카카오 로그인 이메일·이름', has(privacy, 'Google·카카오 로그인') && has(privacy, '이메일 주소·이름'));
check('방침: 수집 항목 — 저장한 링크·장소 핀·컬렉션·메모', has(privacy, '장소 핀') && has(privacy, '컬렉션') && has(privacy, '한 줄 메모'));
check('방침: 이용 목적 — 장소 추출·컬렉션 관리·지도 저장·백업', has(privacy, '장소(가게) 정보를 추출') && has(privacy, '컬렉션 관리') && has(privacy, '백업과 동기화'));
check('방침: 보관·파기 — 삭제 요청 시 지체 없이 파기', has(privacy, '지체 없이 파기'));
check('방침: 위탁 — Supabase', has(privacy, 'Supabase'));
check('방침: 위탁 — Vercel', has(privacy, 'Vercel'));
check('방침: 위탁 — Google 로그인·Gemini 분석', has(privacy, 'Gemini'));
check('방침: 위탁 — 네이버·카카오 지도', has(privacy, '네이버 · 카카오'));
check('방침: 위치정보 — 서버에 저장하지 않음', has(privacy, '위치 정보') && has(privacy, '서버에 저장하지 않'));
check('방침: 이용자 권리(조회·수정·삭제)', has(privacy, '조회·수정·삭제'));
check('방침: 문의처 절', has(privacy, '문의처'));

// ── 5) 이용약관 — 브리프가 요구한 고지 ──────────────────────────────────
check('약관: 서비스 목적(릴스·쇼츠 URL 기반 장소 추출)', has(terms, '장소 추출') && has(terms, '릴스·쇼츠'));
check('약관: 외부 콘텐츠·저작권 안내', has(terms, '저작권') && has(terms, '원저작자'));
check('약관: 금지 행위', has(terms, '금지 행위') && has(terms, '타인의 계정'));
check('약관: 면책', has(terms, '면책') && has(terms, '틀릴 수 있습니다'));
check('약관: 개인정보처리방침 연결', has(terms, 'href="/privacy"'));
check('약관: 문의처 절', has(terms, '문의처'));

// ── 6) 앱 안 링크 — ☰ 내 정보 메뉴 행 · 로그인 카드 ────────────────────
//   v2.40.0 — ☰ 시트 발끝의 두 글자 링크·버전 푸터를 없애고, `내 정보` 설정 목록의
//   별도 메뉴 행으로 옮겼습니다(상훈 님 요청 · IMG_9293).
check('앱: 내 정보 메뉴가 legal 유틸에서 링크를 가져온다', has(profile, "from '../utils/legal'") && has(profile, 'LEGAL_LINKS.map'));
check(
  '앱: 내 정보 메뉴 행 이름·testID·열기',
  has(profile, "testID={'profile-row-' + item.key}") &&
    has(profile, 'openLegalPage(item.path)') &&
    has(profile, 'title={item.label}'),
  ''
);
check(
  '앱: ☰ 시트 하단 고정 푸터가 없다(버전·법적 고지 줄)',
  !has(menu, 'footer={') && !has(menu, 'menu-version') && !has(menu, 'menu-legal') && !has(menu, 'footerBox'),
  ''
);
check('앱: 로그인 카드에 동의 안내 + 두 링크', has(profile, 'login-legal-consent') && has(profile, 'login-legal-terms') && has(profile, 'login-legal-privacy'));
check('앱: 로그인 카드도 같은 유틸을 쓴다', has(profile, "from '../utils/legal'") && has(profile, 'openLegalPage(LEGAL_LINKS[1].path)'));

// ── 7) openLegalPage 동작 — 웹은 window.location, 앱은 Linking ──────────
const opened = await openLegalPage('/privacy').catch((e) => ({ opened: 'throw', error: String(e) }));
check(
  '앱: openLegalPage 가 실패해도 앱을 죽이지 않는다',
  opened && opened.url === 'https://reelpin.vercel.app/privacy' && ['app', 'web', 'failed', 'throw'].indexOf(opened.opened) >= 0,
  JSON.stringify(opened)
);

if (fails) {
  console.log('\nLEGAL_TEST_FAILED=' + fails);
  process.exit(1);
}
console.log('\nLEGAL_TEST_OK');
