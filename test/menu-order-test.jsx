/**
 * test/menu-order-test.mjs — v2.39.0
 * ─────────────────────────────────────────────────────────────
 * 📋 ☰ `내 정보` 시트의 설정 메뉴 순서 · 하단 고정 푸터 제거 · 법적 고지 행.
 *
 * 상훈 님 요청(IMG_9293):
 *   ① 시트 맨 아래 고정 푸터(`릴스핀 v2.38.0 / 개인정보처리방침 · 이용약관`) 제거
 *   ② 메뉴 순서 = 분류 관리 → 지오펜스 알림 반경 → 알림 설정 → 제안 · 버그 제보
 *                → 개인정보처리방침 → 이용약관 → 앱 정보 → (관리자) 어드민
 *   ③ 개인정보처리방침/이용약관은 별도 행 — 누르면 `/privacy` · `/terms`
 *
 * 실제 렌더(react-native-web) 결과의 **행 순서**를 보고, 클릭 배선은 소스와
 * `openLegalPage` 가 만드는 주소로 확인합니다. 네트워크는 타지 않습니다.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import MenuDrawerModal, { APP_VERSION_LABEL } from '../src/components/MenuDrawerModal';
import { APP_INFO_VERSION } from '../src/screens/ProfileScreen';
import { LEGAL_LINKS, legalPageUrl, openLegalPage } from '../src/utils/legal';

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

const baseProps = {
  visible: true,
  pins: [
    { id: 'p1', name: '영등포아바이순대국', category: '맛집', visited: false },
    { id: 'p2', name: '문래동 소금빵', category: '카페', visited: true },
  ],
  categories: ['맛집', '카페'],
  cloudConfigured: false,
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

async function main() {
  const html = renderToString(<MenuDrawerModal {...baseProps} />);
  const adminHtml = renderToString(
    <MenuDrawerModal {...baseProps} isAdminAccount onGoAdmin={noop} />
  );

  // ── 1) 행 순서 — 요청한 그대로 ────────────────────────────────────────────
  const ORDER = [
    'profile-row-categories', // 분류 관리
    'profile-row-radius', // 지오펜스 알림 반경
    'profile-row-alerts', // 알림 설정
    'profile-row-feedback', // 제안 · 버그 제보
    'profile-row-privacy', // 개인정보처리방침
    'profile-row-terms', // 이용약관
    'profile-row-about', // 앱 정보
  ];
  const at = ORDER.map((id) => html.indexOf(id));
  check(
    '순서: 7행이 모두 그려진다',
    at.every((pos) => pos > 0),
    ORDER.filter((id, i) => at[i] < 0).join(', ')
  );
  check(
    '순서: 분류 관리 → 지오펜스 알림 반경 → 알림 설정 → 제안 · 버그 제보 → 개인정보처리방침 → 이용약관 → 앱 정보',
    at.every((pos, i) => (i === 0 ? true : at[i - 1] < pos)),
    at.join(' < ')
  );
  check(
    '순서: 앱 정보가 개인정보처리방침·이용약관 **아래**',
    html.indexOf('profile-row-privacy') < html.indexOf('profile-row-about') &&
      html.indexOf('profile-row-terms') < html.indexOf('profile-row-about')
  );
  check('순서: 관리자면 어드민이 맨 끝', adminHtml.indexOf('profile-row-about') < adminHtml.indexOf('profile-row-admin'));
  check('순서: 일반 사용자에게는 어드민 행이 없다', html.indexOf('profile-row-admin') < 0);

  // 행 이름(사용자가 보는 글자)도 그 자리에 있는지 — testID 만 맞고 글자가 빠지는 일 방지
  const ROW_LABELS = [
    ['분류 관리', 'profile-row-categories'],
    ['지오펜스 알림 반경', 'profile-row-radius'],
    ['알림 설정', 'profile-row-alerts'],
    ['제안 · 버그 제보', 'profile-row-feedback'],
    ['개인정보처리방침', 'profile-row-privacy'],
    ['이용약관', 'profile-row-terms'],
    ['앱 정보', 'profile-row-about'],
  ];
  check(
    '이름: 각 행에 이름이 함께 그려진다',
    ROW_LABELS.every(([label, id]) => {
      const pos = html.indexOf(id);
      if (pos < 0) return false;
      // 같은 행 블록(다음 행 testID 전까지) 안에 글자가 있어야 합니다.
      const next = ORDER.slice(ORDER.indexOf(id) + 1).map((n) => html.indexOf(n)).filter((n) => n > pos);
      const end = next.length ? Math.min(...next) : html.length;
      return html.slice(pos, end).indexOf(label) >= 0;
    })
  );
  check(
    '설명줄: 개인정보처리방침 · 이용약관 행에 한 줄 설명',
    html.indexOf(LEGAL_LINKS[0].desc) > 0 && html.indexOf(LEGAL_LINKS[1].desc) > 0
  );

  // ── 2) 하단 고정 푸터 제거 ────────────────────────────────────────────────
  check('푸터: `menu-version`(버전 줄)이 없다', html.indexOf('menu-version') < 0);
  check('푸터: `menu-legal`(법적 고지 두 글자 링크)이 없다', html.indexOf('menu-legal') < 0);
  check(
    '푸터: 소스에 LayerSheet footer/법적 고지 푸터 스타일이 남아 있지 않다',
    !read('src/components/MenuDrawerModal.js').includes('footer={') &&
      !read('src/components/MenuDrawerModal.js').includes('footerBox')
  );
  check(
    '푸터: 시트 내용이 끝난 뒤 고정 줄이 그려지지 않는다(마지막 행 다음은 `기획 이상훈 · 개발 오돌` · 2026-11-21 부터 프로 카드 없음)',
    html.indexOf('profile-row-about') < html.indexOf('기획 이상훈 · 개발 오돌') &&
      html.indexOf('릴스핀 프로') < 0
  );

  // ── 3) 클릭 배선 — 개인정보처리방침 → /privacy · 이용약관 → /terms ────────
  check(
    '클릭: 두 행이 legal 유틸의 경로로 연다',
    read('src/screens/ProfileScreen.js').includes('openLegalPage(item.path)')
  );
  check(
    '클릭: 주소는 배포 도메인의 /privacy · /terms',
    legalPageUrl(LEGAL_LINKS[0].path) === 'https://reelpin.vercel.app/privacy' &&
      legalPageUrl(LEGAL_LINKS[1].path) === 'https://reelpin.vercel.app/terms',
    legalPageUrl(LEGAL_LINKS[0].path) + ' / ' + legalPageUrl(LEGAL_LINKS[1].path)
  );
  const openedPrivacy = await openLegalPage(LEGAL_LINKS[0].path).catch((e) => ({ opened: 'throw', error: String(e) }));
  check(
    '클릭: openLegalPage 가 죽지 않고 그 주소를 돌려준다',
    openedPrivacy && openedPrivacy.url === 'https://reelpin.vercel.app/privacy' && openedPrivacy.opened !== 'throw',
    JSON.stringify(openedPrivacy)
  );
  const openedTerms = await openLegalPage(LEGAL_LINKS[1].path).catch((e) => ({ opened: 'throw', error: String(e) }));
  check(
    '클릭: 이용약관도 /terms',
    openedTerms && openedTerms.url === 'https://reelpin.vercel.app/terms' && openedTerms.opened !== 'throw',
    JSON.stringify(openedTerms)
  );

  // ── 4) 서브 페이지(앱 정보)는 그대로 열린다 ───────────────────────────────
  const aboutHtml = renderToString(<MenuDrawerModal {...baseProps} initialSub="about" />);
  check('앱 정보: 서브 페이지가 열리고 버전·번들 ID 를 보여 준다', aboutHtml.indexOf('menu-sub-about') > 0 && aboutHtml.indexOf(APP_INFO_VERSION) > 0 && aboutHtml.indexOf('com.odol.reelpin') > 0);
  check('버전: 메뉴·앱 정보 같은 v2.39.0', APP_VERSION_LABEL === '릴스핀 v2.39.0' && APP_INFO_VERSION === APP_VERSION_LABEL, APP_VERSION_LABEL + ' / ' + APP_INFO_VERSION);

  if (fails) {
    console.log('\nMENU_ORDER_TEST_FAILED=' + fails);
    process.exit(1);
  }
  console.log('\nMENU_ORDER_TEST_OK');
}

main().catch((e) => {
  console.log('FAIL 실행 오류 -> ' + String(e));
  process.exit(1);
});
