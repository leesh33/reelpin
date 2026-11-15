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
