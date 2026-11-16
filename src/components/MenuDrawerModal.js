/**
 * src/components/MenuDrawerModal.js — v2.16
 * ─────────────────────────────────────────────────────────────
 * ☰ (짝대기 3개) → 메뉴 시트.
 *
 * 상훈 님 요청: "우측 상단에는 돋보기 버튼 알림 짝대기 3개 … 기존 우측의 👤 로그인 알약/아바타는
 *               ☰ 메뉴 안으로 깔끔하게 통합" — 그래서 헤더 오른쪽은 `🔍 · 🔔 · ☰` 세 아이콘만 남고,
 *               계정(로그인/동기화)은 이 메뉴 맨 위 카드로 옮겼습니다.
 *
 *   · 맨 위 : 계정 카드 — 비로그인 `[로그인 / 계정 연결]` → 내 정보 탭 계정 카드로
 *                            로그인   이메일 · 클라우드 동기화 상태(켜짐/N개)
 *   · 바로가기 : 분류 관리(내 정보) · 지도 공유
 *   · 요약     : 저장된 핀 N곳 · 가본 곳 M곳
 *   · 맨 아래 : 릴스핀 v2.17.0
 *
 * 알림 모음(AlertInbox)과 같은 다크 차콜 헤더 + 흰 본문 시트 규칙을 씁니다.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow, typography } from '../theme';

export const APP_VERSION_LABEL = '릴스핀 v2.17.0';

export default function MenuDrawerModal({
  visible,
  onClose,
  pins = [],
  signedIn = false,
  accountEmail = '',
  accountInitial = '',
  cloudConfigured = false,
  cloudPinCount = 0,
  cloudSyncing = false,
  cloudMessage = '',
  onOpenAccount,
  onOpenCategories,
  onShareMap,
}) {
  if (!visible) return null;

  const list = Array.isArray(pins) ? pins.filter(Boolean) : [];
  const savedCount = list.length;
  const visitedCount = list.filter((pin) => pin.visited === true).length;
  const todoCount = Math.max(0, savedCount - visitedCount);
  const initial = accountInitial || (accountEmail ? accountEmail.trim().charAt(0).toUpperCase() : '') || '나';
  const syncText = cloudSyncing
    ? '클라우드와 맞추는 중…'
    : cloudMessage
    ? cloudMessage
    : signedIn
    ? '클라우드 동기화 켜짐 · ' + (cloudPinCount || savedCount) + '개 저장됨'
    : cloudConfigured
    ? '로그인하면 다른 기기와도 같은 지도'
    : '지금은 기기 안에만 저장돼요';

  const rows = [
    {
      key: 'categories',
      icon: 'pricetags-outline',
      label: '분류 관리',
      sub: '분류 만들기 · 이름 바꾸기 · 지우기',
      onPress: onOpenCategories,
      testID: 'menu-categories',
    },
    {
      key: 'share',
      icon: 'share-social-outline',
      label: '지도 공유',
      sub: savedCount ? savedCount + '곳을 담은 링크 하나로 건네주기' : '공유할 핀이 아직 없어요',
      onPress: onShareMap,
      testID: 'menu-share',
    },
  ];

  return (
    <View style={styles.overlay} testID="menu-drawer-overlay">
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="메뉴 닫기"
      />
      <View style={styles.sheet} testID="menu-drawer">
        <View style={styles.sheetHead}>
          <View style={styles.headIcon}>
            <Ionicons name="menu" size={16} color={colors.white} />
          </View>
          <View style={styles.headText}>
            <Text style={styles.title}>메뉴</Text>
            <Text style={styles.sub} numberOfLines={1}>
              릴스핀 · 저장한 릴스 맛집 지도
            </Text>
          </View>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="메뉴 닫기"
            testID="menu-drawer-close"
          >
            <Ionicons name="close" size={18} color={colors.white} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          testID="menu-drawer-scroll"
        >
          {/* 계정 / 동기화 상태 카드 */}
          {signedIn ? (
            <View style={styles.accountCard} testID="menu-account-card">
              <View style={[styles.avatar, styles.avatarOn]}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={styles.accountText}>
                <Text style={styles.accountEmail} numberOfLines={1}>
                  {accountEmail || '로그인됨'}
                </Text>
                <Text style={styles.accountSub} numberOfLines={2}>
                  {syncText}
                </Text>
              </View>
              <Pressable
                style={styles.accountBtn}
                onPress={onOpenAccount}
                accessibilityRole="button"
                accessibilityLabel="계정 설정 · 내 정보로 이동"
                testID="menu-account-open"
              >
                <Text style={styles.accountBtnText}>설정</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.accountCard}
              onPress={onOpenAccount}
              accessibilityRole="button"
              accessibilityLabel="로그인 / 계정 연결"
              testID="menu-account-card"
            >
              <View style={styles.avatar}>
                <Ionicons name="person-outline" size={16} color={colors.textSub} />
              </View>
              <View style={styles.accountText}>
                <Text style={styles.accountEmail}>로그인 / 계정 연결</Text>
                <Text style={styles.accountSub} numberOfLines={2}>
                  {syncText}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
            </Pressable>
          )}

          {/* 바로가기 */}
          <View style={styles.rowGroup}>
            {rows.map((row, index) => (
              <Pressable
                key={row.key}
                style={[styles.row, index === 0 && styles.rowFirst]}
                onPress={row.onPress}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                testID={row.testID}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name={row.icon} size={15} color={colors.coralDark} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {row.sub}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>

          {/* 저장 요약 */}
          <View style={styles.summary} testID="menu-summary">
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{savedCount}</Text>
              <Text style={styles.summaryLabel}>저장된 핀</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryValue, styles.summaryVisited]}>{visitedCount}</Text>
              <Text style={styles.summaryLabel}>가본 곳</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{todoCount}</Text>
              <Text style={styles.summaryLabel}>안 가본 곳</Text>
            </View>
          </View>
        </ScrollView>

        <Text style={styles.version} testID="menu-version">
          {APP_VERSION_LABEL}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 45,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    maxHeight: '82%',
    paddingBottom: 16,
    ...sheetShadow,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.charcoal,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 13,
  },
  headIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sub: {
    color: colors.charcoalSub,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.charcoalPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOn: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  avatarText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  accountText: {
    flex: 1,
    minWidth: 0,
  },
  accountEmail: {
    ...typography.body,
    fontSize: 13.5,
    fontWeight: '800',
  },
  accountSub: {
    ...typography.tiny,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
  },
  accountBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.charcoal,
  },
  accountBtnText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  rowGroup: {
    marginTop: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    ...typography.body,
    fontSize: 13.5,
    fontWeight: '800',
  },
  rowSub: {
    ...typography.tiny,
    fontSize: 10.5,
    marginTop: 1,
  },
  summary: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.line,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
  },
  summaryVisited: {
    color: colors.visit,
  },
  summaryLabel: {
    ...typography.tiny,
    fontSize: 10,
  },
  version: {
    ...typography.tiny,
    fontSize: 10,
    textAlign: 'center',
    paddingTop: 8,
  },
});
