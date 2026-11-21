/**
 * test/pro-card-hidden-test.jsx — 2026-11-21
 * ─────────────────────────────────────────────────────────────
 * 🙈 `내 정보` 맨 아래 **릴스핀 프로(PRO) 결제/업그레이드 카드** 숨김 회귀 검사.
 *
 * 상훈 님 요청(IMG_9294): 설정 목록 끝, `기획 이상훈 · 개발 오돌` 바로 위에 붙어 있던
 *   `PRO · 릴스핀 프로 / 월 2,900원 / 프로 시작하기` 카드를 화면에서 감춥니다.
 *
 * 지켜야 하는 것
 *   ① 스위치 `SHOW_PRO_CARD` 가 `false` 이고, 그 값이 카드 렌더를 실제로 감싼다
 *      (지운 코드가 아니라 스위치라서 `true` 로 바꾸면 그대로 돌아옴)
 *   ② 실화면(DOM)에 프로 카드의 글자·testID 가 **하나도** 없다 — 내 정보 패널 · ☰ 시트 양쪽
 *   ③ 나머지 레이아웃은 그대로 — 설정 행 7개 · `기획 이상훈 · 개발 오돌` 푸터 · 저장 요약
 *   ④ 다른 화면(설정 · 서브 페이지 · 앱 정보)에도 프로 카드가 없다
 *
 * 렌더는 react-native-web(SSR)으로 실제 컴포넌트를 그려서 확인하고(네트워크 없음),
 * 스위치·배선은 소스로 확인합니다.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import ProfileScreen, { SHOW_PRO_CARD } from '../src/screens/ProfileScreen';
import MenuDrawerModal from '../src/components/MenuDrawerModal';
import { APP_INFO_BUNDLE, APP_INFO_VERSION, SUB_PAGES } from '../src/screens/ProfileScreen';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const noop = () => {};

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

const PINS = [
  { id: 'p1', name: '영등포아바이순대국', category: '맛집', visited: false },
  { id: 'p2', name: '문래동 소금빵', category: '카페', visited: true },
];

const profileProps = {
  name: '이상훈',
  handle: 'odol',
  pins: PINS,
  categories: ['맛집', '카페'],
  radiusMeters: 500,
  alertsOn: true,
  isPro: false,
  onStartPro: noop,
  onGoPaste: noop,
  onToast: noop,
  onChangeRadius: noop,
  onToggleAlerts: noop,
  onAddCategory: noop,
  onRenameCategory: noop,
  onRemoveCategory: noop,
  cloudConfigured: true,
  cloudUser: { id: 'u-1', email: 'andy.leesh33@gmail.com' },
  cloudPinCount: 2,
};

const menuProps = {
  visible: true,
  pins: PINS,
  name: '이상훈',
  handle: 'odol',
  categories: ['맛집', '카페'],
  cloudConfigured: true,
  cloudUser: { id: 'u-1', email: 'andy.leesh33@gmail.com' },
  cloudPinCount: 2,
  radiusMeters: 500,
  alertsOn: true,
  onClose: noop,
  onShareMap: noop,
  onGoPaste: noop,
  onToast: noop,
  onOpenFeedback: noop,
  onStartPro: noop,
  onChangeRadius: noop,
  onToggleAlerts: noop,
  onAddCategory: noop,
  onRenameCategory: noop,
  onRemoveCategory: noop,
  onSignIn: noop,
  onSignUp: noop,
  onMagicLink: noop,
  onOAuth: noop,
  onSignOut: noop,
  onSyncNow: noop,
};

/** 프로 카드에서만 나오는 글자·표식 — 하나라도 있으면 숨김이 아니다 */
const PRO_MARKERS = [
  '릴스핀 프로',
  '월 2,900원',
  '연 24,900원',
  '프로 시작하기',
  '프로 플랜 사용 중',
  '프로 안내',
  'profile-pro-card',
];

/** 화면에 그려진 글자만 (태그·속성 제외) — `testID` 는 속성이라 따로 본다 */
const textOnly = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

function missing(html) {
  return PRO_MARKERS.filter((m) => html.indexOf(m) >= 0);
}

async function main() {
  // ── 1) 스위치 ─────────────────────────────────────────────────────────────
  const source = read('src/screens/ProfileScreen.js');
  check('스위치: ProfileScreen 이 `SHOW_PRO_CARD` 를 내보낸다', typeof SHOW_PRO_CARD === 'boolean', String(SHOW_PRO_CARD));
  check('스위치: 지금 값은 `false` (카드 숨김)', SHOW_PRO_CARD === false, String(SHOW_PRO_CARD));
  check(
    '스위치: 소스에 `export const SHOW_PRO_CARD = false` 가 있다(나중에 한 줄로 되켜기)',
    /export const SHOW_PRO_CARD = (false|true);/.test(source)
  );
  check(
    '배선: 프로 카드가 `SHOW_PRO_CARD ?` 로 감싸여 있다(지운 코드가 아님)',
    /\{SHOW_PRO_CARD \? \(/.test(source) && source.indexOf('styles.proCard') > source.indexOf('{SHOW_PRO_CARD ? (')
  );
  check(
    '배선: 카드 JSX 는 남아 있다 — 스위치를 true 로 바꾸면 그대로 다시 그려진다',
    ['릴스핀 프로', '월 2,900원', '프로 시작하기'].every((t) => source.indexOf(t) > 0)
  );

  // ── 2) 실화면 — 내 정보(패널) ─────────────────────────────────────────────
  const panelHtml = renderToString(<ProfileScreen {...profileProps} />);
  const panelText = textOnly(panelHtml);
  check('내 정보(패널): 프로 카드 글자·testID 가 없다', missing(panelHtml).length === 0, missing(panelHtml).join(', '));
  check('내 정보(패널): 글자만 봐도 `프로` 카드 문구가 없다', missing(panelText).length === 0, missing(panelText).join(', '));
  check('내 정보(패널): 로그인 상태(isPro=false)여도 카드가 없다', panelHtml.indexOf('프로 시작하기') < 0);

  const proUserHtml = renderToString(<ProfileScreen {...profileProps} isPro />);
  check('내 정보(패널): 프로 사용자(isPro=true)에게도 카드가 없다', missing(proUserHtml).length === 0, missing(proUserHtml).join(', '));

  // ── 3) 실화면 — ☰ 시트(panel 모드로 들어가는 실제 진입점) ────────────────
  const menuHtml = renderToString(<MenuDrawerModal {...menuProps} />);
  check('☰ 시트: 프로 카드 글자·testID 가 없다', missing(menuHtml).length === 0, missing(menuHtml).join(', '));
  check('☰ 시트: `profile-panel`(내 정보 본문)은 그대로 있다', menuHtml.indexOf('profile-panel') > 0);

  // ── 4) 나머지 레이아웃은 그대로 ──────────────────────────────────────────
  const ROWS = [
    'profile-row-categories',
    'profile-row-radius',
    'profile-row-alerts',
    'profile-row-feedback',
    'profile-row-privacy',
    'profile-row-terms',
    'profile-row-about',
  ];
  check(
    '레이아웃: 설정 행 7개가 그대로 그려진다',
    ROWS.every((id) => menuHtml.indexOf(id) > 0),
    ROWS.filter((id) => menuHtml.indexOf(id) < 0).join(', ')
  );
  check('레이아웃: 맨 끝 행은 `앱 정보`(관리자 아님)', menuHtml.indexOf('profile-row-about') > 0 && menuHtml.indexOf('profile-row-admin') < 0);
  check(
    '레이아웃: `기획 이상훈 · 개발 오돌` 푸터가 마지막 글자로 남는다',
    menuHtml.indexOf('기획 이상훈 · 개발 오돌') > 0 &&
      menuHtml.indexOf('기획 이상훈 · 개발 오돌') > menuHtml.indexOf('profile-row-about')
  );
  check('레이아웃: 저장 요약 · 지도 공유 · 계정 카드는 그대로', ['profile-summary', 'menu-share', 'profile-account-card'].every((id) => menuHtml.indexOf(id) > 0));
  check('레이아웃: 계정 카드의 플랜 칩(FREE)은 카드가 아니라 그대로', menuHtml.indexOf('FREE') > 0);

  // ── 5) 다른 화면·서브 페이지에도 카드가 없다 ─────────────────────────────
  const subs = Object.keys(SUB_PAGES);
  for (const sub of subs) {
    const html = renderToString(<ProfileScreen {...profileProps} initialSub={sub} />);
    check('서브 페이지(' + sub + '): 프로 카드가 없다', missing(html).length === 0, missing(html).join(', '));
  }
  check(
    '앱 정보 서브 페이지: 버전·번들 ID 는 그대로',
    renderToString(<ProfileScreen {...profileProps} initialSub="about" />).indexOf(APP_INFO_BUNDLE) > 0 &&
      APP_INFO_VERSION.indexOf('릴스핀 v') === 0,
    APP_INFO_VERSION + ' / ' + APP_INFO_BUNDLE
  );

  // 카드가 다른 화면(모달·설정)에 새로 생기지 않게 — 화면 파일 전체에서 카드 문구는 ProfileScreen 한 곳뿐
  const screenFiles = ['src/screens', 'src/components'].flatMap((dir) =>
    fs.readdirSync(path.join(root, dir)).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => dir + '/' + f)
  );
  const cardSurfaces = screenFiles.filter((rel) => {
    const code = read(rel);
    return code.indexOf('프로 시작하기') >= 0 || code.indexOf('월 2,900원') >= 0;
  });
  check(
    '전 화면: 프로 카드 문구는 ProfileScreen.js 한 곳에만 있다',
    cardSurfaces.length === 1 && cardSurfaces[0] === 'src/screens/ProfileScreen.js',
    cardSurfaces.join(', ')
  );
  check(
    '전 화면: 어디에도 `profile-pro-card` 를 그리는 곳이 없다(스위치 false 인 동안)',
    screenFiles.filter((rel) => read(rel).indexOf('profile-pro-card') >= 0).every((rel) => rel === 'src/screens/ProfileScreen.js') &&
      SHOW_PRO_CARD === false
  );

  if (fails) {
    console.log('\nPRO_CARD_HIDDEN_FAILED (' + fails + ')');
    process.exit(1);
  }
  console.log('\nALL_PRO_CARD_HIDDEN_OK');
}

main().catch((e) => {
  console.log('FAIL 예외: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
