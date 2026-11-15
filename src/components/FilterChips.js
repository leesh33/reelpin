import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
 * v2.4 — 분류마다 고유 색
 *
 *   · 분류 칩에는 그 분류의 **컬러 점**이 붙고, 켜지면(active) **그 분류 색 배경 + 흰 글씨**
 *     → 색만 봐도 지금 어떤 분류를 보고 있는지 알 수 있고, 지도 핀 색과 정확히 같은 색입니다
 *   · `전체` 칩은 지금까지처럼 코랄로 켜집니다
 */
export default function FilterChips({
  value,
  onChange,
  counts,
  categories = DEFAULT_CATEGORIES,
  onDark = true,
}) {
  const options = filterOptions(categories);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
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
              onDark ? styles.chipDark : styles.chipLight,
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
            <Text
              style={[
                styles.text,
                onDark ? styles.textDark : styles.textLight,
                on && styles.textOn,
              ]}
              numberOfLines={1}
            >
              {count != null ? f + ' ' + count : f}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipDark: {
    backgroundColor: 'rgba(20,31,53,0.86)',
    borderColor: colors.navyLine,
  },
  chipLight: {
    backgroundColor: colors.card,
    borderColor: colors.line,
  },
  // '전체' — 지금까지처럼 코랄로 켜집니다.
  chipAllOn: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
  textDark: {
    color: '#B9C2D4',
  },
  textLight: {
    color: colors.textSub,
  },
  textOn: {
    color: colors.white,
  },
});
