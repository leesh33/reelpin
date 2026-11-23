/**
 * test/bottom-safe-test.mjs — 📱 빌드 20: 하단 안전 영역(홈 인디케이터) · 지도 풀블리드 · 확대/축소 버튼
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 지적(빌드 19 · 아이폰 · IMG_9332):
 *   ① "맨 아래에 흰 띠가 남아 있다"  → 앱 루트가 아래 안전 영역(34px)을 잘라 내고 그렸습니다.
 *   ② "자세히보니 지도 축소버튼도 짤려있어" → `−` 버튼에 아래 모서리 라운드가 없어 잘린 것처럼 보였습니다.
 *
 * 지켜야 하는 것
 *   A. 앱 루트는 **화면 끝까지** 그린다 — 메인 화면은 SafeAreaView 가 아니라 View,
 *      노치(위)만 `insets.top` 만큼 비운다.
 *   B. 바닥에 붙는 UI 는 `useBottomLift()`(= insets.bottom) 만큼 **스스로** 올라간다
 *      → 탭바 · 지도 `내 위치`/`+ −`/도구 버튼 · 반경 패널 · 토스트 · 목록/시트 끝 여백.
 *   C. 값이 0 이면(안전 영역 없는 기기·웹) 예전 스타일 그대로 — 조건부로만 덧붙입니다.
 *   D. 확대/축소는 **하나의 둥근 박스**(overflow hidden) 안의 두 버튼 + 1px 구분선 —
 *      위·아래 모서리가 모두 둥글어 `−` 가 잘려 보이지 않습니다.
 *   E. 빌드 번호는 20 (`app.json`) · 버전은 2.40.0 그대로.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

const app = readJson('app.json');
const appJson = app.expo;
const appSource = read('App.js');
const tabBarSource = read('src/components/TabBar.js');
const mapSource = read('src/screens/MapScreen.js');
const nativeMap = read('src/components/RealMapView.js');
const webMap = read('src/components/RealMapView.web.js');
const safeAreaSource = read('src/utils/safeArea.js');
const layerSheet = read('src/components/LayerSheet.js');
const pinList = read('src/components/PinListView.js');
const pinSheet = read('src/components/PinDetailSheet.js');
const pasteSource = read('src/screens/PasteScreen.js');
const collectionsSource = read('src/screens/CollectionsScreen.js');
const profileSource = read('src/screens/ProfileScreen.js');

// ── 1. 빌드 번호 ─────────────────────────────────────────────
check('빌드 21: app.json ios.buildNumber = 21', String(appJson.ios.buildNumber) === '21', appJson.ios.buildNumber);
check('빌드 21: 버전은 2.40.0 그대로', appJson.version === '2.40.0', appJson.version);

// ── 2. 루트: 화면 끝까지 (A) ──────────────────────────────────
check(
  'A 루트: 메인 화면은 SafeAreaView 가 아니라 View 로 화면 끝까지 그린다',
  /return \(\s*<View style=\{styles\.safe\}>/.test(appSource)
);
check(
  'A 루트: 아래를 잘라 내는 SafeAreaView 는 메인 화면에서 사라졌다',
  appSource.indexOf('<SafeAreaView style={styles.safe}>\n      <ExpoStatusBar style="light" backgroundColor={colors.navy} />') < 0
);
check(
  'A 루트: 노치(위)만 insets.top(안드로이드는 상태바 높이) 만큼 비운다',
  appSource.indexOf('const topPad = Math.max(insets.top || 0, TOP_INSET);') > 0 &&
    /styles\.container, \{ paddingTop: topPad \}/.test(appSource) &&
    /styles\.statusBarFill, \{ height: topPad \}/.test(appSource)
);
check('A 루트: 아래 안전 영역 값(bottomLift)을 한 곳에서 만든다', appSource.indexOf('const bottomLift = useBottomLift();') > 0);

// ── 3. 바닥 UI 가 스스로 올라간다 (B·C) ────────────────────────
check(
  'B 탭바: bottom = tabBar.bottom + bottomLift',
  tabBarSource.indexOf('bottom: tabBar.bottom + bottomLift') > 0 && tabBarSource.indexOf('bottomLift = 0') > 0
);
check(
  'B 지도: 내 위치 FAB · 반경 패널이 bottomLift 만큼 올라간다',
  mapSource.indexOf('bottom: mapControls.actionBottom + bottomLift') > 0 &&
    mapSource.indexOf('bottom: mapControls.panelBottom + bottomLift') > 0
);
check(
  'B 지도: 도구 메뉴·지도(+ / −)·목록에 같은 값이 전달된다',
  mapSource.indexOf('bottomLift={bottomLift}') > 0 &&
    (mapSource.match(/bottomLift=\{bottomLift\}/g) || []).length >= 3
);
check(
  'B 지도(+ / −): 네이티브 확대/축소도 bottomLift 만큼 올라간다',
  nativeMap.indexOf('bottom: mapControls.zoomBottom + bottomLift') > 0 && nativeMap.indexOf('bottomLift = 0') > 0
);
check(
  'B 지도(+ / −): 웹 확대/축소도 같은 값(기본 0)만큼 올라간다',
  webMap.indexOf('bottom: mapControls.zoomBottom + bottomLift') > 0 && webMap.indexOf('bottomLift = 0') > 0
);
check(
  'B 시트 발끝: [담기]·[저장] 버튼이 홈 인디케이터 위로',
  layerSheet.indexOf('paddingBottom: bottomLift') > 0 && layerSheet.indexOf('useBottomLift') > 0
);
check(
  'B 목록·저장·컬렉션·내 정보·핀 시트: 스크롤 끝 여백에 bottomLift',
  pinList.indexOf('bottomLift ? { paddingBottom:') > 0 &&
    pinSheet.indexOf('paddingBottom: 24 + bottomLift') > 0 &&
    pasteSource.indexOf('paddingBottom: 36 + tabBar.floatTop + bottomLift') > 0 &&
    collectionsSource.indexOf('paddingBottom: tabBar.floatTop + 28 + bottomLift') > 0 &&
    profileSource.indexOf('paddingBottom: 32 + tabBar.floatTop + bottomLift') > 0
);
check(
  'C 값이 0 이면 아무것도 덧붙이지 않는다 (조건부 스타일)',
  safeAreaSource.indexOf('return bottom > 0 ? bottom : 0;') > 0 &&
    tabBarSource.indexOf('bottomLift = 0') > 0 &&
    /bottomLift \? \{/.test(pinList)
);

// ── 4. 확대/축소 = 하나의 둥근 박스 (D) ────────────────────────
check(
  'D 지도(+ / −): 위·아래 두 버튼을 하나의 둥근 박스로 감싼다',
  nativeMap.indexOf('<View style={styles.zoomBox}>') > 0 &&
    /zoomBox: \{[\s\S]{0,400}?borderRadius: 10[\s\S]{0,300}?overflow: 'hidden'/.test(nativeMap)
);
check(
  'D 지도(+ / −): 예전의 위쪽 전용 라운드(아래가 각지던 원인)는 사라졌다',
  nativeMap.indexOf('borderTopLeftRadius') < 0 && nativeMap.indexOf('borderTopRightRadius') < 0
);
check(
  'D 지도(+ / −): 두 버튼 사이 1px 구분선 · 버튼 높이는 theme 값(34)',
  nativeMap.indexOf('zoomDivider') > 0 && /zoomBtn: \{[\s\S]{0,120}?height: mapControls\.controlSize/.test(nativeMap)
);

if (fails) {
  console.log('\nBOTTOM_SAFE_FAILED=' + fails);
  process.exit(1);
}
console.log('\nBOTTOM_SAFE_OK');
