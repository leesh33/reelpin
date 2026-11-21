/**
 * test/layer-sheet-swipe-test.mjs — v2.36.0 · v2.36.1
 * ─────────────────────────────────────────────────────────────
 * 레이어 팝업(**목록 보기 · 알림 모음 · 내 정보**)을 **헤더 아래로 쓸어내려 닫기**
 *
 * 상훈 님 요청 (2026-11-21)
 *   "목록 보기 알림 내 정보는 레이어팝업 형태로 띄우는 거니까
 *    헤더를 아래로 스와이프 했을 때 아래로 접히는 걸로 하자"
 *   "레이어 팝업 상단에도 핸들바(그립 막대)를 넣어 달라" (v2.36.1)
 *
 *   ① 판정 규칙 — 헤더 6px / 본문 12px · 세로 우선 · 본문은 스크롤 맨 위에서만
 *   ② 닫힘 판정·애니메이션은 장소 상세 시트와 같은 규칙(96px · 빠른 플릭 · 높이 40%)
 *   ③ 공통 훅 배선 — translateY · 스프링 복귀 · 접힘 애니메이션 뒤 onClose
 *   ④ LayerSheet 헤더·본문 제스처 + 웹 touch-action · ✕·바깥 탭은 그대로
 *   ⑤ 세 팝업이 모두 LayerSheet + 본문 스크롤 보고(useSheetBodyScroll)
 *   ⑥ 상단 그립 막대 — 장소 상세 시트와 같은 모양 · 헤더 판 안에서 같이 끌린다
 *   ⑦ 버전 2.36.1 일관성
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  SHEET_BODY_DRAG_AXIS_RATIO,
  SHEET_BODY_DRAG_MIN,
  SHEET_BODY_SCROLL_TOP_TOLERANCE,
  SHEET_DISMISS_DISTANCE,
  SHEET_HEADER_DRAG_MIN,
  shouldDismissSheet,
  shouldStartBodyDrag,
  shouldStartHeaderDrag,
} from '../src/utils/sheetDismiss.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// ═════════════════════════════════════════════════════════════
// 1. 판정 규칙 — 헤더 / 본문
// ═════════════════════════════════════════════════════════════
check('기준값: 헤더 6px · 본문 12px · 세로 1.2배 · 스크롤 허용 1px', SHEET_HEADER_DRAG_MIN === 6 && SHEET_BODY_DRAG_MIN === 12 && SHEET_BODY_DRAG_AXIS_RATIO === 1.2 && SHEET_BODY_SCROLL_TOP_TOLERANCE === 1);
check('헤더: 5px 는 아직 잡지 않음 (✕ 탭 그대로)', shouldStartHeaderDrag({ dy: 5, dx: 1 }) === false);
check('[핵심] 헤더: 7px 넘게 아래로 끌면 시트가 따라온다', shouldStartHeaderDrag({ dy: 7, dx: 1 }) === true);
check('헤더: 가로로 더 많이 움직이면 잡지 않음', shouldStartHeaderDrag({ dy: 30, dx: 60 }) === false);
check('헤더: 위로 끌면(음수) 잡지 않음', shouldStartHeaderDrag({ dy: -40, dx: 0 }) === false);
check('헤더: 값이 없으면 잡지 않음', shouldStartHeaderDrag({}) === false && shouldStartHeaderDrag() === false);

check('[핵심] 본문: 스크롤 맨 위에서 20px 내리면 당겨진다', shouldStartBodyDrag({ dy: 20, dx: 2, scrollY: 0 }) === true);
check('본문: 스크롤이 내려가 있으면(120px) 스크롤에 양보', shouldStartBodyDrag({ dy: 60, dx: 2, scrollY: 120 }) === false);
check('본문: 맨 위 오차 1px 까지는 당긴다', shouldStartBodyDrag({ dy: 20, dx: 1, scrollY: 0.5 }) === true && shouldStartBodyDrag({ dy: 20, dx: 1, scrollY: 4 }) === false);
check('본문: 10px 는 아직 스크롤/탭으로', shouldStartBodyDrag({ dy: 10, dx: 1, scrollY: 0 }) === false);
check('본문: 가로 스와이프(칩 넘기기)는 건드리지 않음', shouldStartBodyDrag({ dy: 30, dx: 40, scrollY: 0 }) === false);
check('본문: 위로 끌면(목록 스크롤) 당기지 않음', shouldStartBodyDrag({ dy: -50, dx: 2, scrollY: 0 }) === false);

// ② 닫힘 판정은 상세 시트와 같은 규칙
check('[핵심] 닫힘: 96px 내리면 닫힘 · 40px + 빠른 플릭도 닫힘', SHEET_DISMISS_DISTANCE === 96 && shouldDismissSheet({ dy: 96 }) === true && shouldDismissSheet({ dy: 40, vy: 0.8 }) === true);
check('닫힘: 살짝(20px) 튕긴 건 제자리', shouldDismissSheet({ dy: 20, vy: 1.2 }) === false);

// ═════════════════════════════════════════════════════════════
// 3. 공통 훅 배선 (소스)
// ═════════════════════════════════════════════════════════════
const hook = read('src/components/useSheetSwipeDismiss.js');

check('훅: 판정 모듈(utils/sheetDismiss)을 그대로 쓴다', hook.indexOf("from '../utils/sheetDismiss'") > 0 && hook.indexOf('shouldDismissSheet(') > 0);
check('훅: Animated.Value translateY 로 따라 내려온다', hook.indexOf('new Animated.Value(0)') > 0 && hook.indexOf('translateY.setValue') > 0);
check('훅: 헤더·본문 PanResponder 두 개', (hook.match(/PanResponder\.create/g) || []).length === 2, String((hook.match(/PanResponder\.create/g) || []).length));
check('훅: 헤더는 shouldStartHeaderDrag 로만 잡는다', hook.indexOf('shouldStartHeaderDrag({ dy: gesture.dy, dx: gesture.dx })') > 0);
check('훅: 본문은 캡처 단계에서 잡아 ScrollView 보다 먼저 (scrollY 조건 포함)', hook.indexOf('onMoveShouldSetPanResponderCapture') > 0 && hook.indexOf('scrollY: scrollYRef.current') > 0);
check('훅: 끄는 동안 손가락을 따라온다(gesture.dy)', /onPanResponderMove: \(event, gesture\) => dragTo\(gesture\.dy\)/.test(hook));
check('훅: 손을 떼면 닫기/제자리 판정', hook.indexOf('releaseDrag(gesture)') > 0 && hook.indexOf('springBack()') > 0);
check('훅: 닫힘은 접히는 애니메이션이 끝난 뒤 onClose', hook.indexOf('Animated.timing') > 0 && hook.indexOf('closeRef.current()') > 0);
check('훅: 다시 열면 제자리로 초기화', hook.indexOf('if (visible) reset()') > 0);
check('훅: 본문 스크롤 위치를 받는 통로(useSheetBodyScroll · onScroll · scrollEventThrottle)', hook.indexOf('export function useSheetBodyScroll') > 0 && hook.indexOf('onScroll: report') > 0 && hook.indexOf('scrollEventThrottle: 16') > 0);

// ═════════════════════════════════════════════════════════════
// 4. LayerSheet — 헤더·본문 제스처 + 기존 닫기 그대로
// ═════════════════════════════════════════════════════════════
const layer = read('src/components/LayerSheet.js');

check('레이어: Animated.View 로 시트를 감싸 translateY 로 내린다', layer.indexOf('<Animated.View') > 0 && layer.indexOf('translateY: dismiss.translateY') > 0);
check('[핵심] 레이어: 헤더 줄(아이콘·제목·✕)에 아래로 끄는 제스처', /testID=\{headerTestID \|\| testID \+ '-header'\}[\s\S]{0,200}\{\.\.\.dismiss\.headerPanHandlers\}/.test(layer));
check('레이어: 본문도 스크롤 맨 위에서 당기면 닫힌다(bodyPanHandlers + 스크롤 보고 통로)', layer.indexOf('{...dismiss.bodyPanHandlers}') > 0 && layer.indexOf('<SheetBodyScrollScope reportScrollY={dismiss.reportBodyScroll}>') > 0);
check('레이어: 시트 높이를 재서 40% · 접힘 거리에 쓴다(onLayout)', layer.indexOf('onLayout={dismiss.onSheetLayout}') > 0);
check('레이어: 웹 아이폰 사파리 touch-action none + cursor grab (헤더에서만)', layer.indexOf("Platform.OS === 'web'") > 0 && layer.indexOf("touchAction: 'none'") > 0 && layer.indexOf("cursor: 'grab'") > 0);
check('레이어: 읽어 주는 안내에 "아래로 쓸어내리면 닫혀요"', layer.indexOf('아래로 쓸어내리면 닫혀요') > 0);
check('레이어: ✕ 닫기 버튼은 그대로 (closeLabel · onClose · closeTestID)', /onPress=\{onClose\}[\s\S]{0,160}closeTestID \|\| testID \+ '-close'/.test(layer));
check('레이어: 바깥 어두운 곳 탭 닫기도 그대로', /styles\.backdrop[\s\S]{0,120}onPress=\{onClose\}/.test(layer));
check('레이어: 기본 켜짐 + 화면별 끄기(swipeToClose)', layer.indexOf('swipeToClose = true') > 0 && layer.indexOf('enabled: swipeToClose') > 0);

// ═════════════════════════════════════════════════════════════
// 5. 세 팝업 — 모두 LayerSheet + 본문 스크롤 보고
// ═════════════════════════════════════════════════════════════
const mapScreen = read('src/screens/MapScreen.js');
const alertInbox = read('src/components/AlertInbox.js');
const menuDrawer = read('src/components/MenuDrawerModal.js');
const pinListView = read('src/components/PinListView.js');
const profileScreen = read('src/screens/ProfileScreen.js');

check('[목록 보기] 지도 화면이 LayerSheet 로 띄운다(pin-list-sheet)', /view === 'list' && \(\s*\n\s*<LayerSheet/.test(mapScreen) && mapScreen.indexOf('testID="pin-list-sheet"') > 0 && mapScreen.indexOf('headerTestID="pin-list-sheet-header"') > 0);
check('[목록 보기] 본문(PinListView) 스크롤이 맨 위일 때 당겨진다', pinListView.indexOf('useSheetBodyScroll()') > 0 && /\{\.\.\.sheetScroll\}[\s\S]{0,120}contentContainerStyle=\{\[styles\.scrollBody/.test(pinListView));
check('[알림] AlertInbox 가 LayerSheet 로 띄운다(alert-inbox)', alertInbox.indexOf('<LayerSheet') > 0 && alertInbox.indexOf('testID="alert-inbox"') > 0 && alertInbox.indexOf('headerTestID="alert-inbox-header"') > 0);
check('[알림] 본문 스크롤이 맨 위일 때 당겨진다', alertInbox.indexOf('useSheetBodyScroll()') > 0 && /<ScrollView[\s\S]{0,160}\{\.\.\.sheetScroll\}/.test(alertInbox));
check('[내 정보] MenuDrawerModal 이 LayerSheet 로 띄운다(menu-drawer)', menuDrawer.indexOf('<LayerSheet') > 0 && menuDrawer.indexOf('testID="menu-drawer"') > 0 && menuDrawer.indexOf('headerTestID="menu-drawer-header"') > 0);
check('[내 정보] 본문(ProfileScreen panel) 스크롤이 맨 위일 때 당겨진다', profileScreen.indexOf('useSheetBodyScroll()') > 0 && /ref=\{scrollRef\}[\s\S]{0,60}\{\.\.\.sheetScroll\}/.test(profileScreen));
check('[내 정보] 서브 페이지 스크롤도 같은 방식', (menuDrawer.match(/\{\.\.\.sheetScroll\}/g) || []).length === 4);
check(
  '세 팝업 모두 같은 틀 하나를 쓴다(각자 시트를 다시 그리지 않음)',
  alertInbox.indexOf("from './LayerSheet'") > 0 &&
    menuDrawer.indexOf("from './LayerSheet'") > 0 &&
    mapScreen.indexOf("from '../components/LayerSheet'") > 0 &&
    /<PinListView\s+\n?\s*embedded/.test(mapScreen)
);

// ═════════════════════════════════════════════════════════════
// 6. 상단 그립 막대 (v2.36.1) — 장소 상세 시트와 같은 모양
// ═════════════════════════════════════════════════════════════
const detailSheet = read('src/components/PinDetailSheet.js');

/** StyleSheet.create 안의 `name: { ... },` 블록을 그대로 떼어 옵니다 */
const styleBlock = (src, name) => {
  const start = src.indexOf('\n  ' + name + ': {');
  if (start < 0) return '';
  const end = src.indexOf('\n  },', start);
  return src.slice(start, end < 0 ? src.length : end);
};
/** 주석 줄을 빼고 `키: 값` 만 "키:값|키:값" 으로 정리 — 두 파일의 스타일 값을 그대로 비교합니다 */
const stylePairs = (block) =>
  block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && line.indexOf(':') > 0)
    .map((line) => line.replace(/,$/, '').replace(/\s+/g, ' '))
    .filter((line) => line !== 'handle: {')
    .join(' | ');
const layerHandle = styleBlock(layer, 'handle');
const detailHandle = styleBlock(detailSheet, 'handle');
const layerHead = styleBlock(layer, 'sheetHead');
const layerHeadRow = styleBlock(layer, 'headRow');

check('막대: 레이어 팝업에도 handle 스타일이 있다', layerHandle.length > 0);
check('[핵심] 막대: 상세 시트와 같은 값 — 42×4 · 둥글기 2 · 반투명 흰색 · 아래 여백 12',
  /width:\s*42/.test(layerHandle) && /height:\s*4\b/.test(layerHandle) && /borderRadius:\s*2\b/.test(layerHandle) &&
    /rgba\(255,255,255,0\.45\)/.test(layerHandle) && /marginBottom:\s*12/.test(layerHandle),
  layerHandle.replace(/\s+/g, ' '));
check('막대: 색·여백이 상세 시트 handle 과 완전히 같다(두 시트가 같은 손맛으로 보임)',
  stylePairs(layerHandle) === stylePairs(detailHandle), stylePairs(layerHandle) + '  vs  ' + stylePairs(detailHandle));
check('막대: 가운데 정렬(alignSelf center)', /alignSelf:\s*'center'/.test(layerHandle));
check('[핵심] 막대: 헤더 줄(아이콘·제목·✕) **바로 위**에 그려진다',
  layer.indexOf('<View style={styles.handle}') > 0 &&
    layer.indexOf('<View style={styles.handle}') < layer.indexOf('<View style={styles.headRow}>'));
check('막대: 검사·딥링크용 testID(<testID>-handle)가 있다', layer.indexOf("testID={testID + '-handle'}") > 0);
check('[핵심] 막대: 헤더 판(headerPanHandlers) 안이라 막대를 잡고 끌어도 그대로 닫힌다',
  layer.indexOf('style={styles.handle}') > layer.indexOf('{...dismiss.headerPanHandlers}') &&
    layer.indexOf('style={styles.handle}') < layer.indexOf('{...dismiss.bodyPanHandlers}'));
check('막대: 웹 touch-action none · cursor grab 이 막대까지 덮는다(sheetHead 에 있음)',
  /touchAction:\s*'none'/.test(layerHead) && /cursor:\s*'grab'/.test(layerHead));
check('헤더 줄: 아이콘·제목·✕ 는 예전 그대로 한 줄(flexDirection row · gap 9)',
  /flexDirection:\s*'row'/.test(layerHeadRow) && /gap:\s*9\b/.test(layerHeadRow));
check('헤더 판: 다크 차콜 배경이 막대까지 이어진다', /backgroundColor:\s*colors\.charcoal/.test(layerHead));
check('헤더 판: 막대가 들어간 만큼 위 여백을 줄여 헤더가 툭 튀지 않는다(paddingTop 8)', /paddingTop:\s*8\b/.test(layerHead));

// ═════════════════════════════════════════════════════════════
// 7. 버전 2.36.1 일관성
// ═════════════════════════════════════════════════════════════
const pkg = JSON.parse(read('package.json'));
const expo = JSON.parse(read('app.json')).expo;
const feedback = read('src/services/feedback.js');
check('버전: package.json · app.json = 2.36.1', pkg.version === '2.36.1' && expo.version === '2.36.1', pkg.version + '/' + expo.version);
check('버전: 메뉴 · 앱 정보 · 제보 첨부값도 2.36.1', menuDrawer.indexOf("APP_VERSION_LABEL = '릴스핀 v2.36.1'") > 0 && profileScreen.indexOf("APP_INFO_VERSION = '릴스핀 v2.36.1'") > 0 && feedback.indexOf("APP_VERSION_NAME = '2.36.1'") > 0);

if (fails) {
  console.log('\nLAYER_SHEET_SWIPE_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nLAYER_SHEET_SWIPE_TESTS_OK');
