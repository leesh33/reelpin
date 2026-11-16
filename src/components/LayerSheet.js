/**
 * src/components/LayerSheet.js — v2.19.1
 * ─────────────────────────────────────────────────────────────
 * **레이어 팝업(바텀시트) 한 가지 틀** — 네 화면이 이 컴포넌트를 같이 씁니다.
 *
 * 상훈 님 요청(2026-11-17):
 *   "1. 돋보기 버튼 클릭 시 & 알림모음 버튼 클릭 시 화면은 내정보 화면의 레이어팝업 형태와
 *       동일하게 구현 (높이 및 배경 딤처리도 동일하게)"
 *   "2. 지도의 목록보기 버튼 클릭 시 화면도 1번과 동일하게 구현"
 *
 *   · `내 정보`(MenuDrawerModal) · `돋보기`(SearchOverlayModal) · `알림 모음`(AlertInbox) ·
 *     `목록 보기`(PinListView) 가 **모두 이 틀**을 씁니다 → 높이·딤·모서리·헤더·바깥 탭 닫기가
 *     구조적으로 어긋날 수 없습니다.
 *
 *   · 바깥 : 화면 전체를 덮는 어두운 딤(`SHEET_BACKDROP`) — 누르면 닫힙니다
 *   · 시트 : 화면 높이의 `SHEET_HEIGHT`(86%) · 위쪽 둥근 모서리(`radius.xxl`) · 시트 그림자
 *   · 머리 : 다크 차콜 바 — 코랄 원 아이콘 + 제목/보조줄 + 반투명 흰 원 `✕`
 *            (`onBack` 을 주면 아이콘 자리가 `‹ 뒤로` 로 바뀝니다 — 서브 페이지)
 *   · 본문 : `children` (스크롤은 부르는 쪽이 만듭니다)
 *   · 발끝 : `footer` (선택)
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow } from '../theme';

/** 시트 높이 — 내 정보 시트와 같은 값 (화면의 86%) */
export const SHEET_HEIGHT = '86%';
/** 딤 색 — 내 정보 시트와 같은 값 */
export const SHEET_BACKDROP_COLOR = 'rgba(15,23,42,0.55)';
/** 위쪽 모서리 반경 — 내 정보 시트와 같은 값 */
export const SHEET_CORNER_RADIUS = radius.xxl;

export default function LayerSheet({
  visible = true,
  onClose,
  icon = 'menu',
  iconSize = 16,
  title = '',
  sub = '',
  // 서브 페이지 — 주면 헤더가 `‹ 뒤로` + 서브 제목으로 바뀝니다
  onBack = null,
  backLabel = '뒤로',
  closeLabel = '닫기',
  children = null,
  footer = null,
  // 검사·딥링크용 이름 (기존 화면의 testID 를 그대로 넘길 수 있게)
  overlayTestID = '',
  testID = 'layer-sheet',
  headerTestID = '',
  titleTestID = '',
  closeTestID = '',
  backTestID = '',
  zIndex = 45,
}) {
  if (!visible) return null;

  return (
    <View style={[styles.overlay, { zIndex }]} testID={overlayTestID || testID + '-overlay'}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        testID={testID + '-backdrop'}
      />
      <View style={styles.sheet} testID={testID}>
        <View style={styles.sheetHead} testID={headerTestID || testID + '-header'}>
          {typeof onBack === 'function' ? (
            <Pressable
              style={styles.backBtn}
              onPress={onBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              testID={backTestID || testID + '-back'}
            >
              <Ionicons name="chevron-back" size={18} color={colors.white} />
              <Text style={styles.backText}>{backLabel}</Text>
            </Pressable>
          ) : (
            <View style={styles.headIcon}>
              <Ionicons name={icon} size={iconSize} color={colors.white} />
            </View>
          )}

          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={1} testID={titleTestID || undefined}>
              {title}
            </Text>
            {!!sub && (
              <Text style={styles.sub} numberOfLines={1}>
                {sub}
              </Text>
            )}
          </View>

          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            testID={closeTestID || testID + '-close'}
          >
            <Ionicons name="close" size={18} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.body}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SHEET_BACKDROP_COLOR,
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: colors.card,
    borderTopLeftRadius: SHEET_CORNER_RADIUS,
    borderTopRightRadius: SHEET_CORNER_RADIUS,
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
    minHeight: 0,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    backgroundColor: colors.card,
  },
});
