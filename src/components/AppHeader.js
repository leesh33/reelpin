import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

/**
 * 릴스핀 공통 상단 헤더 (v2.15)
 *
 * 상훈 님 요청: "지도탭과 내정보 탭에도 저장에 있는 상단 까만 헤더(Reelspin)를 넣는 건 어떨까?
 *               헤더 우측에는 로그인+알림 모음 아이콘을 넣고"
 *
 *   · 왼쪽  : 주황 핀 + `Reelspin` + 지금 보고 있는 탭 뱃지(`지도` / `저장` / `내 정보`)
 *   · 오른쪽: 🔔 알림 모음(반경 500m 안 저장 장소가 있으면 주황 숫자 뱃지)
 *             👤 계정(비로그인 = `로그인` 알약 · 로그인 = 이니셜 아바타 + 초록 점)
 *             ✕ 저장 탭에서 지도로 돌아가기 (onPressClose 를 넘긴 화면만)
 *
 * 세 탭이 **같은 컴포넌트**를 쓰므로 색·높이·여백이 어긋날 수 없습니다.
 * (v2.11 부터 쓰던 저장 화면의 다크 차콜 #1C1C1E 헤더를 그대로 옮겨 온 것입니다.)
 */

/** 🔔 뱃지에 쓸 숫자 — 0이면 뱃지를 그리지 않고, 9곳을 넘으면 `9+` */
export function alertBadgeLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 9 ? '9+' : String(Math.floor(n));
}

/** 헤더 뱃지에 쓸 수 있는 탭 이름 (오타 방지용) */
export const HEADER_TABS = ['지도', '저장', '내 정보'];

export default function AppHeader({
  badge = '지도',
  onPressAlerts,
  alertCount = 0,
  onPressAccount,
  signedIn = false,
  accountInitial = '',
  onPressClose,
  closeLabel = '닫기',
  showAlerts = true,
  showAccount = true,
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

        {showAccount && (
          <Pressable
            style={[styles.iconBtn, signedIn ? styles.accountBtn : styles.loginBtn]}
            onPress={onPressAccount}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={signedIn ? '계정 · 내 정보로 이동' : '로그인 · 내 정보로 이동'}
            testID="header-account"
          >
            {signedIn ? (
              <>
                <Text style={styles.accountInitial} numberOfLines={1}>
                  {accountInitial || '나'}
                </Text>
                <View style={styles.accountDot} testID="header-account-dot" />
              </>
            ) : (
              <>
                <Ionicons name="person-outline" size={13} color={colors.white} />
                <Text style={styles.loginText}>로그인</Text>
              </>
            )}
          </Pressable>
        )}

        {onPressClose ? (
          <Pressable
            style={styles.closeBtn}
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
    paddingHorizontal: 20,
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
    backgroundColor: colors.coral,
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
    gap: 7,
  },
  // 다크 헤더 위 반투명 필 — 알림·계정 아이콘의 기본 모양
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.charcoalPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 비로그인: 유저 아이콘 + `로그인` (알약)
  loginBtn: {
    width: 'auto',
    flexDirection: 'row',
    paddingHorizontal: 10,
    gap: 4,
  },
  loginText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  // 로그인: 이니셜 아바타 + 오른쪽 아래 초록 점
  accountBtn: {
    backgroundColor: colors.charcoalPill,
  },
  accountInitial: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  accountDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
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
    backgroundColor: colors.coral,
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
  // 다크 헤더 위 닫기 — 반투명 흰 원 + 흰 ✕ (모달 헤더와 같은 규칙)
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.charcoalPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
