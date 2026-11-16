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
 * 지도 우측 하단 컨트롤 정렬값 — 한 곳에서 관리합니다.
 *   · '+ / −' 확대·축소 박스(RealMapView.web.js 의 zoomCol)
 *   · '내 위치(파란 FAB) · 목록 보기 · 주변 500m' 세로 스택(MapScreen.actionCol)
 *   · '반경 500m 주변 목록' 패널(nearbyPanel)
 * 세 컨트롤 모두 `rightInset` 으로 오른쪽 끝선을 맞추고, 아래에서 위로
 *   +/−  →(stackGap)→  FAB  →  주변 500m  →  목록 보기  →(colGap)→  주변 목록 패널
 * 순서로 쌓입니다. +/− 는 지도 아래 끝에서 zoomBottom 만큼 띄워
 * NAVER 로고(아래 4px, 높이 ~12px)와 겹치지 않게 합니다.
 *
 * v2.17 — `지도 공유` 를 이 스택에서 빼고 지도 **왼쪽 하단 펌찄 메뉴**(MapToolsMenu)로 옮겼습니다.
 *   스택이 세 칸(목록 보기 · 주변 500m · FAB)으로 줄어 actionStackHeight 가 실제 높이와
 *   처음으로 정확히 맞습니다(예전엔 지도 공유를 넣으면서도 두 칸 기준 값이 남아 있었음).
 */
export const mapControls = (() => {
  const rightInset = 12; // 세 컨트롤 공통 오른쪽 여백
  const controlSize = 34; // '주변 500m · 목록 보기' 핀 높이 = '+ / −' 버튼 크기
  const fabSize = 46; // 파란 '내 위치' FAB
  const colGap = 8; // 세로 스택 간격
  const zoomBottom = 26; // +/− 박스 아래 끝 — NAVER 로고 위로 12px 이상 띄움
  const zoomBoxHeight = controlSize * 2 + 3; // 위·아래 테두리 1 + 구분선 1
  const stackGap = 9; // +/− 박스와 파란 FAB 사이 간격
  // 목록 보기 + 주변 500m + FAB + 칸 사이 간격 2개
  const actionStackHeight = controlSize * 2 + fabSize + colGap * 2;
  const actionBottom = zoomBottom + zoomBoxHeight + stackGap;
  const panelBottom = actionBottom + actionStackHeight + colGap;
  return {
    rightInset,
    controlSize,
    fabSize,
    colGap,
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
