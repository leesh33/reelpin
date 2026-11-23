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
 *   · 머리 : 다크 차콜 바 — 딥 틸 원 아이콘 + 제목 + 반투명 흰 원 `✕`
 *            v2.32.2 — 상훈 님 요청: "레이어 팝업에 있는 그런 텍스트들은 다 빼자"
 *            → 헤더 아래 보조줄(`sub`, 개수·설명 안내)을 **아예 그리지 않습니다**. 제목 + ✕ 만.
 *            (`onBack` 을 주면 아이콘 자리가 `‹` 화살표 하나로 바뀝니다 — 서브 페이지)
 *            v2.19.2 — 상훈 님 요청 "레이어팝업의 뒤로 버튼의 한글은 없애줘(< 만 나오게)"
 *            → 화면에는 `‹` 만. 읽어 주는 이름은 `accessibilityLabel`(기본 `뒤로`)에 그대로 남습니다.
 *   · 본문 : `children` (스크롤은 부르는 쪽이 만듭니다)
 *   · 발끝 : `footer` (선택)
 *
 * v2.36.0 — 상훈 님 요청: "목록 보기 알림 내 정보는 레이어팝업 형태로 띄우는 거니까
 *   헤더를 아래로 스와이프 했을 때 아래로 접히는 걸로 하자"
 *   → 헤더(아이콘 + 제목 + ✕ 줄)를 아래로 끌면 손가락을 따라 내려오고, 충분히 내리면
 *     접혀 닫힙니다. 본문도 **스크롤 맨 위**에서 당기면 같은 방식으로 닫힙니다.
 *     판정 규칙·손맛은 장소 상세 시트와 같은 `utils/sheetDismiss.js` · `useSheetSwipeDismiss.js`.
 *     ✕ 버튼 탭·본문 스크롤·탭은 예전 그대로입니다.
 *
 * v2.36.1 — 상훈 님 요청: "레이어 팝업 상단에도 핸들바(그립 막대)를 넣어 달라"
 *   → 헤더 줄(아이콘 + 제목 + ✕) **바로 위**에 장소 상세 시트(`PinDetailSheet`)와 같은 그립 막대를
 *     넣었습니다 — 42×4 · 둥글기 2 · 반투명 흰색(`rgba(255,255,255,0.45)`) · 아래 여백 12.
 *     막대는 헤더와 **같은 다크 차콜 판** 안에 있어서, 막대를 잡고 아래로 끌어도 그대로 닫힙니다
 *     (`headerPanHandlers` 가 막대까지 덮습니다). 쓰는 화면(목록 보기·알림 모음·내 정보 등)은
 *     아무것도 바꾸지 않아도 됩니다.
 */
import React from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow } from '../theme';
// v2.42 — 시트가 화면 맨 아래(홈 인디케이터 자리)까지 내려오므로, 발끝 버튼은 이만큼 띄웁니다.
import { useBottomLift } from '../utils/safeArea';
import { SheetBodyScrollScope, useSheetSwipeDismiss } from './useSheetSwipeDismiss';

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
  // 서브 페이지 — 주면 헤더가 `‹` + 서브 제목으로 바뀝니다 (한글 라벨은 화면에 그리지 않음)
  onBack = null,
  backLabel = '뒤로',
  closeLabel = '닫기',
  children = null,
  footer = null,
  // v2.33.0 — 지도 꾹 눌러 장소 등록 시트처럼 **위쪽 지도가 보여야 하는** 화면은
  //           낮은 높이(66%)를 넘깁니다. 값을 주지 않으면 예전 그대로 86% 입니다.
  height = SHEET_HEIGHT,
  // 검사·딥링크용 이름 (기존 화면의 testID 를 그대로 넘길 수 있게)
  overlayTestID = '',
  testID = 'layer-sheet',
  headerTestID = '',
  titleTestID = '',
  closeTestID = '',
  backTestID = '',
  zIndex = 45,
  // v2.36.0 — 헤더를 아래로 쓸어내려 닫기 (기본 켜짐 · 필요 없는 화면은 false)
  swipeToClose = true,
}) {
  const dismiss = useSheetSwipeDismiss({ onClose, visible, enabled: swipeToClose });
  // v2.42 — 아래 안전 영역(홈 인디케이터)만큼 발끝 버튼([담기]·[저장])을 올립니다.
  const bottomLift = useBottomLift();

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
      <Animated.View
        style={[
          styles.sheet,
          height !== SHEET_HEIGHT ? { height } : null,
          { transform: [{ translateY: dismiss.translateY }] },
        ]}
        testID={testID}
        onLayout={dismiss.onSheetLayout}
      >
        <View
          style={styles.sheetHead}
          testID={headerTestID || testID + '-header'}
          accessibilityHint="아래로 쓸어내리면 닫혀요"
          {...dismiss.headerPanHandlers}
        >
          {/* v2.36.1 — 쓸어내려 닫히는 시트임을 보여 주는 그립 막대 (장소 상세 시트와 같은 모양) */}
          <View style={styles.handle} testID={testID + '-handle'} />
          <View style={styles.headRow}>
            {typeof onBack === 'function' ? (
              <Pressable
                style={styles.backBtn}
                onPress={onBack}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={backLabel}
                testID={backTestID || testID + '-back'}
              >
                <Ionicons name="chevron-back" size={20} color={colors.white} />
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
        </View>

        <SheetBodyScrollScope reportScrollY={dismiss.reportBodyScroll}>
          <View style={styles.body} {...dismiss.bodyPanHandlers}>
            {children}
          </View>
        </SheetBodyScrollScope>

        {footer ? <View style={[styles.footer, bottomLift ? { paddingBottom: bottomLift } : null]}>{footer}</View> : null}
      </Animated.View>
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
    backgroundColor: colors.charcoal,
    paddingHorizontal: 16,
    // v2.36.1 — 막대(10) + 막대 아래 여백(12) 만큼 위를 줄여 헤더 전체 높이는 예전과 비슷하게
    paddingTop: 8,
    paddingBottom: 13,
    // v2.36.0 — 헤더를 잡고 아래로 끌 때 브라우저 스크롤·줌이 먼저 가로채지 않게 (웹 아이폰 사파리)
    ...(Platform.OS === 'web' ? { cursor: 'grab', touchAction: 'none' } : null),
  },
  // v2.36.1 — 그립 막대: 장소 상세 시트(PinDetailSheet)의 handle 과 같은 값
  //           (42×4 · 둥글기 2 · 반투명 흰색 · 아래 여백 12) — 두 시트가 같은 손맛으로 보입니다.
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginBottom: 12,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    // v2.19.2 — 화면에는 `‹` 하나. 아이콘만 보이지만 누를 수 있는 넓이는 30px 로 유지합니다.
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
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
