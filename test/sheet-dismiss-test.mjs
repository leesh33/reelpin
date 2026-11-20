/**
 * test/sheet-dismiss-test.mjs — v2.34.0
 * ─────────────────────────────────────────────────────────────
 * 장소 상세 바텀시트 **헤더 부근을 아래로 쓸어내려 닫기** (상훈 님 요청 IMG_9274)
 *
 *   ① 판정 규칙 — 96px 이상 내리면 닫힘 · 24px 이상 + 빠른 플릭도 닫힘 · 모자라면 제자리
 *   ② 끄는 동안 따라 내려가는 거리(위로는 안 올라감) · 닫힘 애니메이션 시간
 *   ③ 상세 시트 배선 — 헤더/본문(맨 위) 팬 제스처 · translateY · 웹 touch-action
 *   ④ X 버튼·본문 스크롤을 방해하지 않는 조건 (움직임 6~12px 전에는 잡지 않음 · 맨 위에서만)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  SHEET_DISMISS_DISTANCE,
  SHEET_DISMISS_HEIGHT_RATIO,
  SHEET_DISMISS_VELOCITY,
  SHEET_FLICK_MIN_DISTANCE,
  SHEET_SPRING_BACK,
  clampedDragOffset,
  shouldDismissSheet,
  sheetCloseDuration,
} from '../src/utils/sheetDismiss.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

// ═════════════════════════════════════════════════════════════
// 1. 판정 규칙
// ═════════════════════════════════════════════════════════════
check('기준값: 96px · 0.5px/ms · 플릭 최소 24px · 높이 40%', SHEET_DISMISS_DISTANCE === 96 && SHEET_DISMISS_VELOCITY === 0.5 && SHEET_FLICK_MIN_DISTANCE === 24 && SHEET_DISMISS_HEIGHT_RATIO === 0.4);
check('[핵심] 96px 내리면 닫힘', shouldDismissSheet({ dy: 96 }) === true);
check('95px 는 손을 천천히 떼면 제자리', shouldDismissSheet({ dy: 95, vy: 0.1 }) === false);
check('[핵심] 조금(40px)만 내려도 빠르게 튕기면 닫힘', shouldDismissSheet({ dy: 40, vy: 0.8 }) === true);
check('살짝(20px) 튕긴 건 닫지 않음 (실수 방지)', shouldDismissSheet({ dy: 20, vy: 1.2 }) === false);
check('아주 큰 시트는 높이 40%까지 끌어내리면 닫힘', shouldDismissSheet({ dy: 340, vy: 0, height: 800, distance: 400 }) === true);
check('높이 40% 미만 + 느리면 제자리', shouldDismissSheet({ dy: 300, vy: 0, height: 800, distance: 400 }) === false);
check('위로 끌면(음수) 닫지 않음', shouldDismissSheet({ dy: -60, vy: 2 }) === false);
check('값이 없거나 이상하면 닫지 않음', shouldDismissSheet({}) === false && shouldDismissSheet({ dy: NaN }) === false && shouldDismissSheet() === false);
check('X 버튼처럼 움직임이 없으면(0) 닫지 않음', shouldDismissSheet({ dy: 0, vy: 0 }) === false);

// ═════════════════════════════════════════════════════════════
// 2. 끄는 거리 · 애니메이션
// ═════════════════════════════════════════════════════════════
check('따라 내려가는 거리: 아래로 끈 만큼', clampedDragOffset(42) === 42);
check('위로는 올라가지 않는다', clampedDragOffset(-30) === 0 && clampedDragOffset(NaN) === 0);
const fast = sheetCloseDuration(300, 500);
const slow = sheetCloseDuration(20, 500);
check('닫힘 시간: 120~320ms 안', fast >= 120 && fast <= 320 && slow >= 120 && slow <= 320, fast + '/' + slow);
check('닫힘 시간: 이미 많이 내렸으면 더 짧다', fast <= slow, fast + ' vs ' + slow);
check('제자리 스프링: toValue 0', SHEET_SPRING_BACK.toValue === 0 && SHEET_SPRING_BACK.damping > 0);

// ═════════════════════════════════════════════════════════════
// 3. 상세 시트 배선 (소스)
// ═════════════════════════════════════════════════════════════
const sheet = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');

check('시트: 판정 모듈을 쓴다', sheet.indexOf("from '../utils/sheetDismiss'") > 0 && sheet.indexOf('shouldDismissSheet(') > 0);
check('시트: Animated.Value translateY 로 따라 내려온다', sheet.indexOf('new Animated.Value(0)') > 0 && sheet.indexOf('transform: [{ translateY }]') > 0);
check('시트: PanResponder 두 개(헤더 · 본문 맨 위)', (sheet.match(/PanResponder\.create/g) || []).length === 2, String((sheet.match(/PanResponder\.create/g) || []).length));
check('[핵심] 헤더(pin-sheet-header)에 아래로 끄는 제스처가 붙어 있다', /testID="pin-sheet-header"[\s\S]{0,200}\{\.\.\.sheetPan\.panHandlers\}/.test(sheet));
check('시트: 본문도 스크롤 맨 위에서 당기면 닫힌다(bodyPan + scrollYRef)', sheet.indexOf('scrollYRef.current <= 0') > 0 && sheet.indexOf('{...bodyPan.panHandlers}') > 0);
check('시트: 끄는 동안 손가락을 따라온다(gesture.dy)', /onPanResponderMove: \(event, gesture\) => dragTo\(gesture\.dy\)/.test(sheet));
check('시트: 손을 떼면 닫기/제자리 판정', sheet.indexOf('releaseDrag(gesture)') > 0 && sheet.indexOf('springBack()') > 0);
check('시트: 닫힘은 아래로 내린 뒤 onClose', sheet.indexOf('closeWithAnimation') > 0 && sheet.indexOf('closeRef.current()') > 0);
check('시트: 움직임 6px 전에는 잡지 않아 ✕ 탭이 그대로', sheet.indexOf('gesture.dy > 6') > 0);
check('시트: 본문은 12px 이상 세로로 끌 때만(가로 스크롤·탭 방해 없음)', sheet.indexOf('gesture.dy > 12') > 0 && sheet.indexOf('Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2') > 0);
check('시트: 웹 아이폰 사파리 touch-action none (헤더에서 브라우저 스크롤이 먼저 가로채지 않게)', sheet.indexOf("Platform.OS === 'web'") > 0 && sheet.indexOf("touchAction: 'none'") > 0);
check('시트: 다른 핀으로 바뀌면 위치·스크롤 초기화', sheet.indexOf('translateY.setValue(0)') > 0);
check('시트: 스크롤 위치를 기록(onScroll · scrollEventThrottle)', sheet.indexOf('onScroll=') > 0 && sheet.indexOf('scrollEventThrottle={16}') > 0);

if (fails) {
  console.log('\nSHEET_DISMISS_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nSHEET_DISMISS_TESTS_OK');
