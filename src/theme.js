// 릴스핀 디자인 토큰 — 화이트 클린 베이스 + 딥 틸 포인트 + 딥 네이비 지도
//
// v2.27.0 — 브랜드 색을 코랄(#FF5A36) → **딥 틸(#0D9488)** 로 바꿨습니다.
//   상훈 님: "우리 아이덴티티 색상을 아예 바꿔보는건 어떨까?" · "캐치테이블이랑 색상이 좀 유사해보이네"
//   → 맛집 앱이 주황(캐치테이블 #FF3D00)에 몰려 있어, 홈화면에서도 갈라지는 딥 틸로 통일했습니다.
//
//   brand      = #0D9488 ... 주 버튼·선택 탭·배지·로고 포인트
//   brandDark  = #0F766E ... 눌림·연한 배경 위 진한 글씨 (흰 배경 대비 5.5:1)
//   brandSoft  = #E6F7F5 ... 연한 배경 틴트
//   brandSoft2 = #CCFBF1 ... 테두리 틴트
//
//   `coral*` 은 v2.27.0 이전 이름의 **호환 별칭**입니다 — 값은 모두 위 브랜드 색과 같습니다.
//   (예전 컴포넌트·문서·테스트가 colors.coral 을 그대로 불러도 같은 딥 틸이 나옵니다)
const BRAND = '#0D9488';
const BRAND_DARK = '#0F766E';
const BRAND_SOFT = '#E6F7F5';
const BRAND_SOFT2 = '#CCFBF1';

export const colors = {
  // base
  bg: '#F7F7F9',
  card: '#FFFFFF',
  line: '#EDEDF2',
  lineSoft: '#F2F2F6',

  // point — v2.27.0 딥 틸
  brand: BRAND,
  brandDark: BRAND_DARK,
  brandSoft: BRAND_SOFT,
  brandSoft2: BRAND_SOFT2,

  // 예전 이름(호환)
  coral: BRAND,
  coralDark: BRAND_DARK,
  coralSoft: BRAND_SOFT,
  coralSoft2: BRAND_SOFT2,

  // map (딥 네이비)
  navy: '#0F172A',
  navyCard: '#141F35',
  navyLine: '#1F2B44',
  navyRoad: '#243356',
  river: '#193656',
  park: '#17352E',
  mapText: '#5A6B87',
  mint: '#4ECDB4',

  // v2.10 — ✅ '가봤어요' 방문 완료 표시 (초록 계열 · 분류 색과 겹치지 않게 따로 둡니다)
  // v2.27.0 — 맛집 핀이 딥 틸이 되면서 예전 초록(#0FA968)은 지도에서 거의 같은 색이 됐습니다
  //   (RGB 거리 38 → 64). 색상환을 초록 쪽(142°)으로 옮겨 한눈에 갈라지게 했습니다.
  visit: '#16A34A',
  visitDark: '#15803D',
  visitSoft: '#E4F7EF',
  visitLine: '#B7E8D2',

  // 인앱 모달 헤더 (네이버 플레이스의 흰 화면과 확실히 갈라지는 다크 차콜)
  charcoal: '#1C1C1E',
  charcoalLine: '#33333A',
  charcoalSub: '#A1A1AA',
  charcoalPill: 'rgba(255,255,255,0.14)',

  // text
  text: '#111827',
  textSub: '#6B7280',
  textMuted: '#9AA1AE',
  white: '#FFFFFF',

  // brand deep links
  naver: '#03C75A',
  naverText: '#FFFFFF',
  kakao: '#FEE500',
  kakaoText: '#3C1E1E',
  google: '#4285F4',
  googleText: '#FFFFFF',
  mutedBadge: '#E7E7EE',
  mutedBadgeText: '#5B6170',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

/*
 * v2.18 — 플로팅 하단 탭바 (TabBar.js)
 * v2.19 — 한글 라벨을 지운 **컴팩트 아이콘 전용** 하단바 (지도 · ＋ · 컬렉션)
 *
 * 상훈 님 요청:
 *   "하단바는 지도, 저장, 컬렉션 으로 구성"
 *   "하단바는 한글명을 지우고 아이콘만 노출하되, 좌우 폭을 좀 줄임 (지금의 절반정도로)"
 *
 *   · 화면 바닥에 붙은 직사각형 탭바 대신 **바닥에서 살짝 떠 있는 둥근 알약**
 *   · 폭은 예전 358px 의 **절반 남짓(190px)** — 양옆이 비어 지도 컨트롤과 훨씬 여유롭게 갈라집니다
 *   · 그 알약이 지도 위 왼쪽 하단 도구(🎛)·개수 알약, 오른쪽 하단
 *     `내 위치`·`+ / -`·`NAVER` 로고를 **덮지 않도록** 아래 값만큼 위로 올립니다.
 *
 *   width     = 190 ................ 탭바 알약의 고정 폭 (가운데 정렬)
 *   height    = 54 ................. 탭바 높이
 *   floatTop  = height + bottom .... 탭바가 화면 아래에서 차지하는 높이 (66)
 *   controlsBottom = floatTop + gap  지도 버튼들이 서는 바닥 높이 (76)
 */
export const tabBar = (() => {
  const width = 190;
  const height = 54;
  const bottom = 12; // 화면 바닥에서 뜬 간격
  const side = 16; // 좁은 화면에서 알약이 화면 끝에 붙지 않게 하는 최소 여백
  const gap = 10; // 탭바 위 다른 버튼·카드와의 최소 간격
  return {
    width,
    height,
    bottom,
    side,
    gap,
    floatTop: height + bottom,
    controlsBottom: height + bottom + gap,
  };
})();

/*
 * 지도 우측 하단 컨트롤 정렬값 — 한 곳에서 관리합니다.
 *   · '내 위치' 파란 FAB (MapScreen.actionCol)
 *   · '+ / −' 확대·축소 박스(RealMapView.web.js 의 zoomCol)
 *   · '반경 500m 주변 목록' 패널(nearbyPanel)
 * 세 컨트롤 모두 `rightInset` 으로 오른쪽 끝선을 맞추고, **아래에서 위로**
 *   FAB(내 위치)  →(stackGap)→  +/−  →(colGap)→  주변 목록 패널
 * 순서로 쌓입니다. 스택의 바닥은 지도 아래 끝에서 stackBottom 만큼 띄워
 * NAVER 로고(아래 4px, 높이 ~12px)와 겹치지 않게 합니다.
 *
 * v2.17 — `지도 공유` 를 이 스택에서 빼고 지도 **왼쪽 하단 펌찄 메뉴**(MapToolsMenu)로 옮겼습니다.
 * v2.17.1 — `주변 500m` 도 같은 왼쪽 하단 메뉴로 옮겨, 오른쪽 스택은
 *   **`목록 보기` + `내 위치 FAB`** 두 칸만 남았습니다 (actionStackHeight = 두 칸 + 간격 1개).
 * v2.18 — `목록 보기` 는 지도 상단 분류 칩 줄의 **맨 앞 아이콘 버튼**으로 올라가 오른쪽 스택은
 *   **`내 위치 FAB` 한 칸**만 남았습니다. 그리고 플로팅 탭바가 지도 아래 끝을 덮으므로,
 *   모든 지도 컨트롤을 `tabBar.floatTop` 만큼 **통째로 위로** 올립니다.
 * v2.19.2 — 상훈 님 요청 "확대축소 버튼과 내위치 버튼 위치를 바꾸자":
 *   예전(위=FAB · 아래=+/−) → 지금(**위=+/− · 아래=내 위치 FAB**).
 *   스택의 바닥값은 `stackBottom`(탭바·NAVER 로고 위 26px)이고, 그 위로 FAB → +/− 순서입니다.
 * v2.19.3 — 상훈 님 요청 "내위치랑 가본곳만보기(왼쪽 동그라미 버튼) 하단 정렬 좀 맞춰줘":
 *   왼쪽 `🎛️` 토글(MapToolsMenu)도 **같은 `actionBottom` 과 같은 `fabSize`** 를 씁니다.
 *   그래서 왼쪽·오른쪽 원형 버튼의 top/bottom 이 390×844 에서 정확히 한 줄(차이 0px)에 놓입니다.
 */
export const mapControls = (() => {
  const rightInset = 12; // 세 컨트롤 공통 오른쪽 여백
  const controlSize = 34; // '+ / −' 버튼 크기
  const fabSize = 46; // 파란 '내 위치' FAB
  const colGap = 8; // 세로 스택 간격
  // v2.18 — 플로팅 탭바(70) + 로고를 덮지 않기 위한 26px
  const floatLift = tabBar.floatTop;
  const stackGap = 9; // 파란 FAB 와 +/− 박스 사이 간격
  const zoomBoxHeight = controlSize * 2 + 3; // 위·아래 테두리 1 + 구분선 1
  // v2.19.2 — 오른쪽 스택 순서 (아래 → 위): 내 위치 FAB → +/− → 주변 목록 패널
  const stackBottom = 26 + floatLift; // 스택 맨 아래(내 위치 FAB)의 아래 끝 — 탭바·NAVER 로고 위로 띄움
  const actionBottom = stackBottom; // 내 위치 FAB
  const actionStackHeight = fabSize;
  const zoomBottom = actionBottom + fabSize + stackGap; // +/− 박스 아래 끝 — FAB 위
  const panelBottom = zoomBottom + zoomBoxHeight + colGap;
  return {
    rightInset,
    controlSize,
    fabSize,
    // v2.19.3 — 왼쪽 하단 `🎛️` 토글도 이 두 값을 그대로 씁니다(leftInset 은 MapToolsMenu 의 left: 12)
    toolsToggleSize: fabSize,
    toolsToggleBottom: actionBottom,
    colGap,
    floatLift,
    stackBottom,
    zoomBottom,
    zoomBoxHeight,
    stackGap,
    actionStackHeight,
    actionBottom,
    panelBottom,
  };
})();

export const cardShadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

export const sheetShadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.18,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: -6 },
  elevation: 12,
};

export const typography = {
  /*
   * v2.40.0 — 🔤 글꼴은 **굵기로** 고릅니다 (Gmarket Sans)
   *   웹     : index.html 의 @font-face 가 `font-weight`(400~900)별 파일을 골라 줍니다.
   *   네이티브: RN 은 굵기로 파일을 못 고르므로 `components/AppText` 가 아래 `fontWeight` 를
   *            읽어 500·600 → `GmarketSansMedium`, 700 이상 → `GmarketSansBold` 를 붙입니다.
   *   그래서 토큰에는 fontFamily 를 넣지 않습니다 — 한 곳(`utils/fonts.js`)에서만 정합니다.
   */
  h1: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  h2: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  h3: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 14, fontWeight: '500', color: colors.text },
  sub: { fontSize: 13, fontWeight: '500', color: colors.textSub },
  tiny: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
};

// v2.40.0 — 네이티브 글꼴 이름·규칙 (테스트·화면이 같은 값을 쓰도록 theme 에서도 꺼냅니다)
export { FONT_BOLD, FONT_FAMILY_WEB, FONT_MEDIUM, fontFamilyForWeight } from './utils/fonts';
