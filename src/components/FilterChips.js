import React, { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import {
  CATEGORY_ALL,
  DEFAULT_CATEGORIES,
  filterOptions,
  getCategoryColor,
  matchesFilter,
} from '../utils/categories';

// v2.2 — 기본 3개. 실제 칩 목록은 화면이 넘긴 categories(기본 + 커스텀)로 그립니다.
export const FILTERS = [CATEGORY_ALL].concat(DEFAULT_CATEGORIES);

// 기존 화면·테스트가 FilterChips 에서 matchesFilter 를 가져다 써 왔습니다.
export { matchesFilter };

/**
 * 분류 필터 칩 — v2.18 에서 **네이버 지도의 분류 영역처럼 흰색 반투명 알약**으로 바뀌었습니다.
 *
 * 상훈 님 요청:
 *   "상단 분류 영역을 흰색 투명하게 해줘 (네이버지도의 분류 영역처럼)"
 *   "목록보기 버튼을 분류 맨 앞에 두고, 아이콘 형태로 변경해줘"
 *
 *   · 칩 = `rgba(255,255,255,0.90)` + 은은한 테두리·그림자 + **어두운 글씨**(`#1C1C1E`)
 *   · 칩마다 그 분류의 **컬러 점**이 붙고, 켜지면 그 분류 색 배경 + 흰 글씨
 *     (`전체` 칩은 브랜드 딥 틸) — 예전 어두운 남색 알약(`#1C1C1E` 계열)은 없어졌습니다
 *   · `onToggleView` 를 넘기면 가로 스크롤 **맨 앞(왼쪽 끝)** 에 같은 흰색 반투명
 *     **목록 아이콘 버튼**(☰)이 서고, 누르면 기존 목록 보기로 전환합니다
 *     (오른쪽 하단에 있던 주황 `목록 보기` 버튼은 없어졌습니다)
 */
export default function FilterChips({
  value,
  onChange,
  counts,
  categories = DEFAULT_CATEGORIES,
  onToggleView = null,
  countsLabel = null,
}) {
  const options = filterOptions(categories);
  /**
   * v2.44 — 390px 화면에서 4번째 칩('가볼곳 0')이 화면 밖으로 잘리고,
   *   가로로 더 넘길 수 있다는 표시도 없었습니다.
   *   → 칩 간격·여백을 조금 줄이고, 넘칠 때만 오른쪽에 `›` 힌트를 띄웁니다.
   */
  const [overflowing, setOverflowing] = useState(false);
  const scrollWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  return (
    <View style={styles.row}>
      {/* v2.18 — 분류 맨 앞 목록 아이콘 버튼 (칩과 같은 흰색 반투명 알약) */}
      {typeof onToggleView === 'function' ? (
        <Pressable
          style={({ pressed }) => [styles.listBtn, pressed && styles.listBtnPressed]}
          onPress={onToggleView}
          accessibilityRole="button"
          accessibilityLabel="목록 보기로 전환"
          testID="map-list-toggle"
        >
          <Ionicons name="list" size={19} color={colors.text} />
        </Pressable>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.chipRow}
        onLayout={(e) => {
          scrollWidthRef.current = e.nativeEvent.layout.width;
          setOverflowing(contentWidthRef.current > scrollWidthRef.current + 2);
        }}
        onContentSizeChange={(width) => {
          contentWidthRef.current = width;
          setOverflowing(width > scrollWidthRef.current + 2);
        }}
      >
        {options.map((f) => {
          const on = value === f;
          const count = counts ? counts[f] : null;
          const isAll = f === CATEGORY_ALL;
          const color = getCategoryColor(f, categories);
          return (
            <Pressable
              key={f}
              onPress={() => onChange(f)}
              style={[
                styles.chip,
                on && (isAll ? styles.chipAllOn : { backgroundColor: color, borderColor: color }),
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={f + ' 필터'}
              testID={'filter-chip-' + f}
            >
              {!isAll && (
                <View
                  style={[styles.dot, { backgroundColor: on ? colors.white : color }]}
                  testID={'filter-dot-' + f}
                />
              )}
              <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
                {count != null ? f + ' ' + count : f}
              </Text>
            </Pressable>
          );
        })}
        {countsLabel ? <Text style={styles.countsLabel}>{countsLabel}</Text> : null}
      </ScrollView>
      {overflowing ? (
        <View style={styles.moreHint} pointerEvents="none" testID="filter-chips-more">
          <Ionicons name="chevron-forward" size={12} color={colors.textSub} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  // v2.18 — 목록 아이콘 버튼 (칩 높이 33px 에 맞춘 정사각 알약)
  listBtn: {
    width: 34,
    height: 33,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    // 웹(아이폰 사파리)에서도 뒤 지도가 은은히 비치게
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : null),
  },
  listBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  scroll: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 18,
  },
  // 넘칠 때만 보이는 '›' — 가로로 더 넘길 수 있다는 표시
  moreHint: {
    position: 'absolute',
    right: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.90)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : null),
  },
  // '전체' — 브랜드 딥 틸로 켜집니다.
  chipAllOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.2,
  },
  textOn: {
    color: colors.white,
  },
  countsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    marginLeft: 4,
  },
});
