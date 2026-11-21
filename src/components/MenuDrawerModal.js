/**
 * src/components/MenuDrawerModal.js — v2.19.1 ☰ 메뉴 = 「내 정보」 통합 시트
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청:
 *   "내정보는 헤더 우측 상단의 짝대기 3개와 머지함."
 *   "4. 내정보 화면 안에 알림 설정 추가"
 *
 * v2.16 의 ☰ 메뉴와 v2.18 의 「내 정보」 탭을 **하나의 시트**로 합친 화면입니다.
 * v2.19.1 부터는 시트 틀을 `LayerSheet` 한 컴포넌트로 씁니다 — 돋보기·알림모음·목록보기도
 * 같은 틀이라 **높이(86%)·딤·모서리·헤더·바깥 탭 닫기**가 모두 같습니다.
 *
 *   · 머리  : 다크 차콜 바 — ☰ 아이콘 + `내 정보` + ✕
 *             (v2.32.2 — 상훈 님 "레이어 팝업에 있는 그런 텍스트들은 다 빼자" → 보조줄 없음)
 *             서브 페이지에 들어가면 같은 자리가 `‹ 뒤로` + 서브 제목으로 바뀝니다
 *   · 본문  : ProfileScreen(panel)
 *             ① 통합 계정·클라우드 동기화 카드
 *             ② 저장한 장소(저장 요약) & 내 지도 공유하기
 *             ③ 설정 목록 — 분류 관리 · 지오펜스 알림 반경 · 알림 설정 · 제안 · 버그 제보
 *                · 개인정보처리방침 · 이용약관 · 앱 정보 · (관리자면) 어드민
 *                · (로그인했으면) 회원탈퇴 — v2.40.0 · App Store 5.1.1(v)
 *   · 발끝  : 없음 (v2.40.0 — 상훈 님 요청: 하단 고정 `버전 · 개인정보처리방침 · 이용약관` 푸터 제거.
 *             법적 고지는 메뉴 행으로, 버전은 `앱 정보` 행에서 보입니다)
 *
 * 서브 페이지는 **시트 안에서** 열리고 `‹ 뒤로` 로 원래 목록으로 돌아옵니다.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import ProfileScreen, {
  AlertsSetting,
  AppInfoCard,
  CategoryManager,
  RadiusSetting,
  SUB_PAGES,
} from '../screens/ProfileScreen';
// v2.20.1 — 로그아웃 상태에 '이상훈 / @odol' 이 뜨지 않도록 이름은 계정에서만 가져옵니다
import { profileIdentity } from '../utils/profileIdentity';
import LayerSheet from './LayerSheet';
import { useSheetBodyScroll } from './useSheetSwipeDismiss';

export const APP_VERSION_LABEL = '릴스핀 v2.40.0';

/** ☰ 시트에서 열리는 서브 페이지 키 (검사·딥링크용 단일 출처) */
export const MENU_SUB_KEYS = ['categories', 'radius', 'alerts', 'about'];

// 2026-11-20 — 법적 고지(개인정보처리방침 · 이용약관)는 `src/utils/legal.js` 한 곳에서 옵니다.
// v2.40.0 — 시트 발끝 푸터를 없애고, 두 문서는 `내 정보` 설정 목록의 별도 행에서 열립니다
//   (그 행은 ProfileScreen 이 그립니다 — 로그인 카드와 같은 주소·같은 문구).
export { LEGAL_BASE_URL, LEGAL_LINKS, legalPageUrl, openLegalPage } from '../utils/legal';

export default function MenuDrawerModal({
  visible,
  onClose,
  pins = [],
  name = '',
  handle = '',
  categories = [],
  cloudConfigured = false,
  cloudPinCount = 0,
  cloudSyncing = false,
  cloudMessage = '',
  cloudUser = null,
  cloudBusy = false,
  radiusMeters = 300,
  isPro = false,
  // v2.21 🛡️ 관리자 계정에만 어드민 진입점을 보여 줍니다.
  isAdminAccount = false,
  onGoAdmin = null,
  // v2.23 💬 제안 · 버그 제보 게시판 (내 정보 > 앱 정보 아래)
  onOpenFeedback = null,
  // v2.40.0 🗑️ 회원탈퇴 (내 정보 맨 아래 · 로그인한 계정만)
  onDeleteAccount = null,
  // v2.19.1 — 🔔 알림 설정 (반경 내 알림 ON/OFF)
  alertsOn = false,
  notifyPermission = 'default',
  onToggleAlerts,
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
  // null | 'categories' | 'radius' | 'alerts' | 'about'
  const [sub, setSub] = useState(() => (SUB_PAGES[initialSub] ? initialSub : null));
  // v2.36.0 — 서브 페이지 스크롤이 맨 위일 때도 헤더처럼 아래로 당겨 시트를 닫습니다
  const sheetScroll = useSheetBodyScroll();

  // v2.20.1 — 넘겨받은 이름이 없으면 **로그인한 계정**에서만 만듭니다.
  //   로그아웃이면 둘 다 '' → ProfileScreen 이 `게스트` 로 그립니다.
  const identity = profileIdentity(cloudUser);
  const profileName = String(name || '').trim() || identity.name;
  const profileHandle = String(handle || '').trim().replace(/^@+/, '') || identity.handle;

  // 시트를 닫으면 다음에 열 때는 항상 목록(내 정보)부터 보여 줍니다.
  useEffect(() => {
    if (!visible) setSub(null);
  }, [visible]);

  const subPage = sub && SUB_PAGES[sub] ? SUB_PAGES[sub] : null;

  let body = null;
  if (sub === 'categories') {
    body = (
      <ScrollView
        style={styles.body}
        {...sheetScroll}
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
    );
  } else if (sub === 'radius') {
    body = (
      <ScrollView
        style={styles.body}
        {...sheetScroll}
        contentContainerStyle={styles.subBody}
        showsVerticalScrollIndicator={false}
        testID="menu-sub-radius"
      >
        <RadiusSetting radiusMeters={radiusMeters} onChangeRadius={onChangeRadius} />
      </ScrollView>
    );
  } else if (sub === 'alerts') {
    body = (
      <ScrollView
        style={styles.body}
        {...sheetScroll}
        contentContainerStyle={styles.subBody}
        showsVerticalScrollIndicator={false}
        testID="menu-sub-alerts"
      >
        <AlertsSetting
          alertsOn={alertsOn}
          onToggleAlerts={onToggleAlerts}
          radiusMeters={radiusMeters}
          notifyPermission={notifyPermission}
          onOpenRadius={() => setSub('radius')}
        />
      </ScrollView>
    );
  } else if (sub === 'about') {
    body = (
      <ScrollView
        style={styles.body}
        {...sheetScroll}
        contentContainerStyle={styles.subBody}
        showsVerticalScrollIndicator={false}
        testID="menu-sub-about"
      >
        <AppInfoCard cloudUser={cloudUser} />
      </ScrollView>
    );
  } else {
    body = (
      <ProfileScreen
        panel
        name={profileName}
        handle={profileHandle}
        pins={pins}
        categories={categories}
        onAddCategory={onAddCategory}
        onRenameCategory={onRenameCategory}
        onRemoveCategory={onRemoveCategory}
        radiusMeters={radiusMeters}
        onChangeRadius={onChangeRadius}
        alertsOn={alertsOn}
        notifyPermission={notifyPermission}
        onToggleAlerts={onToggleAlerts}
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
        isAdminAccount={isAdminAccount}
        onGoAdmin={onGoAdmin}
        onOpenFeedback={onOpenFeedback}
        onDeleteAccount={onDeleteAccount}
        onSignIn={onSignIn}
        onSignUp={onSignUp}
        onMagicLink={onMagicLink}
        onOAuth={onOAuth}
        onSignOut={onSignOut}
        onSyncNow={onSyncNow}
        onOpenSub={setSub}
        onShareMap={onShareMap}
      />
    );
  }

  return (
    <LayerSheet
      visible={visible}
      onClose={onClose}
      icon="menu"
      title={subPage ? subPage.title : '내 정보'}
      onBack={subPage ? () => setSub(null) : null}
      closeLabel="메뉴 닫기"
      overlayTestID="menu-drawer-overlay"
      testID="menu-drawer"
      headerTestID="menu-drawer-header"
      titleTestID="menu-title"
      closeTestID="menu-drawer-close"
      backTestID="menu-sub-back"
      zIndex={45}
    >
      {subPage ? (
        body
      ) : (
        <View style={styles.body} testID="menu-profile-body">
          {body}
        </View>
      )}
    </LayerSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  subBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
});
