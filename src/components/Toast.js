import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/**
 * 화면에 잠깐 떠오르는 알림 (Alert 대신 — 웹에서도 동일하게 보임)
 *
 * placement
 *   · 'bottom' — 기본. 화면 아래, 플로팅 탭바 바로 위 (bottomOffset)
 *   · 'top'    — 지도 위 레이어가 없는 화면에서 상단 안내 (topOffset)
 *
 * v2.20.2 — 상훈 님 요청: "지도에 핀을 꽂았어요 떴다 사라지는 건 위치를 조금만 더 내려줘
 *   (장소상세 헤더랑 색상이 겹쳐보이네)"
 *   예전에는 핀 상세 시트가 열려 있으면 무조건 `top: 152` 에 떠서, 화면 높이 86% 인 시트의
 *   **분류 색 헤더(약 118~188px)** 한가운데를 덮었습니다. 이제 시트가 열린 동안에는
 *   `toastTopBelowSheetHeader(화면 높이)` 로 **시트 헤더 바로 아래(본문 위쪽)** 에 띄워
 *   헤더 색과 절대 겹치지 않습니다(390×844 실측 → top 200px, 헤더 끝 188.2px + 여백 11.8px).
 */
export default function Toast({
  message,
  tone = 'dark',
  bottomOffset = 96,
  placement = 'bottom',
  topOffset,
}) {
  if (!message) return null;
  const isPro = tone === 'pro';
  const isTop = placement === 'top';
  const top = Number(topOffset) > 0 ? Number(topOffset) : TOAST_TOP;
  return (
    <View
      style={[styles.wrap, isTop ? { top } : { bottom: bottomOffset }]}
      pointerEvents="none"
      testID="toast"
    >
      <View style={[styles.pill, isPro && styles.pillPro]}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

/** 레이어가 없을 때의 기본 상단 위치 */
export const TOAST_TOP = 152;
/** 핀 상세 시트가 차지할 수 있는 최대 높이 (PinDetailSheet `maxHeight: '86%'`) */
export const SHEET_MAX_HEIGHT_RATIO = 0.86;
/**
 * 시트 헤더 높이 — 390×844 라이브 실측: 시트 상단 118.2px · 헤더 바닥 188.2px → 70px
 * (패딩 10 + 핸들 4+12 + 이름 한 줄 ~30 + 아래 패딩 14)
 */
export const SHEET_HEADER_HEIGHT = 70;
/** 시트 헤더와 토스트 사이 여백 */
export const SHEET_TOAST_GAP = 12;

/**
 * 핀 상세 시트가 열린 화면에서 토스트를 놓을 `top` 값.
 *   `containerHeight` 는 시트의 기준 컨테이너(= 탭 화면이 그려지는 높이, 390×844 웹에서는 844)입니다.
 *   시트 상단(높이의 14%) + 헤더 높이 + 여백 → 헤더의 분류 색과 겹치지 않습니다.
 */
export function toastTopBelowSheetHeader(containerHeight, gap = SHEET_TOAST_GAP) {
  const height = Number(containerHeight) > 0 ? Number(containerHeight) : 844;
  const sheetTop = Math.round((1 - SHEET_MAX_HEIGHT_RATIO) * height);
  return sheetTop + SHEET_HEADER_HEIGHT + (Number(gap) >= 0 ? Number(gap) : SHEET_TOAST_GAP);
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 50,
  },
  pill: {
    backgroundColor: 'rgba(17,24,39,0.94)',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pillPro: {
    backgroundColor: colors.brand,
  },
  text: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
