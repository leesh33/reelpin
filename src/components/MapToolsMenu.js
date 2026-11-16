/**
 * src/components/MapToolsMenu.js — v2.17.1
 * ─────────────────────────────────────────────────────────────
 * 지도 **왼쪽 하단**의 펼침 메뉴 — 상훈 님 요청:
 *   "미방문 아이콘, 가봤어요 아이콘, 지도 공유 버튼은 지도 왼쪽 하단에 버튼을 두고
 *    누르면 아래 두 개가 펼쳐지면서 기능들을 할 수 있게 해 줘
 *      가본곳만 보기 Y/N on off
 *      지도 공유 하기 버튼"  (v2.17)
 *   "주변 500m 보기 버튼도 지도 왼쪽 하단의 버튼 안으로 넣을 수 있을까?"  (v2.17.1)
 *
 * v2.17 에서 지도 상단의 두 번째 줄(`전체 / ○ 미방문 / ✓ 가봤어요`)과
 * 오른쪽 스택의 `지도 공유` 를 없애고, 그 두 기능을 **이 버튼 하나**로 모았습니다.
 * v2.17.1 에서 오른쪽 스택의 `주변 500m` 까지 이 카드 안으로 들어옵니다.
 *
 *   [5 / 5 핀 표시 중]  ← 개수 요약(칩이 아니라 회색 알약)
 *   ┌──────────────────────┐
 *   │ 가본 곳만 보기   ( ●) │  ← Y/N 스위치 (켜면 visited === true 핀만)
 *   │ 가본 곳 2곳 / 전체 5곳 │
 *   │ ──────────────────── │
 *   │ 🏪 주변 500m 보기  ›  │  ← 반경 500m 패널 열기/닫기 (기존 toggleNearby 그대로)
 *   │ 반경 500m 안 2곳       │
 *   │ ──────────────────── │
 *   │ ↗ 지도 공유하기       │  ← 기존 shareMyMap 그대로
 *   └──────────────────────┘
 *                    [🎛]      ← 토글 버튼(켜져 있으면 코랄 + `가본 곳만` 표시)
 *
 * · 세로 column(아래 끝 고정)으로 쌓아 **개수 알약 · 카드 · 버튼이 절대 겹치지 않습니다.**
 * · 카드는 위로 펼쳐지고(150ms 페이드 + 살짝 올라오기), 버튼을 다시 누르거나
 *   지도(메뉴 밖)를 누르면 접힙니다. 접히면 카드는 아예 그리지 않습니다(빈 곳 탭 방지).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, tabBar, typography } from '../theme';

/** 카드가 펼쳐지는 애니메이션 길이(ms) */
export const TOOLS_ANIM_MS = 150;

/** 토글 버튼 크기(오른쪽 '내 위치' FAB 과 같은 결) */
export const TOOLS_TOGGLE_SIZE = 44;

/**
 * 개수 요약 알약 문구 — 'N / N 핀 표시 중' (가본 곳만 켜져 있으면 '가본 곳만 N / M').
 * (예전 MapScreen 안에 있던 countText 규칙을 그대로 옮겨 왔습니다)
 */
export function toolsSummary({ filteredCount = 0, totalCount = 0, visitFilter = '전체' } = {}) {
  if (visitFilter === '가봤어요') return '가본 곳만 ' + filteredCount + ' / ' + totalCount;
  if (visitFilter === '미방문') return '미방문 ' + filteredCount + ' / ' + totalCount;
  return filteredCount + ' / ' + totalCount + ' 핀 표시 중';
}

export default function MapToolsMenu({
  open = false,
  visitedOnly = false,
  visitedCount = 0,
  totalCount = 0,
  summary = '',
  // v2.17.1 — 주변 500m 보기 (오른쪽 스택에서 이 카드 안으로)
  nearbyOpen = false,
  nearbyCount = 0,
  nearbyRadius = 500,
  hasMyCoords = false,
  onPressNearby,
  onToggleOpen,
  onToggleVisited,
  onShare,
}) {
  const nearbySub = nearbyOpen
    ? '반경 ' + nearbyRadius + 'm · ' + nearbyCount + '곳 보는 중'
    : hasMyCoords
    ? '반경 ' + nearbyRadius + 'm 안 ' + nearbyCount + '곳'
    : '내 위치를 켜면 가까운 순으로';
  // 켜져 있을 때는 문구로도 상태를 분명히 — 스위치 모양만 보고 헷갈리지 않게
  const visitedSub = visitedOnly
    ? '가본 곳 ' + visitedCount + '곳만 보는 중'
    : '가본 곳 ' + visitedCount + '곳 / 전체 ' + totalCount + '곳';
  // 카드 등장 — 접힘 상태에서는 그리지 않으므로, 열릴 때 0 → 1 로 살짝 올라오며 나타납니다.
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) return undefined;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: TOOLS_ANIM_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false, // 웹(아이폰 사파리)에서도 그대로 동작하도록 JS 드라이버
    }).start();
    return undefined;
  }, [open, progress]);

  const cardStyle = {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
      },
    ],
  };

  return (
    <View style={styles.col}>
      {!!summary && (
        <View style={styles.summaryPill} pointerEvents="none" testID="map-tools-summary">
          <View style={styles.summaryDot} />
          <Text style={styles.summaryText} numberOfLines={1}>
            {summary}
          </Text>
        </View>
      )}

      {open && (
        <Animated.View style={[styles.card, cardStyle]} testID="map-tools-menu">
          <View style={styles.row}>
            <View style={styles.labelWrap}>
              <Text style={styles.label}>가본 곳만 보기</Text>
              <Text style={[styles.subLabel, visitedOnly && styles.subLabelOn]} numberOfLines={1}>
                {visitedSub}
              </Text>
            </View>
            <Pressable
              style={[styles.switch, visitedOnly && styles.switchOn]}
              onPress={onToggleVisited}
              accessibilityRole="switch"
              accessibilityState={{ checked: visitedOnly }}
              // 웹(react-native-web)은 accessibilityState 만으로 aria-checked 를 그리지 않아
              // 스크린리더가 on/off 를 못 읽습니다 → aria-checked 를 직접 넘깁니다.
              aria-checked={visitedOnly}
              accessibilityLabel={visitedOnly ? '가본 곳만 보기 끄기' : '가본 곳만 보기 켜기'}
              testID="map-tools-visited"
            >
              <View style={[styles.knob, visitedOnly && styles.knobOn]} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          {/* v2.17.1 — 주변 500m 보기: 오른쪽 스택 버튼을 이 카드 안으로 옮겼습니다.
              누르면 카드를 접고 기존 반경 500m 패널을 그대로 열고/닫습니다. */}
          <Pressable
            style={({ pressed }) => [styles.nearbyRow, pressed && styles.nearbyRowPressed]}
            onPress={onPressNearby}
            accessibilityRole="button"
            accessibilityState={{ expanded: nearbyOpen }}
            accessibilityLabel={'반경 ' + nearbyRadius + 'm 주변 보기'}
            testID="map-tools-nearby"
          >
            <View style={styles.nearbyIcon}>
              <Ionicons name="storefront-outline" size={14} color={colors.coral} />
            </View>
            <View style={styles.nearbyTextWrap}>
              <Text style={styles.nearbyLabel}>{'주변 ' + nearbyRadius + 'm 보기'}</Text>
              <Text style={styles.nearbySub} numberOfLines={1}>
                {nearbySub}
              </Text>
            </View>
            <Ionicons
              name={nearbyOpen ? 'chevron-down' : 'chevron-forward'}
              size={14}
              color="#9FB0C8"
            />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={({ pressed }) => [styles.shareRow, pressed && styles.shareRowPressed]}
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel="지도 공유하기"
            testID="map-tools-share"
          >
            <Ionicons name="share-social-outline" size={15} color={colors.white} />
            <Text style={styles.shareText}>지도 공유하기</Text>
          </Pressable>
        </Animated.View>
      )}

      <Pressable
        style={[styles.toggle, visitedOnly && styles.toggleOn]}
        onPress={onToggleOpen}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? '지도 도구 접기' : '지도 도구 펼치기'}
        testID="map-tools-toggle"
      >
        <Ionicons name="options-outline" size={20} color={colors.white} />
        {visitedOnly && (
          <Text style={styles.toggleText} numberOfLines={1}>
            가본 곳만
          </Text>
        )}
        {visitedOnly && <View style={styles.toggleDot} testID="map-tools-dot" />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 아래 끝을 고정한 세로 스택 — 요약 알약 → (펼친 카드) → 토글 버튼
  // v2.18 — 플로팅 탭바가 화면 아래를 덮으므로, 그 위로 올려 겹치지 않게 합니다.
  col: {
    position: 'absolute',
    left: 12,
    bottom: tabBar.controlsBottom,
    alignItems: 'flex-start',
    gap: 8,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.navyLine,
  },
  summaryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.coral,
  },
  summaryText: {
    color: '#AEB9CC',
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    width: 198,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(20,31,53,0.97)',
    borderWidth: 1,
    borderColor: colors.navyLine,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  labelWrap: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    ...typography.h3,
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.white,
  },
  subLabel: {
    ...typography.tiny,
    fontSize: 10.5,
    marginTop: 2,
    color: '#9FB0C8',
  },
  // 켜져 있으면 '가본 곳 N곳만 보는 중' — 초록 글씨로 상태를 한 번 더 알립니다
  subLabelOn: {
    color: colors.visit,
    fontWeight: '800',
  },
  // v2.17.1 — 주변 500m 보기 행
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  nearbyRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  nearbyIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(255,90,54,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  nearbyLabel: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  nearbySub: {
    ...typography.tiny,
    fontSize: 10,
    marginTop: 1,
    color: '#9FB0C8',
  },
  switch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  switchOn: {
    backgroundColor: colors.visit,
    borderColor: colors.visit,
    alignItems: 'flex-end',
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  knobOn: {},
  divider: {
    height: 1,
    backgroundColor: colors.navyLine,
    marginVertical: 9,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.coral,
    justifyContent: 'center',
  },
  shareRowPressed: {
    backgroundColor: colors.coralDark,
  },
  shareText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: TOOLS_TOGGLE_SIZE,
    minWidth: TOOLS_TOGGLE_SIZE,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toggleOn: {
    backgroundColor: colors.visit,
    borderColor: colors.visit,
  },
  toggleText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  toggleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
});
