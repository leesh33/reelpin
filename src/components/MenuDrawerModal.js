/**
 * src/components/MenuDrawerModal.js — v2.19.0 ☰ 메뉴 = 「내 정보」 통합 시트
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청:
 *   "내정보는 헤더 우측 상단의 짝대기 3개와 머지함."
 *
 * v2.16 의 ☰ 메뉴(계정 카드 · 분류 관리 · 지도 공유 · 저장 요약)와
 * v2.18 의 「내 정보」 탭(통합 계정·동기화 카드 · 설정 3행 · 서브 페이지 · 프로 안내)을
 * **하나의 시트**로 합쳤습니다. 하단 탭에서 `내 정보` 는 없어졌습니다.
 *
 *   · 머리  : 다크 차콜 바 — ☰ 아이콘 + `내 정보` / `계정 · 동기화 · 설정` + ✕
 *             서브 페이지에 들어가면 같은 자리가 `‹ 뒤로` + 서브 제목으로 바뀝니다
 *   · 본문  : ProfileScreen(panel) — 통합 계정·클라우드 동기화 카드,
 *             설정 3행(`분류 관리` · `지오펜스 알림 반경` · `앱 정보`) → 서브 페이지,
 *             저장 요약(N / 가본 곳 / 안 가본 곳), 내 지도 공유, 프로 안내
 *   · 발끝  : 릴스핀 v2.19.0
 *
 * 서브 페이지는 **시트 안에서** 열리고 `‹ 뒤로` 로 원래 목록으로 돌아옵니다.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProfileScreen, {
  APP_INFO_VERSION,
  AppInfoCard,
  CategoryManager,
  RadiusSetting,
  SUB_PAGES,
} from '../screens/ProfileScreen';
import { colors, radius, sheetShadow } from '../theme';

export const APP_VERSION_LABEL = '릴스핀 v2.19.0';

/** ☰ 시트에서 열리는 서브 페이지 키 (검사·딥링크용 단일 출처) */
export const MENU_SUB_KEYS = ['categories', 'radius', 'about'];

export default function MenuDrawerModal({
  visible,
  onClose,
  pins = [],
  name = '이상훈',
  handle = 'odol',
  categories = [],
  cloudConfigured = false,
  cloudPinCount = 0,
  cloudSyncing = false,
  cloudMessage = '',
  cloudUser = null,
  cloudBusy = false,
  radiusMeters = 300,
  isPro = false,
  onSignIn,
  onSignUp,
  onMagicLink,
  onOAuth,
  onSignOut,
  onSyncNow,
  onAddCategory,
  onRenameCategory,
  onRemoveCategory,
  onChangeRadius,
  onStartPro,
  onGoPaste,
  onToast,
  onShareMap,
  // 검사·딥링크용 — 열자마자 서브 페이지를 보여 줍니다(기본 null)
  initialSub = null,
}) {
  // null | 'categories' | 'radius' | 'about'
  const [sub, setSub] = useState(() => (SUB_PAGES[initialSub] ? initialSub : null));

  // 시트를 닫으면 다음에 열 때는 항상 목록(내 정보)부터 보여 줍니다.
  useEffect(() => {
    if (!visible) setSub(null);
  }, [visible]);

  if (!visible) return null;

  const subPage = sub && SUB_PAGES[sub] ? SUB_PAGES[sub] : null;

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
          {subPage ? (
            <Pressable
              style={styles.backBtn}
              onPress={() => setSub(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="뒤로"
              testID="menu-sub-back"
            >
              <Ionicons name="chevron-back" size={18} color={colors.white} />
              <Text style={styles.backText}>뒤로</Text>
            </Pressable>
          ) : (
            <View style={styles.headIcon}>
              <Ionicons name="menu" size={16} color={colors.white} />
            </View>
          )}

          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={1} testID="menu-title">
              {subPage ? subPage.title : '내 정보'}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {subPage ? '☰ 메뉴 · ' + (sub === 'categories' ? '분류 만들기 · 이름 바꾸기 · 지우기' : sub === 'radius' ? '저장한 곳에 가까워지면 알려드려요' : '버전 · 번들 ID · 데이터 저장') : '계정 · 동기화 · 설정'}
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

        {sub === 'categories' ? (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.subBody}
            showsVerticalScrollIndicator={false}
            testID="menu-sub-categories"
          >
            <CategoryManager
              hideTitle
              categories={categories}
              pins={pins}
              onAddCategory={onAddCategory}
              onRenameCategory={onRenameCategory}
              onRemoveCategory={onRemoveCategory}
              onToast={onToast}
            />
          </ScrollView>
        ) : null}

        {sub === 'radius' ? (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.subBody}
            showsVerticalScrollIndicator={false}
            testID="menu-sub-radius"
          >
            <RadiusSetting radiusMeters={radiusMeters} onChangeRadius={onChangeRadius} />
          </ScrollView>
        ) : null}

        {sub === 'about' ? (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.subBody}
            showsVerticalScrollIndicator={false}
            testID="menu-sub-about"
          >
            <AppInfoCard cloudUser={cloudUser} />
          </ScrollView>
        ) : null}

        {!subPage ? (
          <View style={styles.body} testID="menu-profile-body">
            <ProfileScreen
              panel
              name={name}
              handle={handle}
              pins={pins}
              categories={categories}
              onAddCategory={onAddCategory}
              onRenameCategory={onRenameCategory}
              onRemoveCategory={onRemoveCategory}
              radiusMeters={radiusMeters}
              onChangeRadius={onChangeRadius}
              isPro={isPro}
              onStartPro={onStartPro}
              onGoPaste={onGoPaste}
              onToast={onToast}
              cloudConfigured={cloudConfigured}
              cloudUser={cloudUser}
              cloudPinCount={cloudPinCount}
              cloudBusy={cloudBusy}
              cloudSyncing={cloudSyncing}
              cloudMessage={cloudMessage}
              onSignIn={onSignIn}
              onSignUp={onSignUp}
              onMagicLink={onMagicLink}
              onOAuth={onOAuth}
              onSignOut={onSignOut}
              onSyncNow={onSyncNow}
              onOpenSub={setSub}
              onShareMap={onShareMap}
            />
          </View>
        ) : null}

        <Text style={styles.version} testID="menu-version">
          {APP_VERSION_LABEL}
          {APP_INFO_VERSION === APP_VERSION_LABEL ? '' : ' · ' + APP_INFO_VERSION}
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
    height: '86%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    overflow: 'hidden',
    ...sheetShadow,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.charcoal,
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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    minWidth: 56,
    marginLeft: -4,
  },
  backText: {
    color: colors.white,
    fontSize: 13.5,
    fontWeight: '800',
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
    flex: 1,
  },
  subBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
  version: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
});
