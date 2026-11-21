import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

/**
 * 릴스핀 공통 상단 헤더 (v2.16 · 호갱노노식)
 *
 * 상훈 님 요청: "호갱노노 상단 헤더 영역처럼 … 왼쪽 상단에는 릴스핀 로고를 넣고
 *               우측 상단에는 돋보기 버튼 알림 짝대기 3개"
 *
 *   · 왼쪽  : 주황 핀 + `Reelspin` + 지금 보고 있는 탭 뱃지(`지도` / `저장` / `컬렉션`)
 *   · 오른쪽: 🔔 알림 모음(반경 500m 안 저장 장소 숫자 뱃지)
 *             ☰ 짝대기 3개(메뉴 — 예전 👤 로그인 알약/아바타를 이 안으로 통합, 로그인 상태면 초록 점)
 *             ✕ 저장 탭에서 지도로 돌아가기 (onPressClose 를 넘긴 화면만)
 *
 * v2.35.0 — 오른쪽 첫 칸의 🔍 돋보기를 없앴습니다. 지도 화면에 **상시 노출 통합 검색창**
 *   (`MapSearchBar` · 분류 칩 바로 위)이 생겨서, 헤더 돋보기로 한 단계 들어가 검색하던
 *   길과 중복되기 때문입니다(상훈 님 요청). 알림·메뉴는 그대로입니다.
 *
 * 세 탭이 **같은 컴포넌트**를 쓰므로 색·높이·여백이 어긋날 수 없습니다.
 * (v2.11 부터 쓰던 저장 화면의 다크 차콜 #1C1C1E 헤더를 그대로 이어받았습니다.)
 */

/** 🔔 뱃지에 쓸 숫자 — 0이면 뱃지를 그리지 않고, 9곳을 넘으면 `9+` */
export function alertBadgeLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 9 ? '9+' : String(Math.floor(n));
}

/** 헤더 뱃지에 쓸 수 있는 탭 이름 (오타 방지용) */
// v2.19 — 하단 탭은 `지도 · 저장 · 컬렉션` (내 정보는 헤더 ☰ 시트로 머지)
export const HEADER_TABS = ['지도', '저장', '컬렉션'];

/** 헤더 오른쪽 아이콘 순서 — 화면 폭 계산·검사에 쓰는 단일 출처 (v2.35.0: 🔍 제거) */
export const HEADER_ACTIONS = ['alerts', 'menu'];

export default function AppHeader({
  badge = '지도',
  onPressAlerts,
  alertCount = 0,
  onPressMenu,
  signedIn = false,
  onPressClose,
  closeLabel = '닫기',
  showAlerts = true,
  showMenu = true,
}) {
  const countLabel = alertBadgeLabel(alertCount);
  return (
    <View style={styles.header} testID="app-header">
      <View style={styles.brand}>
        <View style={styles.brandPin}>
          <Ionicons name="location" size={16} color={colors.white} />
        </View>
        <Text style={styles.brandText}>Reelspin</Text>
        <View style={styles.brandBadge}>
          <Text style={styles.brandBadgeText}>{badge}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {showAlerts && (
          <Pressable
            style={styles.iconBtn}
            onPress={onPressAlerts}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              countLabel ? '알림 모음 · 반경 500m 안 ' + alertCount + '곳' : '알림 모음'
            }
            testID="header-alerts"
          >
            <Ionicons name="notifications-outline" size={18} color={colors.white} />
            {countLabel ? (
              <View style={styles.alertBadge} testID="header-alert-badge">
                <Text style={styles.alertBadgeText}>{countLabel}</Text>
              </View>
            ) : null}
          </Pressable>
        )}

        {showMenu && (
          <Pressable
            style={styles.iconBtn}
            onPress={onPressMenu}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="메뉴"
            testID="header-menu"
          >
            <Ionicons name="menu" size={20} color={colors.white} />
            {signedIn ? <View style={styles.menuDot} testID="header-menu-dot" /> : null}
          </Pressable>
        )}

        {onPressClose ? (
          <Pressable
            style={styles.iconBtn}
            onPress={onPressClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            testID="header-close"
          >
            <Ionicons name="close" size={18} color={colors.white} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 13,
    backgroundColor: colors.charcoal,
    borderBottomWidth: 1,
    borderBottomColor: colors.charcoalLine,
    // 본문이 다크 헤더 '밑으로' 들어가는 게 보이게 얇은 그림자를 드리웁니다.
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    zIndex: 3,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  brandPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.4,
  },
  brandBadge: {
    backgroundColor: colors.charcoalPill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  brandBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.charcoalSub,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 다크 헤더 위 반투명 필 — 🔔·☰·✕ 아이콘의 기본 모양 (흰색 라인 아이콘)
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.charcoalPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ☰ 오른쪽 아래 초록 점 = 로그인 상태
  menuDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.visit,
    borderWidth: 1.5,
    borderColor: colors.charcoal,
  },
  // 🔔 반경 500m 안 저장 장소 개수
  alertBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.charcoal,
  },
  alertBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
});
