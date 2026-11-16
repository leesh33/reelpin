// 릴스핀 디자인 토큰 — 화이트 클린 베이스 + 코랄 포인트 + 딥 네이비 지도
export const colors = {
  // base
  bg: '#F7F7F9',
  card: '#FFFFFF',
  line: '#EDEDF2',
  lineSoft: '#F2F2F6',

  // point
  coral: '#FF5A36',
  coralDark: '#E8461F',
  coralSoft: '#FFEDE8',
  coralSoft2: '#FFE2DA',

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
  visit: '#0FA968',
  visitDark: '#0A7D4E',
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
 *
 * 상훈 님 요청: "하단 바 형태를 첨부한 이미지처럼 플로팅 디자인으로 바꿀 수 있니?"
 *   · 화면 바닥에 붙은 직사각형 탭바 대신 **바닥에서 살짝 떠 있는 둥근 알약**
 *   · 그 알약이 지도 위 왼쪽 하단 도구(🎛)·개수 알약, 오른쪽 하단
 *     `내 위치`·`+ / -`·`NAVER` 로고를 **덮지 않도록** 아래 값만큼 위로 올립니다.
 *
 *   floatTop  = height + bottom ...... 탭바가 화면 아래에서 차지하는 높이 (70)
 *   controlsBottom = floatTop + gap ... 지도 버튼들이 서는 바닥 높이 (80)
 */
export const tabBar = (() => {
  const height = 58;
  const bottom = 12; // 화면 바닥에서 뜬 간격
  const side = 16; // 좌우 여백
  const gap = 10; // 탭바 위 다른 버튼·카드와의 최소 간격
  return {
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
 *   · '+ / −' 확대·축소 박스(RealMapView.web.js 의 zoomCol)
 *   · '내 위치(파란 FAB) · 목록 보기' 세로 스택(MapScreen.actionCol)
 *   · '반경 500m 주변 목록' 패널(nearbyPanel)
 * 세 컨트롤 모두 `rightInset` 으로 오른쪽 끝선을 맞추고, 아래에서 위로
 *   +/−  →(stackGap)→  FAB  →  목록 보기  →(colGap)→  주변 목록 패널
 * 순서로 쌓입니다. +/− 는 지도 아래 끝에서 zoomBottom 만큼 띄워
 * NAVER 로고(아래 4px, 높이 ~12px)와 겹치지 않게 합니다.
 *
 * v2.17 — `지도 공유` 를 이 스택에서 빼고 지도 **왼쪽 하단 펌찄 메뉴**(MapToolsMenu)로 옮겼습니다.
 * v2.17.1 — `주변 500m` 도 같은 왼쪽 하단 메뉴로 옮겨, 오른쪽 스택은
 *   **`목록 보기` + `내 위치 FAB`** 두 칸만 남았습니다 (actionStackHeight = 두 칸 + 간격 1개).
 * v2.18 — `목록 보기` 는 지도 상단 분류 칩 줄의 **맨 앞 아이콘 버튼**으로 올라가 오른쪽 스택은
 *   **`내 위치 FAB` 한 칸**만 남았습니다. 그리고 플로팅 탭바가 지도 아래 끝을 덮으므로,
 *   모든 지도 컨트롤을 `tabBar.floatTop` 만큼 **통째로 위로** 올립니다.
 */
export const mapControls = (() => {
  const rightInset = 12; // 세 컨트롤 공통 오른쪽 여백
  const controlSize = 34; // '+ / −' 버튼 크기
  const fabSize = 46; // 파란 '내 위치' FAB
  const colGap = 8; // 세로 스택 간격
  // v2.18 — 플로팅 탭바(70) + 로고를 덮지 않기 위한 6px
  const floatLift = tabBar.floatTop;
  const zoomBottom = 26 + floatLift; // +/− 박스 아래 끝 — 탭바·NAVER 로고 위로 띄움
  const zoomBoxHeight = controlSize * 2 + 3; // 위·아래 테두리 1 + 구분선 1
  const stackGap = 9; // +/− 박스와 파란 FAB 사이 간격
  // v2.18 — 내 위치 FAB 한 칸
  const actionStackHeight = fabSize;
  const actionBottom = zoomBottom + zoomBoxHeight + stackGap;
  const panelBottom = actionBottom + actionStackHeight + colGap;
  return {
    rightInset,
    controlSize,
    fabSize,
    colGap,
    floatLift,
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
  h1: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  h2: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  h3: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 14, fontWeight: '500', color: colors.text },
  sub: { fontSize: 13, fontWeight: '500', color: colors.textSub },
  tiny: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
};
