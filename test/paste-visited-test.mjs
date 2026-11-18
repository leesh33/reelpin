/**
 * test/paste-visited-test.mjs — v2.33.4
 * ─────────────────────────────────────────────────────────────
 * 저장 화면(`PasteScreen`)의 ✅ `가봤어요` 토글 — **저장 페이로드**를 검사합니다.
 *
 *   ① `utils/saveResult.buildResultPins` — 선택한 후보 → 핀 목록
 *        · 체크하면 **모든 핀**이 visited=true + visitedAt(같은 시각)
 *        · 체크하지 않으면 미방문(visited=false · visitedAt '')
 *        · 분류·링크·플랫폼·한줄 메모가 탭(링크·사진·가게명)마다 그대로 실린다
 *        · 한 묶음의 id 는 서로 겹치지 않는다
 *   ② 토글 글은 시트·상세와 같은 한 곳(`utils/longPressPlace.visitedToggleText`)
 *   ③ 저장 화면 소스가 실제로 이 카드를 그리고, 새 결과·저장 뒤에 값을 풀며,
 *      저장할 때 visited 를 넘기는지 (배선 확인)
 *   ④ App 이 이미 저장한 곳에 체크해 저장할 때 그 핀만 방문 완료로 바꾸는지
 *
 * 화면 렌더 자체(카드 모양·문구·aria-checked)는 `test/ssr-smoke.jsx` 가 봅니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildResultPins } from '../src/utils/saveResult.js';
import { visitedToggleText } from '../src/utils/longPressPlace.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

const AT = new Date('2026-11-18T13:00:00.000Z');
const CANDIDATES = [
  { id: 'c1', name: '블루스모크', area: '성수동', address: '서울 성동구 성수동2가 1', lat: 37.5445, lng: 127.0557, category: '맛집', providers: ['kakao'] },
  { id: 'c2', name: '베통', area: '성수동', address: '서울 성동구 연무장길 21', lat: 37.5427, lng: 127.0558, category: '베이커리', providers: ['kakao', 'naver'] },
];

// ═════════════════════════════════════════════════════════════
// 1. ✅ 가봤어요 — 저장 페이로드
// ═════════════════════════════════════════════════════════════
const off = buildResultPins(CANDIDATES, { category: '맛집', platform: 'search', memo: '', visited: false, now: AT });
check('핀: 선택한 N곳이 모두 핀으로', off.length === 2, String(off.length));
check(
  '핀: 체크하지 않으면 모두 미방문(visited=false · visitedAt 빈 값)',
  off.every((p) => p.visited === false && p.visitedAt === ''),
  JSON.stringify(off.map((p) => [p.visited, p.visitedAt]))
);

const on = buildResultPins(CANDIDATES, { category: '맛집', platform: 'search', memo: '웨이팅 20분', visited: true, now: AT });
check(
  '[핵심] 체크하면 저장하는 **모든 핀**이 visited=true',
  on.length === 2 && on.every((p) => p.visited === true),
  JSON.stringify(on.map((p) => p.visited))
);
check(
  '[핵심] 방문 시각(visitedAt)이 저장 시각으로 채워진다',
  on.every((p) => p.visitedAt === AT.toISOString()),
  JSON.stringify(on.map((p) => p.visitedAt))
);
check(
  '핀: 한 묶음의 id 가 서로 겹치지 않는다(같은 밀리초에 여러 곳)',
  on[0].id !== on[1].id && on.every((p) => String(p.id).indexOf('pin-') === 0),
  JSON.stringify(on.map((p) => p.id))
);
check(
  '핀: 분류는 화면에서 고른 값으로(후보 자동 분류 덮어쓰기)',
  on.every((p) => p.category === '맛집') && off.every((p) => p.category === '맛집'),
  JSON.stringify(on.map((p) => p.category))
);
check(
  '핀: 한줄 메모·플랫폼·좌표가 그대로',
  on[0].memo === '웨이팅 20분' && on[0].platform === 'search' && on[0].lat === CANDIDATES[0].lat && on[0].lng === CANDIDATES[0].lng,
  JSON.stringify([on[0].memo, on[0].platform, on[0].lat, on[0].lng])
);
check('핀: 한줄 메모는 한 줄로 정리', buildResultPins(CANDIDATES, { memo: '아기의자  있음\n주차 불가', now: AT })[0].memo === '아기의자 있음 주차 불가');

const link = buildResultPins(CANDIDATES, {
  category: '맛집',
  sourceUrl: 'https://www.instagram.com/reel/ABC/',
  platform: 'instagram',
  visited: true,
  now: AT,
});
check(
  '핀: 릴스·쇼츠 저장은 원본 링크를 그대로 담는다(가봤어요와 함께)',
  link.every((p) => p.sourceUrl === 'https://www.instagram.com/reel/ABC/' && p.platform === 'instagram' && p.visited === true),
  JSON.stringify(link.map((p) => [p.sourceUrl, p.platform]))
);
const photo = buildResultPins(CANDIDATES, { category: '카페', platform: 'photo', visited: true, now: AT });
check(
  '핀: 사진으로 찾기·가게명 찾기는 원본 링크가 없다(플랫폼만)',
  photo.every((p) => p.sourceUrl === '' && p.platform === 'photo' && p.visited === true),
  JSON.stringify(photo.map((p) => [p.sourceUrl, p.platform]))
);
check(
  '핀: platform 을 안 넘기면 기본 instagram',
  buildResultPins(CANDIDATES, { now: AT })[0].platform === 'instagram'
);
check(
  '핀: 분류를 안 넘기면 후보의 분류를 쓴다',
  buildResultPins(CANDIDATES, { now: AT })[1].category === '베이커리',
  buildResultPins(CANDIDATES, { now: AT })[1].category
);
check(
  '핀: 이름이 없는 후보는 빼고 나머지는 저장',
  buildResultPins([{ id: 'x' }, CANDIDATES[0]], { visited: true, now: AT }).length === 1
);
check(
  '핀: 고른 후보가 없으면 빈 목록(저장할 것 없음)',
  buildResultPins([], { visited: true, now: AT }).length === 0 &&
    buildResultPins(null, { visited: true, now: AT }).length === 0
);
check(
  '핀: visited 에 문자열·undefined 를 주면 체크로 보지 않는다',
  buildResultPins(CANDIDATES, { visited: 'true', now: AT }).every((p) => p.visited === false) &&
    buildResultPins(CANDIDATES, { now: AT }).every((p) => p.visited === false)
);

// ═════════════════════════════════════════════════════════════
// 2. 토글 글 — 시트·상세와 한 곳에서
// ═════════════════════════════════════════════════════════════
check(
  '토글 글: 미체크 `가봤어요` · `다녀왔으면 눌러서 체크해 두세요` · `체크`',
  visitedToggleText(false).label === '가봤어요' &&
    visitedToggleText(false).sub === '다녀왔으면 눌러서 체크해 두세요' &&
    visitedToggleText(false).action === '체크',
  JSON.stringify(visitedToggleText(false))
);
check(
  '토글 글: 체크 `가봤어요 (방문 완료)` · `저장하면 방문 완료로 표시돼요` · `해제`',
  visitedToggleText(true).label === '가봤어요 (방문 완료)' &&
    visitedToggleText(true).sub === '저장하면 방문 완료로 표시돼요' &&
    visitedToggleText(true).action === '해제',
  JSON.stringify(visitedToggleText(true))
);

// ═════════════════════════════════════════════════════════════
// 3. 저장 화면 배선 (소스)
// ═════════════════════════════════════════════════════════════
const paste = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const card = fs.readFileSync(path.join(process.cwd(), 'src/components/VisitedToggleCard.js'), 'utf8');
const app = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');

check(
  '화면: 공용 토글 카드를 import 해 결과 카드에 그린다',
  paste.indexOf("import VisitedToggleCard from '../components/VisitedToggleCard'") > 0 &&
    paste.indexOf('<VisitedToggleCard') > 0 &&
    paste.indexOf('testID="paste-visited-toggle"') > 0 &&
    paste.indexOf('boxTestID="paste-visited-box"') > 0 &&
    paste.indexOf('labelTestID="paste-visited-label"') > 0
);
check(
  '화면: 카드가 `저장할 분류`(CategoryPicker) 바로 위에 있다',
  paste.indexOf('<VisitedToggleCard') > 0 &&
    paste.indexOf('<VisitedToggleCard') < paste.indexOf('<CategoryPicker'),
  JSON.stringify([paste.indexOf('<VisitedToggleCard'), paste.indexOf('<CategoryPicker')])
);
check(
  '화면: 기본은 미체크(false) 상태',
  /const \[visited, setVisited\] = useState\(false\)/.test(paste)
);
check(
  '화면: 새 결과를 찾을 때마다 미체크로 풀린다(링크·검색·사진)',
  (paste.match(/setVisited\(false\)/g) || []).length >= 5,
  String((paste.match(/setVisited\(false\)/g) || []).length)
);
check(
  '화면: 저장 페이로드에 visited 를 넘긴다',
  /buildResultPins\(selectedCandidates, \{[\s\S]{0,220}visited,/.test(paste)
);
check(
  '화면: `buildPin` 직접 호출 대신 공용 저장 페이로드를 쓴다',
  paste.indexOf('buildResultPins') > 0 && paste.indexOf('buildPin({') < 0
);
check(
  '카드: 위아래 14px 여백 · 체크박스 · aria-checked',
  /marginTop: 14/.test(card) && /marginBottom: 14/.test(card) && card.indexOf('aria-checked={on}') > 0 && card.indexOf('visitCheck') < 0 && card.indexOf('checkOn') > 0
);
check(
  '카드: 글은 visitedToggleText 한 곳에서',
  card.indexOf('visitedToggleText(on)') > 0 || card.indexOf('visitedToggleText(visited') > 0
);

// ═════════════════════════════════════════════════════════════
// 4. 이미 저장한 곳에 체크해 저장 — 그 핀만 방문 완료로
// ═════════════════════════════════════════════════════════════
check(
  '저장: 일괄 저장도 중복 판정 뒤 이미 있는 핀은 방문 완료로만 바꾼다',
  app.indexOf('let markedVisited = 0') > 0 &&
    app.indexOf('item.pin.visited === true && existing.visited !== true') > 0 &&
    app.indexOf('handleTogglePinVisited(existing.id, true)') > 0 &&
    app.indexOf('가봤어요로 표시') > 0
);

if (fails) {
  console.log('\nPASTE_VISITED_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nPASTE_VISITED_TESTS_OK');
